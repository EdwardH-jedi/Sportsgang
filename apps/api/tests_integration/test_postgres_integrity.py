"""PostgreSQL-only concurrency and atomic-consumption regression tests."""

from __future__ import annotations

import asyncio
import hashlib
import os
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.models.booking import Booking
from app.models.google_calendar import GoogleOAuthState
from app.models.match import Match
from app.models.notification import NotificationEvent
from app.models.rank import HonorEvent, RankEvent
from app.models.user import User
from app.services.bookings import transition_booking
from app.services.google_calendar import _consume_oauth_state

# Run separately from the SQLite unit suite, after `alembic upgrade head`,
# against the PostgreSQL database configured in the environment.
pytestmark = [
    # The module-level asyncpg pool must be created, used and disposed on one
    # event loop. pytest-asyncio otherwise gives each test a function loop.
    pytest.mark.asyncio(loop_scope="module"),
]

_engine = create_async_engine(get_settings().async_postgres_url, pool_pre_ping=True)
_Session = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(scope="module", loop_scope="module", autouse=True)
async def _dispose_engine():
    yield
    await _engine.dispose()


async def _seed_booking(*, status: str, ended: bool) -> tuple[object, object, object]:
    async with _Session() as session:
        first = User(email=f"pg-first-{os.urandom(6).hex()}@example.com", hashed_password="x")
        second = User(email=f"pg-second-{os.urandom(6).hex()}@example.com", hashed_password="x")
        session.add_all([first, second])
        await session.flush()
        match = Match(user1_id=first.id, user2_id=second.id, sport="tennis", status="active")
        session.add(match)
        await session.flush()
        if ended:
            ends_at = datetime.now(tz=timezone.utc) - timedelta(minutes=5)
            starts_at = ends_at - timedelta(minutes=30)
        else:
            starts_at = datetime.now(tz=timezone.utc) + timedelta(days=1)
            ends_at = starts_at + timedelta(hours=1)
        booking = Booking(
            match_id=match.id,
            proposer_id=first.id,
            partner_id=second.id,
            sport="tennis",
            starts_at=starts_at,
            ends_at=ends_at,
            status=status,
        )
        session.add(booking)
        await session.commit()
        return first.id, second.id, booking.id


async def _run_transition(booking_id, status: str, actor_id) -> int:
    async with _Session() as session:
        try:
            await transition_booking(session, booking_id, status, actor_id)
            return 200
        except HTTPException as exc:
            await session.rollback()
            return exc.status_code


async def _cleanup_users(*user_ids) -> None:
    async with _Session() as session:
        await session.execute(delete(User).where(User.id.in_(user_ids)))
        await session.commit()


async def test_concurrent_double_completion_awards_once() -> None:
    proposer_id, partner_id, booking_id = await _seed_booking(status="confirmed", ended=True)
    try:
        results = await asyncio.gather(
            _run_transition(booking_id, "completed", proposer_id),
            _run_transition(booking_id, "completed", partner_id),
        )
        assert sorted(results) == [200, 422]

        async with _Session() as session:
            booking_status = (
                await session.execute(select(Booking.status).where(Booking.id == booking_id))
            ).scalar_one()
            honor_count = (
                await session.execute(
                    select(func.count()).select_from(HonorEvent).where(HonorEvent.booking_id == booking_id)
                )
            ).scalar_one()
            rank_count = (
                await session.execute(
                    select(func.count()).select_from(RankEvent).where(RankEvent.booking_id == booking_id)
                )
            ).scalar_one()
        assert booking_status == "completed"
        assert honor_count == 2
        assert rank_count == 2
    finally:
        await _cleanup_users(proposer_id, partner_id)


async def test_concurrent_confirm_vs_decline_has_one_winner() -> None:
    proposer_id, partner_id, booking_id = await _seed_booking(status="proposed", ended=False)
    try:
        results = await asyncio.gather(
            _run_transition(booking_id, "confirmed", partner_id),
            _run_transition(booking_id, "declined", partner_id),
        )
        assert sorted(results) == [200, 422]
        async with _Session() as session:
            final_status = (await session.execute(select(Booking.status).where(Booking.id == booking_id))).scalar_one()
        assert final_status in {"confirmed", "declined"}
    finally:
        await _cleanup_users(proposer_id, partner_id)


