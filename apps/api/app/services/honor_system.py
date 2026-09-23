"""
Honor System service layer.

The public Honor/Rank API is currently read-only —
:func:`get_my_rank_profile`, :func:`list_rankings`,
:func:`get_current_honor`, and :func:`list_titles_held_by` are the
only functions any FastAPI route calls, and none of them write to the
database.

:func:`record_match_result_for_honor` is an internal service
integration point only. It has no public route caller today and must
not be wired to one until verified challenge / tournament /
group-event result authorization exists — a public POST that wraps it
would let any authenticated user mutate two other users' rankings,
wins/losses, streaks, title holders, and honor history.

:func:`get_or_create_rank_profile` is also internal: it is the
upsert helper used by the result hook, NOT a backing function for any
public GET. Public reads use the read-only :func:`get_my_rank_profile`
which returns a non-persisted default for a brand-new user.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.honor_system import (
    DEFAULT_RATING,
    RATING_FLOOR,
    RATING_LOSS_DELTA,
    RATING_WIN_DELTA,
    HonorHistory,
    HonorTitle,
    RankProfile,
)
from app.models.user import User
from app.schemas.honor_system import (
    HonorHistoryRead,
    HonorTitleRead,
    HonorTransferResponse,
    RankingEntry,
    RankingListResponse,
    RankProfileRead,
)

# ---------------------------------------------------------------------------
# Area keys
# ---------------------------------------------------------------------------


def normalize_area(area: str) -> str:
    """
    Canonical storage key for an honor ``area``: trimmed, internal
    whitespace collapsed, lower-cased. ``"  Surry   Hills "`` and
    ``"surry hills"`` are the same area.

    New rows are written with this key. Rows written before
    normalisation existed may still hold Title Case (seed data, v1.0
    clients), so every read compares ``lower(area)`` against the key
    instead of the raw column — no data-rewriting migration needed.
    """
    return " ".join(area.split()).lower()


def _area_matches(column, area: str):
    """Case-insensitive SQL predicate for an area column."""
    return func.lower(column) == normalize_area(area)


# ---------------------------------------------------------------------------
# RankProfile read / list
# ---------------------------------------------------------------------------


async def get_or_create_rank_profile(db: AsyncSession, user_id: UUID, sport: str, area: str) -> RankProfile:
    """
    Return the existing (user, sport, area) profile or create one at the
    baseline. The caller is responsible for committing; this function
    flushes so the row is queryable in the same transaction.

    Lookup is case-insensitive so a legacy Title Case row is reused
    rather than shadowed by a new lower-case duplicate; new rows are
    stored under :func:`normalize_area`.
    """
    stmt = (
        select(RankProfile)
        .where(
            RankProfile.user_id == user_id,
            RankProfile.sport == sport,
            _area_matches(RankProfile.area, area),
        )
        .order_by(RankProfile.created_at.asc())
    )
    profile = (await db.execute(stmt)).scalars().first()
    if profile is not None:
        return profile

    profile = RankProfile(
        user_id=user_id,
        sport=sport,
        area=normalize_area(area),
        rating=DEFAULT_RATING,
        wins=0,
        losses=0,
        streak=0,
    )
    db.add(profile)
    await db.flush()
    await db.refresh(profile)
    return profile


async def get_my_rank_profile(db: AsyncSession, user_id: UUID, sport: str, area: str) -> RankProfileRead:
    """
    Read-only self lookup for ``GET /rankings/me``.

    Returns the persisted profile if one exists; otherwise returns a
    non-persisted default read model at the baseline rating with zero
    counts. Never inserts and never commits — a public GET must not
    create rows. The legitimate write path is
    :func:`record_match_result_for_honor`, called from a future
    verified-result hook.
    """
    stmt = (
        select(RankProfile)
        .where(
            RankProfile.user_id == user_id,
            RankProfile.sport == sport,
            _area_matches(RankProfile.area, area),
        )
        .order_by(RankProfile.created_at.asc())
    )
    profile = (await db.execute(stmt)).scalars().first()
    if profile is not None:
        return RankProfileRead.model_validate(profile)

    return RankProfileRead(
        id=None,
        user_id=user_id,
        sport=sport,
        area=area,
        rating=DEFAULT_RATING,
        wins=0,
        losses=0,
        streak=0,
        last_played_at=None,
        created_at=None,
        updated_at=None,
    )


async def list_rankings(
    db: AsyncSession, *, sport: str, area: str, limit: int = 50, offset: int = 0
) -> RankingListResponse:
    """
    Leaderboard for a (sport, area).

    Sort order: ``rating`` desc, then ``wins`` desc as a competitive
    tiebreaker (more wins outranks fewer at the same rating), then
    ``updated_at`` asc so two profiles still tied on (rating, wins)
    settle into a stable order between reads.
    """
    base = (
        select(RankProfile)
        .where(RankProfile.sport == sport, _area_matches(RankProfile.area, area))
        .order_by(
            RankProfile.rating.desc(),
            RankProfile.wins.desc(),
            RankProfile.updated_at.asc(),
        )
    )
    total = int((await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one())
    rows = list((await db.execute(base.offset(offset).limit(limit))).scalars().all())
    items = [
        RankingEntry(
            rank=offset + idx + 1,
            user_id=row.user_id,
            rating=row.rating,
            wins=row.wins,
            losses=row.losses,
            streak=row.streak,
        )
        for idx, row in enumerate(rows)
    ]
    return RankingListResponse(sport=sport, area=area, items=items, total=total)


# ---------------------------------------------------------------------------
# HonorTitle read / list
# ---------------------------------------------------------------------------


def _default_title_name(sport: str, area: str) -> str:
    """Generate the canonical title name. e.g. ('tennis', 'annandale') ->
    'Annandale Tennis Champion'. Built from the normalised area so
    ``"surry hills"`` and ``"Surry  Hills"`` resolve to the same title."""
    return f"{normalize_area(area).title()} {sport.title()} Champion"


async def get_or_create_honor_title(db: AsyncSession, sport: str, area: str, title_name: str) -> HonorTitle:
    stmt = (
        select(HonorTitle)
        .where(
            HonorTitle.sport == sport,
            _area_matches(HonorTitle.area, area),
            HonorTitle.title_name == title_name,
        )
        .order_by(HonorTitle.created_at.asc())
    )
    title = (await db.execute(stmt)).scalars().first()
    if title is not None:
        return title
    title = HonorTitle(sport=sport, area=normalize_area(area), title_name=title_name, active=True)
    db.add(title)
    await db.flush()
    await db.refresh(title)
    return title


async def get_current_honor(db: AsyncSession, sport: str, area: str) -> HonorTitleRead | None:
    """
    Return the canonical title for the (sport, area) — auto-generated
    name "{Area} {Sport} Champion". Returns None if it has never been
    created (i.e. no match result has been recorded yet).

    Read-only: we deliberately do NOT auto-create here so the response
    accurately reflects the "no title yet" state for fresh areas.
    """
    stmt = (
        select(HonorTitle)
        .where(
            HonorTitle.sport == sport,
            _area_matches(HonorTitle.area, area),
            HonorTitle.title_name == _default_title_name(sport, area),
        )
        .order_by(HonorTitle.created_at.asc())
    )
    title = (await db.execute(stmt)).scalars().first()
    if title is None:
        return None
    return HonorTitleRead.model_validate(title)


async def list_titles_held_by(db: AsyncSession, user_id: UUID) -> list[HonorTitleRead]:
    stmt = (
        select(HonorTitle)
        .where(
            HonorTitle.current_holder_user_id == user_id,
            HonorTitle.active.is_(True),
        )
        .order_by(HonorTitle.sport.asc(), HonorTitle.area.asc())
    )
    rows = list((await db.execute(stmt)).scalars().all())
    return [HonorTitleRead.model_validate(r) for r in rows]


# ---------------------------------------------------------------------------
# Match result — the single write path
# ---------------------------------------------------------------------------


async def _user_or_404(db: AsyncSession, user_id: UUID) -> User:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


# INTERNAL INTEGRATION POINT ONLY.
# Do not expose this function directly to public user-submitted routes
# until verified challenge/result authorization exists. Any public POST
# that wraps this would let an authenticated user arbitrarily mutate
# two other users' rankings, wins/losses, streaks, title holders, and
# honor history. The verified challenge/tournament/group-event hook is
# the intended caller.
async def record_match_result_for_honor(
    db: AsyncSession,
    *,
    winner_user_id: UUID,
    loser_user_id: UUID,
    sport: str,
    area: str,
    source_match_id: UUID | None = None,
) -> HonorTransferResponse:
    """
    Apply the outcome of a single match.

    Rating updates (always):
      * winner.rating += RATING_WIN_DELTA
      * loser.rating  = max(RATING_FLOOR, loser.rating - RATING_LOSS_DELTA)
      * winner.wins   += 1; loser.losses += 1
      * winner.streak += 1; loser.streak  = 0
      * both.last_played_at = now()

    Title updates (conditional):
      * If no canonical title exists for (sport, area):
            create it, assign to winner, log honor_history with
            previous_holder_user_id = NULL.
      * If the canonical title's current holder is the loser:
            transfer to the winner, log honor_history with
            previous_holder_user_id = loser_user_id.
      * Otherwise:
            no change — the champion was not in this match (or the
            champion won) so the title stays put.
    """
    if winner_user_id == loser_user_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="winner and loser must be different users",
        )
    await _user_or_404(db, winner_user_id)
    await _user_or_404(db, loser_user_id)

    now = datetime.now(tz=timezone.utc)

    # Rating + counter updates --------------------------------------------
    winner = await get_or_create_rank_profile(db, winner_user_id, sport, area)
    loser = await get_or_create_rank_profile(db, loser_user_id, sport, area)

    winner.rating = winner.rating + RATING_WIN_DELTA
    winner.wins = winner.wins + 1
    winner.streak = winner.streak + 1
    winner.last_played_at = now

    loser.rating = max(RATING_FLOOR, loser.rating - RATING_LOSS_DELTA)
    loser.losses = loser.losses + 1
    loser.streak = 0
    loser.last_played_at = now

    # Title + history -----------------------------------------------------
    canonical_name = _default_title_name(sport, area)
    title_stmt = (
        select(HonorTitle)
        .where(
            HonorTitle.sport == sport,
            _area_matches(HonorTitle.area, area),
            HonorTitle.title_name == canonical_name,
        )
        .order_by(HonorTitle.created_at.asc())
    )
    title = (await db.execute(title_stmt)).scalars().first()

    transferred = False
    history_row: HonorHistory | None = None

    if title is None:
        # First match ever for this (sport, area) — inaugurate the title.
        title = HonorTitle(
            sport=sport,
            area=normalize_area(area),
            title_name=canonical_name,
            current_holder_user_id=winner_user_id,
            active=True,
        )
        db.add(title)
        await db.flush()
        history_row = HonorHistory(
            honor_title_id=title.id,
            previous_holder_user_id=None,
            new_holder_user_id=winner_user_id,
            source_match_id=source_match_id,
        )
        db.add(history_row)
        transferred = True
    elif title.current_holder_user_id == loser_user_id:
        history_row = HonorHistory(
            honor_title_id=title.id,
            previous_holder_user_id=loser_user_id,
            new_holder_user_id=winner_user_id,
            source_match_id=source_match_id,
        )
        db.add(history_row)
        title.current_holder_user_id = winner_user_id
        transferred = True
    # else: champion not in this match → no transfer, no history row.

    await db.flush()
    await db.commit()
    await db.refresh(winner)
    await db.refresh(loser)
    await db.refresh(title)
    if history_row is not None:
        await db.refresh(history_row)

    return HonorTransferResponse(
        winner_profile=RankProfileRead.model_validate(winner),
        loser_profile=RankProfileRead.model_validate(loser),
        honor_title=HonorTitleRead.model_validate(title),
        transferred=transferred,
        history_entry=(HonorHistoryRead.model_validate(history_row) if history_row is not None else None),
    )
