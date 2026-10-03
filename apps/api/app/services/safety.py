from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, select
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
