"""
Tournament list / detail / join / leave.

Lives alongside the booking FSM rather than subsuming it. The
``record_booking_transition`` rank hook does NOT fire for tournament
events — tournaments are not yet integrated with the rank system. This
is deliberate: the brief explicitly says "Do not call them ranked
unless the rank system integration is real."

Concurrency: ``join_tournament`` locks the tournament row before the
capacity check (``with_for_update``) so two simultaneous joins at
capacity-1 cannot both succeed. SQLite ignores the lock hint, which is
fine because the test suite is single-threaded.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile import UserProfile
from app.models.tournament import Tournament, TournamentParticipant
from app.schemas.tournaments import (
    TournamentDetail,
    TournamentListResponse,
    TournamentParticipantSummary,
    TournamentSummary,
)

# Statuses where the public list / detail endpoints surface a tournament.
_VISIBLE_STATUSES: frozenset[str] = frozenset({"open", "full", "closed", "completed"})

# Statuses a user can leave from. Cancelled / completed / draft are terminal
# from the participant's perspective — no leave allowed.
_LEAVABLE_STATUSES: frozenset[str] = frozenset({"open", "full", "closed"})


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _participant_count(db: AsyncSession, tournament_id: UUID) -> int:
    stmt = select(func.count(TournamentParticipant.tournament_id)).where(
        TournamentParticipant.tournament_id == tournament_id
    )
    return int((await db.execute(stmt)).scalar_one())


async def _has_joined(db: AsyncSession, tournament_id: UUID, user_id: UUID) -> bool:
    stmt = select(TournamentParticipant).where(
        TournamentParticipant.tournament_id == tournament_id,
        TournamentParticipant.user_id == user_id,
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None


def _to_summary(t: Tournament, participant_count: int, has_joined: bool) -> TournamentSummary:
    return TournamentSummary(
        id=t.id,
        title=t.title,
        sport=t.sport,
        description=t.description,
        area=t.area,
        venue_id=t.venue_id,
        starts_at=t.starts_at,
        capacity=t.capacity,
        participant_count=participant_count,
        spots_left=max(0, t.capacity - participant_count),
        status=t.status,
        has_joined=has_joined,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


async def _get_tournament_or_404(db: AsyncSession, tournament_id: UUID) -> Tournament:
    t = (await db.execute(select(Tournament).where(Tournament.id == tournament_id))).scalar_one_or_none()
    if t is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tournament not found")
    return t


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def list_tournaments(
    db: AsyncSession,
    current_user_id: UUID,
    *,
    mine: bool = False,
    sport: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> TournamentListResponse:
    base = select(Tournament)
    if mine:
        # Only tournaments the user has joined, regardless of status — they
        # may want to see cancelled/completed entries on "my tournaments".
        base = base.join(
            TournamentParticipant,
            TournamentParticipant.tournament_id == Tournament.id,
        ).where(TournamentParticipant.user_id == current_user_id)
    else:
        base = base.where(Tournament.status.in_(_VISIBLE_STATUSES))

    if sport is not None:
        base = base.where(Tournament.sport == sport)

    base = base.order_by(Tournament.starts_at.asc())

    rows = list((await db.execute(base.offset(offset).limit(limit))).scalars().all())
    total = int((await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one())

    items: list[TournamentSummary] = []
    for t in rows:
        count = await _participant_count(db, t.id)
        joined = await _has_joined(db, t.id, current_user_id)
        items.append(_to_summary(t, count, joined))

    return TournamentListResponse(items=items, total=total)


async def get_tournament(db: AsyncSession, tournament_id: UUID, current_user_id: UUID) -> TournamentDetail:
    t = await _get_tournament_or_404(db, tournament_id)
    if t.status == "draft":
        # Drafts are not yet visible — treat as not found so we don't leak
        # the existence of a tournament that hasn't been published.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tournament not found")

    count = await _participant_count(db, t.id)
    joined = await _has_joined(db, t.id, current_user_id)

    # Participant list with display names. Left-join in case a profile row
    # is missing for a freshly-registered participant who skipped onboarding.
    participants_stmt = (
        select(TournamentParticipant, UserProfile.display_name)
        .where(TournamentParticipant.tournament_id == t.id)
        .outerjoin(UserProfile, UserProfile.user_id == TournamentParticipant.user_id)
        .order_by(TournamentParticipant.joined_at.asc())
    )
    rows = (await db.execute(participants_stmt)).all()
    participants = [
        TournamentParticipantSummary(
            user_id=p.user_id,
            display_name=display_name or "Player",
            joined_at=p.joined_at,
        )
        for (p, display_name) in rows
    ]

    summary = _to_summary(t, count, joined)
    return TournamentDetail(**summary.model_dump(), participants=participants)


async def join_tournament(db: AsyncSession, tournament_id: UUID, current_user_id: UUID) -> TournamentDetail:
    # Lock the tournament row so a concurrent join cannot win the capacity
    # check too. SQLite test harness ignores the lock hint, which is fine
    # for serial tests; production Postgres honors it.
    locked_stmt = select(Tournament).where(Tournament.id == tournament_id).with_for_update()
    t = (await db.execute(locked_stmt)).scalar_one_or_none()
    if t is None or t.status == "draft":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tournament not found")

    if t.status != "open":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Tournament is not accepting joins (status: {t.status})",
        )

    # Already-joined check. Using the unique-key behavior would also raise,
    # but a friendly 409 is clearer for the client than a constraint error.
    if await _has_joined(db, t.id, current_user_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Already joined this tournament",
        )

    count = await _participant_count(db, t.id)
    if count >= t.capacity:
        # Defensive — should be unreachable given status='open' invariant,
        # but two requests racing past the open check still bump here.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Tournament is full",
        )

    db.add(TournamentParticipant(tournament_id=t.id, user_id=current_user_id))
    new_count = count + 1
    if new_count >= t.capacity:
        t.status = "full"
    await db.flush()
    await db.commit()
    await db.refresh(t)

    return await get_tournament(db, t.id, current_user_id)


async def leave_tournament(db: AsyncSession, tournament_id: UUID, current_user_id: UUID) -> TournamentDetail:
    locked_stmt = select(Tournament).where(Tournament.id == tournament_id).with_for_update()
    t = (await db.execute(locked_stmt)).scalar_one_or_none()
    if t is None or t.status == "draft":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tournament not found")

    if t.status not in _LEAVABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Cannot leave a {t.status} tournament",
        )

    participant_stmt = select(TournamentParticipant).where(
        TournamentParticipant.tournament_id == t.id,
        TournamentParticipant.user_id == current_user_id,
    )
    participant = (await db.execute(participant_stmt)).scalar_one_or_none()
    if participant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You are not in this tournament",
        )

    # Order matters: delete first, then recompute count, then decide status.
    # If we reversed it the status flip would race the deletion.
    await db.delete(participant)
    await db.flush()

    new_count = await _participant_count(db, t.id)
    if t.status == "full" and new_count < t.capacity:
        t.status = "open"

    await db.commit()
    await db.refresh(t)

    return await get_tournament(db, t.id, current_user_id)
