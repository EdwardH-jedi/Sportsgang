"""Sports Reputation (rank + honor) tests using in-memory SQLite."""

from __future__ import annotations

from typing import AsyncGenerator
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app
from app.services.rank import (
    HONOR_BASELINE,
    HONOR_DELTA_LATE_CANCELLATION,
    HONOR_DELTA_NO_SHOW_AGAINST_USER,
    HONOR_DELTA_NO_SHOW_MARKED_BY_USER,
    HONOR_DELTA_SESSION_COMPLETED,
    RANK_DELTA_SESSION_COMPLETED,
    compute_tier,
)

# Import every model so Base.metadata.create_all builds the full schema.
from app.models import (  # noqa: F401
    booking,
    chat,
    event,
    match,
    profile,
    rank,
    safety,
    user,
    venue,
)

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

_engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
_TestSession = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)


@pytest.fixture(scope="module", autouse=True)
async def create_tables():
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with _TestSession() as session:
        yield session


async def _override_get_redis() -> AsyncGenerator:
    mock = AsyncMock()
    mock.ping = AsyncMock(return_value=True)
    mock.aclose = AsyncMock()
    yield mock


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_redis] = _override_get_redis
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helpers — copied from test_bookings.py to avoid cross-test fixture leakage
# ---------------------------------------------------------------------------


async def _register(client: AsyncClient, email: str) -> tuple[str, str]:
    r = await client.post("/auth/register", json={"email": email, "password": "password123"})
    token = r.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    return token, me.json()["id"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _matched_pair(
    client: AsyncClient, email_a: str, email_b: str, sport: str = "tennis"
) -> tuple[str, str, str, str, str]:
    """Returns (token_a, uid_a, token_b, uid_b, match_id)."""
    token_a, uid_a = await _register(client, email_a)
    token_b, uid_b = await _register(client, email_b)
    await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_b, "action": "like", "sport": sport},
        headers=_auth(token_a),
    )
    r = await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_a, "action": "like", "sport": sport},
        headers=_auth(token_b),
    )
    return token_a, uid_a, token_b, uid_b, r.json()["match_id"]


