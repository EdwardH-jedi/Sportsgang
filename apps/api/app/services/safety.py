from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event, EventParticipant
from app.models.profile import UserProfile
from app.models.safety import REPORT_TARGET_TYPES, Block, Report
from app.models.user import User
from app.schemas.safety import (
    BlockListResponse,
    BlockResponse,
    CreateReportRequest,
    ReportListResponse,
    ReportResponse,
)

# ---------------------------------------------------------------------------
# Contact restriction (docs/run-golf-v2/CONTRACTS.md §8)
#
# Two people may contact each other only while both accounts are active and
# neither has blocked the other. Every endpoint that creates contact — a
# message, a discovery action, a booking proposal or confirmation, a
# challenge — and every realtime admission/delivery asks this module.
#
# The pair's `users` rows are the one authority boundary for contact. Every
# contact effect — a contact write, a realtime socket admission (check →
# register), a realtime delivery (check → broadcast) and a proposal push
# (check → token → provider) — runs inside a transaction holding FOR SHARE on
# both rows; block/unblock take FOR NO KEY UPDATE, always in id order, and
# the restriction is read after the lock. So each effect happens entirely
# before a block commits or is refused after it; a block waits for effects
# already in progress. (FOR UPDATE would also collide with the FOR KEY SHARE
# every FK insert takes.) SQLite ignores the locking clause, so the unit
# suite runs unchanged.
# ---------------------------------------------------------------------------

# One message for every reason (either block direction, inactive account):
# it is shown verbatim by the app and must not reveal who blocked whom.
CONTACT_UNAVAILABLE = "You can't contact this person."


async def _lock_pair(db: AsyncSession, a: UUID, b: UUID, *, exclusive: bool) -> dict[UUID, bool]:
    """Lock the pair's users rows in id order; return each row's active flag as of the lock.

    Scalar columns, never User entities: the authenticated actor is already in
    the session's identity map, and an entity select would hand back its
    pre-wait attributes after waiting on another transaction (review Q02).
    """
    stmt = select(User.id, User.is_active).where(User.id.in_([a, b])).order_by(User.id)
    stmt = stmt.with_for_update(key_share=True) if exclusive else stmt.with_for_update(read=True)
    return {row.id: row.is_active for row in (await db.execute(stmt)).all()}


def _block_between(a: UUID, b: UUID):
    return or_(
        and_(Block.blocker_id == a, Block.blocked_id == b),
        and_(Block.blocker_id == b, Block.blocked_id == a),
    )


async def is_contact_restricted(db: AsyncSession, a: UUID, b: UUID) -> bool:
    """True when a and b may not contact each other (no locking; for reads, not contact effects)."""
    users = (await db.execute(select(User.is_active).where(User.id.in_([a, b])))).scalars().all()
    if len(users) != 2 or not all(users):
        return True
    return (await db.execute(select(Block.id).where(_block_between(a, b)).limit(1))).first() is not None


async def lock_contact(db: AsyncSession, a: UUID, b: UUID) -> bool:
    """Take the pair's contact lock for this transaction; True if a and b may contact each other now.

    The lock (FOR SHARE) is held until the caller commits or rolls back, so
    the caller's contact effect stays ordered before any block of the pair.
    """
    active = await _lock_pair(db, a, b, exclusive=False)
    if len(active) != 2 or not all(active.values()):
        return False
    return (await db.execute(select(Block.id).where(_block_between(a, b)).limit(1))).first() is None


async def ensure_contact_allowed(db: AsyncSession, actor_id: UUID, other_id: UUID) -> None:
    """Lock the pair for this transaction and raise 403 if they may not contact each other.

    Call before any contact write; the caller's commit releases the lock.
    """
    if not await lock_contact(db, actor_id, other_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=CONTACT_UNAVAILABLE)


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------