async def test_concurrent_cancel_vs_complete_has_one_winner_and_one_side_effect_set() -> None:
    # Two different "either" edges out of confirmed, by different participants:
    # the row lock must serialise them so only the winner's side effects land.
    proposer_id, partner_id, booking_id = await _seed_booking(status="confirmed", ended=True)
    try:
        results = await asyncio.gather(
            _run_transition(booking_id, "cancelled", proposer_id),
            _run_transition(booking_id, "completed", partner_id),
        )
        assert sorted(results) == [200, 422]

        async with _Session() as session:
            final_status = (await session.execute(select(Booking.status).where(Booking.id == booking_id))).scalar_one()
            notifications = [
                tuple(row)
                for row in await session.execute(
                    select(NotificationEvent.notification_type, NotificationEvent.user_id).where(
                        NotificationEvent.booking_id == booking_id
                    )
                )
            ]
            honor = [
                tuple(row)
                for row in await session.execute(
                    select(HonorEvent.reason, HonorEvent.user_id).where(HonorEvent.booking_id == booking_id)
                )
            ]
            rank_count = (
                await session.execute(
                    select(func.count()).select_from(RankEvent).where(RankEvent.booking_id == booking_id)
                )
            ).scalar_one()

        if final_status == "cancelled":
            assert results == [200, 422]
            assert notifications == [("booking_cancelled", partner_id)]
            assert honor == [("late_cancellation", proposer_id)]
            assert rank_count == 0
        else:
            assert final_status == "completed"
            assert results == [422, 200]
            assert notifications == []
            assert sorted(honor) == sorted([("session_completed", proposer_id), ("session_completed", partner_id)])
            assert rank_count == 2
    finally:
        await _cleanup_users(proposer_id, partner_id)


async def test_oauth_state_concurrent_consumption_has_one_winner(monkeypatch) -> None:
    from app.services import google_calendar

    user_a, user_b, _ = await _seed_booking(status="proposed", ended=False)
    raw_state = "concurrent-state-" + os.urandom(24).hex()
    redirect_uri = "https://example.test/oauth/callback"
    monkeypatch.setattr(
        google_calendar,
        "get_settings",
        lambda: type("Settings", (), {"google_redirect_uri": redirect_uri})(),
    )
    async with _Session() as session:
        session.add(
            GoogleOAuthState(
                state_hash=hashlib.sha256(raw_state.encode()).hexdigest(),
                user_id=user_a,
                code_verifier="verifier-" + os.urandom(32).hex(),
                redirect_uri=redirect_uri,
                expires_at=datetime.now(tz=timezone.utc) + timedelta(minutes=5),
            )
        )
        await session.commit()

    async def consume() -> int:
        async with _Session() as session:
            try:
                await _consume_oauth_state(session, raw_state)
                return 200
            except HTTPException as exc:
                return exc.status_code

    try:
        assert sorted(await asyncio.gather(consume(), consume())) == [200, 400]
    finally:
        await _cleanup_users(user_a, user_b)


async def test_concurrent_photo_replacements_serialise_and_leave_no_dangling_files(tmp_path, monkeypatch) -> None:
    import io

    from fastapi import UploadFile

    from app.models.profile import ProfilePhoto, UserProfile
    from app.routers.users import replace_profile_photos
    from app.services import media_storage

    # Without the profile row lock both requests read the same "previous"
    # rows, and the second insert hits uq_profile_photos_profile_position.
    monkeypatch.setattr(media_storage, "_profile_photos_root", lambda: tmp_path / "profile_photos")
    async with _Session() as session:
        user = User(email=f"pg-photos-{os.urandom(6).hex()}@example.com", hashed_password="x")
        session.add(user)
        await session.flush()
        session.add(UserProfile(user_id=user.id, display_name="Photo User"))
        await session.commit()
        user_id = user.id

    async def replace(tag: str) -> list[str]:
        uploads = [UploadFile(io.BytesIO(f"{tag}-{i}".encode()), filename=f"{tag}{i}.jpg") for i in range(2)]
        async with _Session() as session:
            current_user = await session.get(User, user_id)
            response = await replace_profile_photos(files=uploads, current_user=current_user, db=session)
            return [photo.photo_url for photo in response.photos]

    async def warm_connection() -> None:
        async with _Session() as session:
            await session.execute(select(func.now()))
            await asyncio.sleep(0.05)

    try:
        await replace("initial")
        # Two pooled connections up front, so neither request spends its
        # first await connecting while the other runs to completion.
        await asyncio.gather(warm_connection(), warm_connection())
        first, second = await asyncio.gather(replace("a"), replace("b"))

        async with _Session() as session:
            profile = (await session.execute(select(UserProfile).where(UserProfile.user_id == user_id))).scalar_one()
            rows = list(
                (
                    await session.execute(
                        select(ProfilePhoto.photo_url)
                        .where(ProfilePhoto.profile_id == profile.id)
                        .order_by(ProfilePhoto.position)
                    )
                ).scalars()
            )
        on_disk = sorted(path.name for path in (tmp_path / "profile_photos" / str(user_id)).iterdir())

        assert rows in (first, second)
        assert profile.avatar_url == rows[0]
        assert on_disk == sorted(url.rsplit("/", 1)[-1] for url in rows)
    finally:
        async with _Session() as session:
            await session.execute(delete(UserProfile).where(UserProfile.user_id == user_id))
            await session.execute(delete(User).where(User.id == user_id))
            await session.commit()