async def _create_booking(client: AsyncClient, token: str, match_id: str, sport: str = "tennis") -> str:
    r = await client.post(
        "/bookings",
        json={
            "match_id": match_id,
            "sport": sport,
            "starts_at": "2030-04-01T09:00:00Z",
            "ends_at": "2030-04-01T10:00:00Z",
        },
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _confirm(client: AsyncClient, token: str, booking_id: str) -> None:
    r = await client.post(f"/bookings/{booking_id}/confirm", headers=_auth(token))
    assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# Pure-function tests
# ---------------------------------------------------------------------------


def test_compute_tier_bands() -> None:
    assert compute_tier(0) == "Rookie"
    assert compute_tier(9) == "Rookie"
    assert compute_tier(10) == "Bronze"
    assert compute_tier(49) == "Bronze"
    assert compute_tier(50) == "Silver"
    assert compute_tier(149) == "Silver"
    assert compute_tier(150) == "Gold"
    assert compute_tier(399) == "Gold"
    assert compute_tier(400) == "Platinum"
    assert compute_tier(999) == "Platinum"
    assert compute_tier(1000) == "Diamond"
    assert compute_tier(99999) == "Diamond"


# ---------------------------------------------------------------------------
# Endpoint tests — auth + empty state
# ---------------------------------------------------------------------------


async def test_self_summary_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/users/me/rank-summary")
    assert r.status_code in (401, 403)


async def test_self_summary_empty_for_new_user(client: AsyncClient) -> None:
    """Brand-new user: honor at baseline, no sport rank rows."""
    token, _ = await _register(client, "rank_empty@example.com")
    r = await client.get("/users/me/rank-summary", headers=_auth(token))
    assert r.status_code == 200
    body = r.json()
    assert body["honor"] == HONOR_BASELINE
    assert body["sports"] == []


async def test_public_summary_unknown_user_returns_404(client: AsyncClient) -> None:
    token, _ = await _register(client, "rank_unknown@example.com")
    r = await client.get(
        "/users/00000000-0000-0000-0000-000000000999/rank-summary",
        headers=_auth(token),
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Endpoint tests — booking-driven events
# ---------------------------------------------------------------------------


async def test_completed_booking_creates_positive_honor_event(client: AsyncClient) -> None:
    token_a, uid_a, token_b, _uid_b, match_id = await _matched_pair(
        client, "rank_done_a@example.com", "rank_done_b@example.com", sport="tennis"
    )
    booking_id = await _create_booking(client, token_a, match_id, sport="tennis")
    await _confirm(client, token_b, booking_id)
    r = await client.post(f"/bookings/{booking_id}/complete", headers=_auth(token_a))
    assert r.status_code == 200, r.text

    # Both participants get +HONOR_DELTA_SESSION_COMPLETED honor and a
    # tennis rank row with one completed session.
    me = await client.get("/users/me/rank-summary", headers=_auth(token_a))
    body = me.json()
    assert body["honor"] == HONOR_BASELINE + HONOR_DELTA_SESSION_COMPLETED
    assert len(body["sports"]) == 1
    s = body["sports"][0]
    assert s["sport"] == "tennis"
    assert s["rank_points"] == RANK_DELTA_SESSION_COMPLETED
    assert s["sessions_completed"] == 1
    assert s["tier"] == "Rookie"  # below the 10-point Bronze threshold

    # The other participant sees the same on their own summary.
    me_b = await client.get("/users/me/rank-summary", headers=_auth(token_b))
    body_b = me_b.json()
    assert body_b["honor"] == HONOR_BASELINE + HONOR_DELTA_SESSION_COMPLETED
    assert len(body_b["sports"]) == 1
    assert body_b["sports"][0]["sessions_completed"] == 1


async def test_duplicate_completion_cannot_duplicate_rewards(client: AsyncClient) -> None:
    from sqlalchemy import func, select

    from app.models.rank import HonorEvent, RankEvent

    token_a, uid_a, token_b, _uid_b, match_id = await _matched_pair(
        client, "rank_retry_a@example.com", "rank_retry_b@example.com", sport="tennis"
    )
    booking_id = await _create_booking(client, token_a, match_id, sport="tennis")
    await _confirm(client, token_b, booking_id)
    assert (await client.post(f"/bookings/{booking_id}/complete", headers=_auth(token_a))).status_code == 200
    assert (await client.post(f"/bookings/{booking_id}/complete", headers=_auth(token_a))).status_code == 422

    async with _TestSession() as session:
        honor_count = (
            await session.execute(
                select(func.count()).select_from(HonorEvent).where(HonorEvent.booking_id == UUID(booking_id))
            )
        ).scalar_one()
        rank_count = (
            await session.execute(
                select(func.count()).select_from(RankEvent).where(RankEvent.booking_id == UUID(booking_id))
            )
        ).scalar_one()
    assert honor_count == 2
    assert rank_count == 2


async def test_no_show_creates_negative_honor_for_other_and_actor(client: AsyncClient) -> None:
    """
    The user who *calls* no_show takes a smaller penalty (anti-abuse). The
    other party takes the larger penalty. Both deltas must land — this is
    the V2.0 mitigation for the one-sided no_show transition.
    """
    token_a, _uid_a, token_b, _uid_b, match_id = await _matched_pair(
        client, "rank_ns_a@example.com", "rank_ns_b@example.com", sport="tennis"
    )
    booking_id = await _create_booking(client, token_a, match_id, sport="tennis")
    await _confirm(client, token_b, booking_id)

    # B marks A as no-show. A is the "other" party (larger penalty); B is
    # the actor (smaller penalty).
    r = await client.post(f"/bookings/{booking_id}/no-show", headers=_auth(token_b))
    assert r.status_code == 200, r.text

    a_summary = (await client.get("/users/me/rank-summary", headers=_auth(token_a))).json()
    b_summary = (await client.get("/users/me/rank-summary", headers=_auth(token_b))).json()
    assert a_summary["honor"] == HONOR_BASELINE + HONOR_DELTA_NO_SHOW_AGAINST_USER
    assert b_summary["honor"] == HONOR_BASELINE + HONOR_DELTA_NO_SHOW_MARKED_BY_USER
    # No rank change — play didn't happen.
    assert a_summary["sports"] == []
    assert b_summary["sports"] == []


async def test_late_cancellation_dings_actor_only(client: AsyncClient) -> None:
    """Cancelling a confirmed booking costs the actor 1 honor; the other party is unaffected."""
    token_a, _uid_a, token_b, _uid_b, match_id = await _matched_pair(
        client, "rank_cancel_a@example.com", "rank_cancel_b@example.com", sport="golf"
    )
    booking_id = await _create_booking(client, token_a, match_id, sport="golf")
    await _confirm(client, token_b, booking_id)

    r = await client.post(f"/bookings/{booking_id}/cancel", headers=_auth(token_a))
    assert r.status_code == 200, r.text

    a_summary = (await client.get("/users/me/rank-summary", headers=_auth(token_a))).json()
    b_summary = (await client.get("/users/me/rank-summary", headers=_auth(token_b))).json()
    assert a_summary["honor"] == HONOR_BASELINE + HONOR_DELTA_LATE_CANCELLATION
    assert b_summary["honor"] == HONOR_BASELINE


async def test_cancelling_a_proposed_booking_has_no_honor_cost(client: AsyncClient) -> None:
    """Cancelling before partner confirms = no commitment broken = no penalty."""
    token_a, _uid_a, token_b, _uid_b, match_id = await _matched_pair(
        client, "rank_pcancel_a@example.com", "rank_pcancel_b@example.com", sport="running"
    )
    booking_id = await _create_booking(client, token_a, match_id, sport="running")
    # No confirmation — cancel from "proposed" directly.
    r = await client.post(f"/bookings/{booking_id}/cancel", headers=_auth(token_a))
    assert r.status_code == 200, r.text

    summary = (await client.get("/users/me/rank-summary", headers=_auth(token_a))).json()
    assert summary["honor"] == HONOR_BASELINE
    assert summary["sports"] == []


async def test_sport_specific_rank_summary_groups_by_sport(client: AsyncClient) -> None:
    """A user playing two sports must get two distinct rank rows."""
    # Pair 1: tennis
    t_a, uid_a, t_b, _uid_b, match_tennis = await _matched_pair(
        client, "rank_multi_a@example.com", "rank_multi_b@example.com", sport="tennis"
    )
    book_tennis = await _create_booking(client, t_a, match_tennis, sport="tennis")
    await _confirm(client, t_b, book_tennis)
    await client.post(f"/bookings/{book_tennis}/complete", headers=_auth(t_a))

    # Pair 2: same A, different partner C, sport=golf
    t_c, _uid_c = await _register(client, "rank_multi_c@example.com")
    await client.post(
        "/discovery/actions",
        json={"target_user_id": _uid_c, "action": "like", "sport": "golf"},
        headers=_auth(t_a),
    )
    match_golf = (
        await client.post(
            "/discovery/actions",
            json={"target_user_id": uid_a, "action": "like", "sport": "golf"},
            headers=_auth(t_c),
        )
    ).json()["match_id"]
    book_golf = await _create_booking(client, t_a, match_golf, sport="golf")
    await _confirm(client, t_c, book_golf)
    await client.post(f"/bookings/{book_golf}/complete", headers=_auth(t_a))

    summary = (await client.get("/users/me/rank-summary", headers=_auth(t_a))).json()
    sport_keys = sorted(s["sport"] for s in summary["sports"])
    assert sport_keys == ["golf", "tennis"]
    for s in summary["sports"]:
        assert s["sessions_completed"] == 1
        assert s["rank_points"] == RANK_DELTA_SESSION_COMPLETED
    # +1 honor per session, two sessions → +2 from baseline.
    assert summary["honor"] == HONOR_BASELINE + 2 * HONOR_DELTA_SESSION_COMPLETED


async def test_honor_floor_clamps_at_zero(client: AsyncClient) -> None:
    """Many large negative events must clamp to HONOR_FLOOR (0), not go negative."""
    from app.models.rank import HonorEvent
    from sqlalchemy import select as _select

    token, uid = await _register(client, "rank_floor@example.com")

    # Hand-seed 50 large negative events (~ -250 raw) directly. The summary
    # service must clamp the response at 0 regardless of the raw sum.
    async with _TestSession() as db:
        from uuid import UUID

        user_uuid = UUID(uid)
        for _ in range(50):
            db.add(
                HonorEvent(
                    user_id=user_uuid,
                    delta=-5,
                    reason="no_show_against_user",
                    booking_id=None,
                )
            )
        await db.commit()
        # Sanity-check: rows landed.
        count = (await db.execute(_select(HonorEvent).where(HonorEvent.user_id == user_uuid))).scalars().all()
        assert len(count) == 50

    r = await client.get("/users/me/rank-summary", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["honor"] == 0


async def test_public_summary_returns_only_safe_fields(client: AsyncClient) -> None:
    """Public-safe summary must never expose negative event details or moderation data."""
    token_a, uid_a, token_b, _uid_b, match_id = await _matched_pair(
        client, "rank_pub_a@example.com", "rank_pub_b@example.com", sport="tennis"
    )
    booking_id = await _create_booking(client, token_a, match_id, sport="tennis")
    await _confirm(client, token_b, booking_id)
    await client.post(f"/bookings/{booking_id}/complete", headers=_auth(token_a))

    # B reads A's public summary.
    r = await client.get(f"/users/{uid_a}/rank-summary", headers=_auth(token_b))
    assert r.status_code == 200
    body = r.json()
    # Schema is the same as self — only honor + sports.
    assert set(body.keys()) == {"honor", "sports"}
    # Sports rows expose only the four publishable fields.
    if body["sports"]:
        for s in body["sports"]:
            assert set(s.keys()) == {"sport", "rank_points", "tier", "sessions_completed"}
    # No event log, no breakdown of negative reasons.
    assert "events" not in body
    assert "no_show_count" not in body
    assert "cancellations" not in body


# ---------------------------------------------------------------------------
# V1.1 Honor / Gang Score — /rank/me and /rank/users/{id}
# ---------------------------------------------------------------------------


from datetime import datetime, timedelta, timezone  # noqa: E402
from uuid import UUID, uuid4  # noqa: E402


async def _wipe_v11_state() -> None:
    """Reset event / participant / report rows between tests."""
    from sqlalchemy import delete

    from app.models.event import Event, EventParticipant
    from app.models.safety import Report

    async with _TestSession() as db:
        await db.execute(delete(Report))
        await db.execute(delete(EventParticipant))
        await db.execute(delete(Event))
        await db.commit()


async def _create_event(
    *,
    host_user_id: str,
    sport: str = "basketball",
    status_value: str = "open",
    capacity: int = 10,
) -> str:
    from app.models.event import Event

    async with _TestSession() as db:
        e = Event(
            id=uuid4(),
            host_user_id=UUID(host_user_id),
            title="Test event",
            sport=sport,
            mode="casual",
            starts_at=datetime.now(tz=timezone.utc) + timedelta(days=7),
            location_text="Bondi Court",
            capacity=capacity,
            visibility="public",
            status=status_value,
        )
        db.add(e)
        await db.commit()
        return str(e.id)


async def _add_participant(
    *,
    event_id: str,
    user_id: str,
    status_value: str = "joined",
    attendance_status: str = "pending",
    host_confirmed: bool = False,
    self_reported: bool = False,
) -> None:
    from app.models.event import EventParticipant

    now = datetime.now(tz=timezone.utc)
    async with _TestSession() as db:
        p = EventParticipant(
            id=uuid4(),
            event_id=UUID(event_id),
            user_id=UUID(user_id),
            status=status_value,
            attendance_status=attendance_status,
            attendance_confirmed_by_host_at=now if host_confirmed else None,
            attendance_self_reported_at=now if self_reported else None,
        )
        db.add(p)
        await db.commit()


async def _set_attendance(
    *,
    event_id: str,
    user_id: str,
    attendance_status: str,
    host_confirmed: bool = True,
) -> None:
    """Update attendance for an existing participant row."""
    from sqlalchemy import update

    from app.models.event import EventParticipant

    now = datetime.now(tz=timezone.utc)
    async with _TestSession() as db:
        await db.execute(
            update(EventParticipant)
            .where(
                EventParticipant.event_id == UUID(event_id),
                EventParticipant.user_id == UUID(user_id),
            )
            .values(
                attendance_status=attendance_status,
                attendance_confirmed_by_host_at=now if host_confirmed else None,
            )
        )
        await db.commit()


async def _add_report(
    *,
    reporter_id: str,
    reported_id: str,
    status_value: str = "submitted",
) -> None:
    from app.models.safety import Report

    async with _TestSession() as db:
        r = Report(
            id=uuid4(),
            reporter_id=UUID(reporter_id),
            target_type="user",
            reported_id=UUID(reported_id),
            target_event_id=None,
            reason="harassment",
            status=status_value,
        )
        db.add(r)
        await db.commit()


# --- /rank/me ---------------------------------------------------------------


async def test_rank_me_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/rank/me")
    assert r.status_code in (401, 403)


async def test_rank_me_defaults_for_new_user(client: AsyncClient) -> None:
    await _wipe_v11_state()
    token, uid = await _register(client, "h_default@example.com")
    r = await client.get("/rank/me", headers=_auth(token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user_id"] == uid
    assert body["honor_score"] == 100
    assert body["honor_level"] == "Regular"
    assert body["gang_score"] == 0
    assert body["completed_games_count"] == 0
    assert body["hosted_games_count"] == 0
    assert body["no_show_count"] == 0
    assert body["excused_count"] == 0
    assert body["pending_count"] == 0
    assert body["sport_levels"] == []
    assert "generated_at" in body


async def test_host_confirmed_attended_increases_honor_and_gang(
    client: AsyncClient,
) -> None:
    await _wipe_v11_state()
    _, host_uid = await _register(client, "h_att_host@example.com")
    token, uid = await _register(client, "h_att_self@example.com")
    event_id = await _create_event(host_user_id=host_uid, sport="basketball")
    await _add_participant(
        event_id=event_id,
        user_id=uid,
        attendance_status="attended",
        host_confirmed=True,
    )

    r = await client.get("/rank/me", headers=_auth(token))
    body = r.json()
    assert body["honor_score"] == 102
    assert body["gang_score"] == 10
    assert body["completed_games_count"] == 1
    sports = body["sport_levels"]
    assert len(sports) == 1
    assert sports[0]["sport"] == "basketball"
    assert sports[0]["xp"] == 10
    assert sports[0]["level"] == 1
    assert sports[0]["attended_count"] == 1
    assert sports[0]["hosted_count"] == 0


async def test_self_reported_only_does_not_move_score(client: AsyncClient) -> None:
    await _wipe_v11_state()
    _, host_uid = await _register(client, "h_self_host@example.com")
    token, uid = await _register(client, "h_self_user@example.com")
    event_id = await _create_event(host_user_id=host_uid)
    await _add_participant(
        event_id=event_id,
        user_id=uid,
        attendance_status="attended",
        host_confirmed=False,
        self_reported=True,
    )

    r = await client.get("/rank/me", headers=_auth(token))
    body = r.json()
    assert body["honor_score"] == 100
    assert body["gang_score"] == 0
    assert body["completed_games_count"] == 0


async def test_host_confirmed_no_show_penalizes_honor(client: AsyncClient) -> None:
    await _wipe_v11_state()
    _, host_uid = await _register(client, "h_ns_host@example.com")
    token, uid = await _register(client, "h_ns_user@example.com")
    event_id = await _create_event(host_user_id=host_uid)
    await _add_participant(
        event_id=event_id,
        user_id=uid,
        attendance_status="no_show",
        host_confirmed=True,
    )

    r = await client.get("/rank/me", headers=_auth(token))
    body = r.json()
    assert body["honor_score"] == 80
    assert body["honor_level"] == "Regular"
    assert body["gang_score"] == 0
    assert body["no_show_count"] == 1


async def test_excused_does_not_penalize(client: AsyncClient) -> None:
    await _wipe_v11_state()
    _, host_uid = await _register(client, "h_ex_host@example.com")
    token, uid = await _register(client, "h_ex_user@example.com")
    event_id = await _create_event(host_user_id=host_uid)
    await _add_participant(
        event_id=event_id,
        user_id=uid,
        attendance_status="excused",
        host_confirmed=True,
    )

    r = await client.get("/rank/me", headers=_auth(token))
    body = r.json()
    assert body["honor_score"] == 100
    assert body["gang_score"] == 0
    assert body["excused_count"] == 1


async def test_pending_does_not_affect_score(client: AsyncClient) -> None:
    await _wipe_v11_state()
    _, host_uid = await _register(client, "h_pd_host@example.com")
    token, uid = await _register(client, "h_pd_user@example.com")
    event_id = await _create_event(host_user_id=host_uid)
    await _add_participant(
        event_id=event_id,
        user_id=uid,
        attendance_status="pending",
        host_confirmed=False,
    )

    r = await client.get("/rank/me", headers=_auth(token))
    body = r.json()
    assert body["honor_score"] == 100
    assert body["gang_score"] == 0
    assert body["pending_count"] == 1


async def test_left_participant_does_not_count_as_no_show(
    client: AsyncClient,
) -> None:
    """Left participants without host confirmation must not be a no_show."""
    await _wipe_v11_state()
    _, host_uid = await _register(client, "h_lf_host@example.com")
    token, uid = await _register(client, "h_lf_user@example.com")
    event_id = await _create_event(host_user_id=host_uid)
    await _add_participant(
        event_id=event_id,
        user_id=uid,
        status_value="left",
        attendance_status="pending",
        host_confirmed=False,
    )

    r = await client.get("/rank/me", headers=_auth(token))
    body = r.json()
    assert body["honor_score"] == 100
    assert body["no_show_count"] == 0


async def test_attendance_change_no_show_to_attended_recomputes(
    client: AsyncClient,
) -> None:
    """Flipping attendance must move the score without double counting."""
    await _wipe_v11_state()
    _, host_uid = await _register(client, "h_chg_host@example.com")
    token, uid = await _register(client, "h_chg_user@example.com")
    event_id = await _create_event(host_user_id=host_uid)
    await _add_participant(
        event_id=event_id,
        user_id=uid,
        attendance_status="no_show",
        host_confirmed=True,
    )

    first = await client.get("/rank/me", headers=_auth(token))
    assert first.json()["honor_score"] == 80
    assert first.json()["no_show_count"] == 1

    await _set_attendance(
        event_id=event_id,
        user_id=uid,
        attendance_status="attended",
    )

    second = await client.get("/rank/me", headers=_auth(token))
    body = second.json()
    assert body["honor_score"] == 102
    assert body["no_show_count"] == 0
    assert body["completed_games_count"] == 1
    assert body["gang_score"] == 10


async def test_repeated_reads_are_idempotent(client: AsyncClient) -> None:
    await _wipe_v11_state()
    _, host_uid = await _register(client, "h_idem_host@example.com")
    token, uid = await _register(client, "h_idem_user@example.com")
    event_id = await _create_event(host_user_id=host_uid)
    await _add_participant(
        event_id=event_id,
        user_id=uid,
        attendance_status="attended",
        host_confirmed=True,
    )

    r1 = (await client.get("/rank/me", headers=_auth(token))).json()
    r2 = (await client.get("/rank/me", headers=_auth(token))).json()
    assert r1["honor_score"] == r2["honor_score"]
    assert r1["gang_score"] == r2["gang_score"]
    assert r1["completed_games_count"] == r2["completed_games_count"]


# --- Host bonus -------------------------------------------------------------


async def test_host_gets_hosted_bonus_once_per_event(client: AsyncClient) -> None:
    await _wipe_v11_state()
    host_tok, host_uid = await _register(client, "h_host_bonus@example.com")
    _, a_uid = await _register(client, "h_host_bonus_a@example.com")
    _, b_uid = await _register(client, "h_host_bonus_b@example.com")
    event_id = await _create_event(host_user_id=host_uid, sport="soccer")

    # Two non-host participants both attended → host gets ONE +15.
    await _add_participant(
        event_id=event_id,
        user_id=a_uid,
        attendance_status="attended",
        host_confirmed=True,
    )
    await _add_participant(
        event_id=event_id,
        user_id=b_uid,
        attendance_status="attended",
        host_confirmed=True,
    )

    r = await client.get("/rank/me", headers=_auth(host_tok))
    body = r.json()
    assert body["hosted_games_count"] == 1
    assert body["gang_score"] == 15
    soccer = [s for s in body["sport_levels"] if s["sport"] == "soccer"][0]
    assert soccer["hosted_count"] == 1
    assert soccer["xp"] == 5  # +5 hosted, 0 attended (host not in participant aggregate)


async def test_host_gets_no_bonus_without_attended_participants(
    client: AsyncClient,
) -> None:
    await _wipe_v11_state()
    host_tok, host_uid = await _register(client, "h_no_bonus@example.com")
    _, a_uid = await _register(client, "h_no_bonus_a@example.com")
    event_id = await _create_event(host_user_id=host_uid)
    await _add_participant(
        event_id=event_id,
        user_id=a_uid,
        attendance_status="pending",
        host_confirmed=False,
    )

    r = await client.get("/rank/me", headers=_auth(host_tok))
    body = r.json()
    assert body["hosted_games_count"] == 0
    assert body["gang_score"] == 0


async def test_cancelled_event_does_not_grant_host_bonus(
    client: AsyncClient,
) -> None:
    await _wipe_v11_state()
    host_tok, host_uid = await _register(client, "h_cxl_host@example.com")
    _, a_uid = await _register(client, "h_cxl_a@example.com")
    event_id = await _create_event(host_user_id=host_uid, status_value="cancelled")
    await _add_participant(
        event_id=event_id,
        user_id=a_uid,
        attendance_status="attended",
        host_confirmed=True,
    )

    r = await client.get("/rank/me", headers=_auth(host_tok))
    body = r.json()
    assert body["hosted_games_count"] == 0
    assert body["gang_score"] == 0


# --- Sport XP / level -------------------------------------------------------


async def test_sport_xp_and_level_calculation(client: AsyncClient) -> None:
    """5 attended × 10 XP = 50 XP → level 2."""
    await _wipe_v11_state()
    _, host_uid = await _register(client, "h_xp_host@example.com")
    token, uid = await _register(client, "h_xp_self@example.com")
    for i in range(5):
        event_id = await _create_event(host_user_id=host_uid, sport="basketball")
        await _add_participant(
            event_id=event_id,
            user_id=uid,
            attendance_status="attended",
            host_confirmed=True,
        )

    r = await client.get("/rank/me", headers=_auth(token))
    sports = r.json()["sport_levels"]
    assert len(sports) == 1
    assert sports[0]["xp"] == 50
    assert sports[0]["level"] == 2
    assert sports[0]["attended_count"] == 5


# --- Reports ---------------------------------------------------------------


async def test_submitted_report_does_not_affect_honor(client: AsyncClient) -> None:
    await _wipe_v11_state()
    _, reporter_uid = await _register(client, "h_sub_reporter@example.com")
    token, uid = await _register(client, "h_sub_target@example.com")
    await _add_report(
        reporter_id=reporter_uid,
        reported_id=uid,
        status_value="submitted",
    )

    r = await client.get("/rank/me", headers=_auth(token))
    assert r.json()["honor_score"] == 100


async def test_dismissed_report_does_not_affect_honor(client: AsyncClient) -> None:
    await _wipe_v11_state()
    _, reporter_uid = await _register(client, "h_dis_reporter@example.com")
    token, uid = await _register(client, "h_dis_target@example.com")
    await _add_report(
        reporter_id=reporter_uid,
        reported_id=uid,
        status_value="dismissed",
    )

    r = await client.get("/rank/me", headers=_auth(token))
    assert r.json()["honor_score"] == 100


async def test_actioned_report_reduces_honor(client: AsyncClient) -> None:
    await _wipe_v11_state()
    _, reporter_uid = await _register(client, "h_act_reporter@example.com")
    token, uid = await _register(client, "h_act_target@example.com")
    await _add_report(
        reporter_id=reporter_uid,
        reported_id=uid,
        status_value="actioned",
    )

    r = await client.get("/rank/me", headers=_auth(token))
    body = r.json()
    assert body["honor_score"] == 70
    assert body["honor_level"] == "Rookie"


# --- Public summary endpoint ------------------------------------------------


async def test_rank_users_public_summary(client: AsyncClient) -> None:
    await _wipe_v11_state()
    _, host_uid = await _register(client, "h_pub_host@example.com")
    token_other, _ = await _register(client, "h_pub_other@example.com")
    _, target_uid = await _register(client, "h_pub_target@example.com")
    event_id = await _create_event(host_user_id=host_uid)
    await _add_participant(
        event_id=event_id,
        user_id=target_uid,
        attendance_status="attended",
        host_confirmed=True,
    )

    r = await client.get(f"/rank/users/{target_uid}", headers=_auth(token_other))
    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == target_uid
    assert body["honor_score"] == 102
    # Public response must NOT leak moderation/event data.
    forbidden_keys = {"reports", "report", "blocks", "block", "attendance_note"}
    assert forbidden_keys.isdisjoint(body.keys())


async def test_rank_users_unknown_user_404(client: AsyncClient) -> None:
    token, _ = await _register(client, "h_pub_404@example.com")
    r = await client.get(
        "/rank/users/00000000-0000-0000-0000-000000000abc",
        headers=_auth(token),
    )
    assert r.status_code == 404


async def test_host_marking_only_self_attended_gets_no_player_credit(
    client: AsyncClient,
) -> None:
    """
    The host's own auto-joined row must not contribute player credit.

    Reproduces the Codex blocker: a host could mark only themselves
    attended and farm +2 Honor / +10 Gang / +10 Sport XP. After the
    fix, the host row is excluded from player aggregates. The hosted
    bonus also stays off because no NON-host participant attended.
    """
    await _wipe_v11_state()
    host_tok, host_uid = await _register(client, "h_self_only_host@example.com")
    event_id = await _create_event(host_user_id=host_uid, sport="basketball")
    # Host auto-join row, marked attended + host-confirmed.
    await _add_participant(
        event_id=event_id,
        user_id=host_uid,
        attendance_status="attended",
        host_confirmed=True,
    )

    r = await client.get("/rank/me", headers=_auth(host_tok))
    body = r.json()
    assert body["honor_score"] == 100
    assert body["gang_score"] == 0
    assert body["completed_games_count"] == 0
    assert body["hosted_games_count"] == 0
    assert body["sport_levels"] == []


async def test_host_self_attendance_plus_non_host_attended(
    client: AsyncClient,
) -> None:
    """
    With one non-host attended participant, the host receives ONLY the
    hosted-event bonus — not an additional player credit from their
    own row.
    """
    await _wipe_v11_state()
    host_tok, host_uid = await _register(client, "h_self_plus_host@example.com")
    p_tok, p_uid = await _register(client, "h_self_plus_player@example.com")
    event_id = await _create_event(host_user_id=host_uid, sport="soccer")
    # Host's own row attended + confirmed.
    await _add_participant(
        event_id=event_id,
        user_id=host_uid,
        attendance_status="attended",
        host_confirmed=True,
    )
    # One real non-host participant.
    await _add_participant(
        event_id=event_id,
        user_id=p_uid,
        attendance_status="attended",
        host_confirmed=True,
    )

    host_body = (await client.get("/rank/me", headers=_auth(host_tok))).json()
    assert host_body["honor_score"] == 100  # no +2 from self row
    assert host_body["gang_score"] == 15  # hosted bonus only
    assert host_body["completed_games_count"] == 0
    assert host_body["hosted_games_count"] == 1
    # Sport XP from hosted bonus only.
    sports = host_body["sport_levels"]
    assert len(sports) == 1
    assert sports[0]["sport"] == "soccer"
    assert sports[0]["xp"] == 5
    assert sports[0]["attended_count"] == 0
    assert sports[0]["hosted_count"] == 1

    # The non-host participant still earns the normal attended credit.
    player_body = (await client.get("/rank/me", headers=_auth(p_tok))).json()
    assert player_body["honor_score"] == 102
    assert player_body["gang_score"] == 10
    assert player_body["completed_games_count"] == 1


async def test_left_participant_with_no_show_does_not_penalize(
    client: AsyncClient,
) -> None:
    """
    A user who left an event must not be penalized as a no_show even
    if the row happens to carry a host-confirmed no_show mark.
    """
    await _wipe_v11_state()
    _, host_uid = await _register(client, "h_left_ns_host@example.com")
    token, uid = await _register(client, "h_left_ns_user@example.com")
    event_id = await _create_event(host_user_id=host_uid)
    # Soft-left row with a no_show + confirmation timestamp.
    await _add_participant(
        event_id=event_id,
        user_id=uid,
        status_value="left",
        attendance_status="no_show",
        host_confirmed=True,
    )

    r = await client.get("/rank/me", headers=_auth(token))
    body = r.json()
    assert body["honor_score"] == 100
    assert body["no_show_count"] == 0
    assert body["gang_score"] == 0
    assert body["sport_levels"] == []


async def test_left_attended_non_host_does_not_grant_hosted_bonus(
    client: AsyncClient,
) -> None:
    """
    Hosted bonus must require an ACTIVE joined non-host attended row.

    If a participant left the event (status='left') but their audit
    row still carries an attended+host-confirmed mark, that row must
    NOT qualify the host for the +15 Gang Score / +5 hosted sport XP.
    """
    await _wipe_v11_state()
    host_tok, host_uid = await _register(client, "h_left_attended_host@example.com")
    _, p_uid = await _register(client, "h_left_attended_player@example.com")
    event_id = await _create_event(host_user_id=host_uid, sport="soccer")
    # Soft-left participant row that still carries attended + host
    # confirmation — the audit-trail shape from an attendance flip
    # followed by a leave (or a direct DB mutation).
    await _add_participant(
        event_id=event_id,
        user_id=p_uid,
        status_value="left",
        attendance_status="attended",
        host_confirmed=True,
    )

    r = await client.get("/rank/me", headers=_auth(host_tok))
    body = r.json()
    assert body["honor_score"] == 100
    assert body["gang_score"] == 0
    assert body["hosted_games_count"] == 0
    assert body["sport_levels"] == []


async def test_cancelled_event_attended_row_does_not_count(
    client: AsyncClient,
) -> None:
    """
    A host-confirmed attended row on a cancelled event must not produce
    Honor, Gang Score, or Sport XP — for the player or for the host.
    """
    await _wipe_v11_state()
    host_tok, host_uid = await _register(client, "h_cxl_attended_host@example.com")
    p_tok, p_uid = await _register(client, "h_cxl_attended_player@example.com")
    event_id = await _create_event(host_user_id=host_uid, status_value="cancelled")
    await _add_participant(
        event_id=event_id,
        user_id=p_uid,
        attendance_status="attended",
        host_confirmed=True,
    )

    # Player aggregates are clean.
    player_body = (await client.get("/rank/me", headers=_auth(p_tok))).json()
    assert player_body["honor_score"] == 100
    assert player_body["gang_score"] == 0
    assert player_body["completed_games_count"] == 0
    assert player_body["sport_levels"] == []

    # Host hosted-bonus already excludes cancelled (regression: pin it).
    host_body = (await client.get("/rank/me", headers=_auth(host_tok))).json()
    assert host_body["honor_score"] == 100
    assert host_body["gang_score"] == 0
    assert host_body["hosted_games_count"] == 0


async def test_rank_response_does_not_leak_raw_data(client: AsyncClient) -> None:
    """
    The HonorSummary schema must contain only the documented sanitized
    fields — pin this so a future regression that adds reports/blocks to
    the response trips the test.
    """
    await _wipe_v11_state()
    token, _ = await _register(client, "h_leak@example.com")

    r = await client.get("/rank/me", headers=_auth(token))
    assert r.status_code == 200
    body = r.json()
    allowed_keys = {
        "user_id",
        "honor_score",
        "honor_level",
        "gang_score",
        "completed_games_count",
        "hosted_games_count",
        "no_show_count",
        "excused_count",
        "pending_count",
        "sport_levels",
        "generated_at",
    }
    assert set(body.keys()) == allowed_keys
    for sport in body["sport_levels"]:
        assert set(sport.keys()) == {
            "sport",
            "xp",
            "level",
            "attended_count",
            "hosted_count",
        }
