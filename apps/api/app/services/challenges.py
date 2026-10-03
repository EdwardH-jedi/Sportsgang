"""
Sports challenge / verified-result service.

This is the only legitimate caller of
:func:`app.services.honor_system.record_match_result_for_honor` today.
The honor service stays internal; the public-facing entry point is
``POST /challenges/{id}/result``, which lands in
:func:`submit_challenge_result` here and only forwards to the honor
hook when *both* participants have submitted *matching* results.

Idempotence and security invariants enforced in this module:

  * A participant can only submit once per challenge — the
    ``uq_challenge_submissions_per_user`` unique constraint is the
    DB-level backstop; the service also checks before insert.
  * A result is applied to rank/honor exactly once. The transition
    ``accepted → verified`` is the gate; once status is ``verified``,
    no further submission can fire :func:`record_match_result_for_honor`.
  * A disputed challenge never touches rank/honor.
  * An unrelated authenticated user gets ``403`` on every mutation
    endpoint that takes a challenge id.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.challenge import (
    CHALLENGE_TERMINAL_STATUSES,
    ChallengeResultSubmission,
    SportsChallenge,
)
from app.models.user import User
from app.schemas.challenges import ChallengeListResponse, ChallengeRead
from app.services import safety
from app.services.honor_system import record_match_result_for_honor

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _user_or_404(db: AsyncSession, user_id: UUID) -> User:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


async def _challenge_or_404(db: AsyncSession, challenge_id: UUID) -> SportsChallenge:
    challenge = (
        await db.execute(select(SportsChallenge).where(SportsChallenge.id == challenge_id))
    ).scalar_one_or_none()
    if challenge is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenge not found")
    return challenge


def _require_participant(challenge: SportsChallenge, user_id: UUID) -> None:
    if user_id not in (challenge.challenger_user_id, challenge.opponent_user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a participant in this challenge",
        )


def _to_read(challenge: SportsChallenge) -> ChallengeRead:
    return ChallengeRead.model_validate(challenge)


# ---------------------------------------------------------------------------
# Create / read
# ---------------------------------------------------------------------------


async def create_challenge(
    db: AsyncSession,
    *,
    current_user_id: UUID,
    opponent_user_id: UUID,
    sport: str,
    area: str,
    note: str | None = None,
) -> ChallengeRead:
    if current_user_id == opponent_user_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="You cannot challenge yourself",
        )
    await _user_or_404(db, opponent_user_id)
    await safety.ensure_contact_allowed(db, current_user_id, opponent_user_id)

    challenge = SportsChallenge(
        challenger_user_id=current_user_id,
        opponent_user_id=opponent_user_id,
        sport=sport,
        area=area,
        status="pending",
        note=note,
    )
    db.add(challenge)
    await db.flush()
    await db.commit()
    await db.refresh(challenge)
    return _to_read(challenge)


async def get_challenge(db: AsyncSession, *, current_user_id: UUID, challenge_id: UUID) -> ChallengeRead:
    challenge = await _challenge_or_404(db, challenge_id)
    _require_participant(challenge, current_user_id)
    return _to_read(challenge)


async def list_my_challenges(
    db: AsyncSession,
    *,
    current_user_id: UUID,
    status_filter: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> ChallengeListResponse:
    base = select(SportsChallenge).where(
        or_(
            SportsChallenge.challenger_user_id == current_user_id,
            SportsChallenge.opponent_user_id == current_user_id,
        )
    )
    if status_filter is not None:
        base = base.where(SportsChallenge.status == status_filter)
    base = base.order_by(SportsChallenge.created_at.desc())

    total = int((await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one())
    rows = list((await db.execute(base.offset(offset).limit(limit))).scalars().all())
    return ChallengeListResponse(items=[_to_read(r) for r in rows], total=total)


# ---------------------------------------------------------------------------
# Lifecycle transitions
# ---------------------------------------------------------------------------


async def accept_challenge(db: AsyncSession, *, current_user_id: UUID, challenge_id: UUID) -> ChallengeRead:
    challenge = await _challenge_or_404(db, challenge_id)
    if current_user_id != challenge.opponent_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the opponent can accept this challenge",
        )
    if challenge.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot accept a {challenge.status} challenge",
        )
    await safety.ensure_contact_allowed(db, current_user_id, challenge.challenger_user_id)
    challenge.status = "accepted"
    challenge.accepted_at = datetime.now(tz=timezone.utc)
    await db.flush()
    await db.commit()
    await db.refresh(challenge)
    return _to_read(challenge)


async def decline_challenge(db: AsyncSession, *, current_user_id: UUID, challenge_id: UUID) -> ChallengeRead:
    challenge = await _challenge_or_404(db, challenge_id)
    if current_user_id != challenge.opponent_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the opponent can decline this challenge",
        )
    if challenge.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot decline a {challenge.status} challenge",
        )
    challenge.status = "declined"
    challenge.completed_at = datetime.now(tz=timezone.utc)
    await db.flush()
    await db.commit()
    await db.refresh(challenge)
    return _to_read(challenge)


async def cancel_challenge(db: AsyncSession, *, current_user_id: UUID, challenge_id: UUID) -> ChallengeRead:
    challenge = await _challenge_or_404(db, challenge_id)
    if current_user_id != challenge.challenger_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the challenger can cancel this challenge",
        )
    if challenge.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot cancel a {challenge.status} challenge",
        )
    challenge.status = "cancelled"
    challenge.completed_at = datetime.now(tz=timezone.utc)
    await db.flush()
    await db.commit()
    await db.refresh(challenge)
    return _to_read(challenge)


# ---------------------------------------------------------------------------
# Result submission — the only path that can fire record_match_result_for_honor
# ---------------------------------------------------------------------------


async def submit_challenge_result(
    db: AsyncSession,
    *,
    current_user_id: UUID,
    challenge_id: UUID,
    winner_user_id: UUID,
    loser_user_id: UUID,
) -> ChallengeRead:
    """
    Apply a participant's result submission to a challenge.

    Concurrency model
    -----------------
    The whole flow runs under a row-level lock on the challenge
    (``SELECT … FOR UPDATE`` via :func:`Select.with_for_update`). The
    lock serializes the entire critical section so two concurrent
    submissions cannot both observe an empty submissions list, both
    insert a row, and both fall through the "still accepted" branch —
    which would leave the challenge stuck with two matching
    submissions and no verified result. Postgres honors the row lock;
    SQLite (used in the test suite) ignores it but the suite is
    single-threaded so the lock is moot there. The post-flush re-query
    is the load-bearing change either way: every code path decides on
    the actual count of submissions after the insert is visible to the
    session.

    Behavior matrix:

      * status != accepted                  → 422 (terminal or pre-accept)
      * submitter not a participant         → 403
      * {winner, loser} != challenge pair   → 422
      * winner == loser                     → 422
      * participant already submitted       → 409 (pre-check OR DB
                                              unique-constraint race
                                              caught from IntegrityError)
      * one submission visible after flush  → keep status=accepted, no
                                              rank/honor side effect
      * second matching submission          → status=verified;
                                              record_match_result_for_honor(...)
                                              fires exactly once with
                                              source_match_id=challenge.id
      * second conflicting submission       → status=disputed; no
                                              rank/honor side effect
    """
    locked_stmt = select(SportsChallenge).where(SportsChallenge.id == challenge_id).with_for_update()
    challenge = (await db.execute(locked_stmt)).scalar_one_or_none()
    if challenge is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenge not found")

    _require_participant(challenge, current_user_id)

    if challenge.status in CHALLENGE_TERMINAL_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot submit a result for a {challenge.status} challenge",
        )
    if challenge.status != "accepted":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=("Challenge must be accepted before a result can be submitted"),
        )
    if winner_user_id == loser_user_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="winner and loser must be different users",
        )

    participants = {
        challenge.challenger_user_id,
        challenge.opponent_user_id,
    }
    if {winner_user_id, loser_user_id} != participants:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=("winner and loser must be exactly the two challenge participants"),
        )

    # Pre-check duplicate submission under the lock. Clearer error than
    # letting the unique constraint raise; the constraint remains the
    # DB-level backstop and the IntegrityError below covers the race
    # where the lock is not honored (e.g. SQLite ignores ``FOR UPDATE``).
    existing_stmt = select(ChallengeResultSubmission).where(ChallengeResultSubmission.challenge_id == challenge.id)
    existing_before = list((await db.execute(existing_stmt)).scalars().all())
    if any(s.submitted_by_user_id == current_user_id for s in existing_before):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already submitted a result for this challenge",
        )

    submission = ChallengeResultSubmission(
        challenge_id=challenge.id,
        submitted_by_user_id=current_user_id,
        winner_user_id=winner_user_id,
        loser_user_id=loser_user_id,
    )
    db.add(submission)
    try:
        await db.flush()
    except IntegrityError:
        # The unique constraint fired — a concurrent request from the
        # same submitter slipped past the pre-check (only possible if
        # row-level locking is not honored). Roll back the failed insert
        # and return a clean 409 instead of a 500.
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already submitted a result for this challenge",
        ) from None

    # Re-query AFTER the flush, still under the challenge lock. This is
    # the load-bearing fix: every code path decides on the *actual*
    # count of submissions after the insert is visible, never on a
    # pre-insert snapshot — which could be empty for both participants
    # in a race and leave the challenge stuck in "accepted".
    submissions = list(
        (await db.execute(existing_stmt.order_by(ChallengeResultSubmission.created_at.asc()))).scalars().all()
    )

    if len(submissions) < 2:
        await db.commit()
        await db.refresh(challenge)
        return _to_read(challenge)

    # Both participants have now submitted. Compare on the (winner, loser)
    # pair — both fields must match exactly for the challenge to verify.
    first, second = submissions[0], submissions[1]
    agrees = first.winner_user_id == second.winner_user_id and first.loser_user_id == second.loser_user_id
    now = datetime.now(tz=timezone.utc)

    if not agrees:
        # Disputed — never touch rank/honor. The conditional UPDATE is
        # defense-in-depth against a race where two coroutines reach
        # this branch together (e.g. when ``FOR UPDATE`` is a no-op on
        # SQLite): only one can flip ``accepted → disputed``; the
        # other's rowcount will be 0 and it will return idempotently
        # without re-applying the timestamps.
        disputed_result = await db.execute(
            update(SportsChallenge)
            .where(
                SportsChallenge.id == challenge.id,
                SportsChallenge.status == "accepted",
            )
            .values(status="disputed", completed_at=now)
        )
        await db.flush()
        await db.commit()
        await db.refresh(challenge)
        # ``disputed_result.rowcount == 0`` is the idempotent-loser
        # branch; the caller still sees the (terminal) state because
        # the refresh above re-reads from the DB.
        _ = disputed_result
        return _to_read(challenge)

    # Verified path. The conditional UPDATE is the load-bearing
    # atomicity primitive: it flips ``accepted → verified`` exactly
    # once across all racing coroutines, regardless of whether the
    # DB honored the row lock. Only the winner of the race
    # (``rowcount == 1``) calls :func:`record_match_result_for_honor`,
    # so rank/honor is applied at most once per challenge for the
    # lifetime of the row.
    verified_result = await db.execute(
        update(SportsChallenge)
        .where(
            SportsChallenge.id == challenge.id,
            SportsChallenge.status == "accepted",
        )
        .values(status="verified", completed_at=now, verified_at=now)
    )
    await db.flush()

    if verified_result.rowcount == 0:
        # Another coroutine already verified (or disputed) this
        # challenge — idempotent return. Do NOT call the honor hook;
        # rank/honor was applied by the winner of the race.
        await db.commit()
        await db.refresh(challenge)
        return _to_read(challenge)

    await record_match_result_for_honor(
        db,
        winner_user_id=first.winner_user_id,
        loser_user_id=first.loser_user_id,
        sport=challenge.sport,
        area=challenge.area,
        source_match_id=challenge.id,
    )

    await db.refresh(challenge)
    return _to_read(challenge)