async def create_report(
    db: AsyncSession,
    reporter_id: UUID,
    req: CreateReportRequest,
) -> ReportResponse:
    target_type = req.target_type
    if target_type not in REPORT_TARGET_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid target_type: {target_type}",
        )

    target_user_id: UUID | None = None
    target_event_id: UUID | None = None

    if target_type == "user":
        if req.reported_user_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="reported_user_id is required for user reports",
            )
        if req.target_event_id is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="target_event_id must be null for user reports",
            )
        if reporter_id == req.reported_user_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cannot report yourself.",
            )
        target_user = (await db.execute(select(User).where(User.id == req.reported_user_id))).scalar_one_or_none()
        if target_user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Reported user not found",
            )
        target_user_id = req.reported_user_id
    else:  # target_type == "event"
        if req.target_event_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="target_event_id is required for event reports",
            )
        target_event = (await db.execute(select(Event).where(Event.id == req.target_event_id))).scalar_one_or_none()
        if target_event is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Reported event not found",
            )
        # Private-event hide-as-404: outsiders must not distinguish a
        # real private event from an unknown id by submitting a report.
        if target_event.visibility == "private" and reporter_id != target_event.host_user_id:
            active = (
                await db.execute(
                    select(EventParticipant.id).where(
                        EventParticipant.event_id == target_event.id,
                        EventParticipant.user_id == reporter_id,
                        EventParticipant.status == "joined",
                    )
                )
            ).first()
            if active is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Reported event not found",
                )
        if reporter_id == target_event.host_user_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cannot report your own event.",
            )
        target_event_id = req.target_event_id

    # Status is server-controlled. New rows always begin "submitted";
    # the API never accepts a client-supplied status, so a public
    # report can never be created as already-actioned.
    report = Report(
        reporter_id=reporter_id,
        target_type=target_type,
        reported_id=target_user_id,
        target_event_id=target_event_id,
        reason=req.reason,
        context=req.context,
        status="submitted",
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return ReportResponse.model_validate(report)


async def list_my_reports(
    db: AsyncSession,
    reporter_id: UUID,
) -> ReportListResponse:
    """Return reports created by the caller — never expose others' reports."""
    stmt = select(Report).where(Report.reporter_id == reporter_id).order_by(Report.created_at.desc())
    reports = list((await db.execute(stmt)).scalars().all())
    return ReportListResponse(
        items=[ReportResponse.model_validate(r) for r in reports],
        total=len(reports),
    )


# ---------------------------------------------------------------------------
# Blocks
# ---------------------------------------------------------------------------


async def block_user(
    db: AsyncSession,
    blocker_id: UUID,
    blocked_id: UUID,
) -> BlockResponse:
    if blocker_id == blocked_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot block yourself.",
        )

    # Wait for in-flight contact writes between the pair; later ones see the block.
    await _lock_pair(db, blocker_id, blocked_id, exclusive=True)

    # Idempotent: return existing block if present
    stmt = select(Block).where(and_(Block.blocker_id == blocker_id, Block.blocked_id == blocked_id))
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        return BlockResponse.model_validate(existing)

    block = Block(blocker_id=blocker_id, blocked_id=blocked_id)
    db.add(block)
    await db.commit()
    await db.refresh(block)
    return BlockResponse.model_validate(block)


async def unblock_user(
    db: AsyncSession,
    blocker_id: UUID,
    blocked_id: UUID,
) -> None:
    await _lock_pair(db, blocker_id, blocked_id, exclusive=True)
    stmt = select(Block).where(and_(Block.blocker_id == blocker_id, Block.blocked_id == blocked_id))
    block = (await db.execute(stmt)).scalar_one_or_none()
    if block is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found.",
        )
    await db.delete(block)
    await db.commit()


async def list_blocks(
    db: AsyncSession,
    blocker_id: UUID,
) -> BlockListResponse:
    stmt = (
        select(Block, UserProfile.display_name)
        .outerjoin(UserProfile, UserProfile.user_id == Block.blocked_id)
        .where(Block.blocker_id == blocker_id)
        .order_by(Block.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    items = [
        BlockResponse.model_validate(block).model_copy(update={"blocked_display_name": name}) for block, name in rows
    ]
    return BlockListResponse(items=items, total=len(items))
