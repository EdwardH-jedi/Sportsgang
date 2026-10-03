"""My Plans segments on GET /events?mine=true and GET /bookings (review F2).

`segment` + `as_of` return one lifecycle segment, ordered by
(starts_at, id) — Past newest first — so Upcoming/Pending never depend on
how much history exists and every segment pages deterministically. The
segment rules mirror the mobile buildPlanItems lifecycle
(docs/run-golf-v2/CONTRACTS.md §6). In-memory SQLite; the 51+ history
journey on PostgreSQL lives in tests_integration.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app
from app.models.booking import Booking
from app.models.event import Event, EventParticipant

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

_engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
_TestSession = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)

NOW = datetime.now(timezone.utc).replace(microsecond=0)
AS_OF = NOW.isoformat().replace("+00:00", "Z")


@pytest.fixture(autouse=True)
async def fresh_tables() -> AsyncGenerator[None, None]:
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


async def _user(client: AsyncClient, name: str) -> tuple[dict[str, str], str]:
    r = await client.post(
        "/auth/register", json={"email": f"{name}_{uuid.uuid4().hex[:6]}@example.com", "password": "pw123456"}
    )
    assert r.status_code == 201, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    me = await client.get("/auth/me", headers=headers)
    return headers, me.json()["id"]


async def _event(host: str, starts_at: datetime, *, status: str = "open", members: tuple[str, ...] = ()) -> str:
    """Insert an event directly (past start times cannot be created via the API)."""
    async with _TestSession() as db:
        e = Event(
            host_user_id=uuid.UUID(host),
            title=f"Session {starts_at:%m%d%H%M}",
            sport="running",
            mode="casual",
            starts_at=starts_at,
            location_text="Centennial Park",
            capacity=8,
            visibility="public",
            status=status,
        )
        db.add(e)
        await db.flush()
        db.add(EventParticipant(event_id=e.id, user_id=uuid.UUID(host), status="joined"))
        for member in members:
            db.add(EventParticipant(event_id=e.id, user_id=uuid.UUID(member), status="joined"))
        await db.commit()
        return str(e.id)


async def _mine(client: AsyncClient, headers: dict, query: str) -> dict:
    r = await client.get(f"/events?mine=true&{query}", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _ids(body: dict) -> list[str]:
    return [item["id"] for item in body["items"]]


# ---------------------------------------------------------------------------
# Group sessions
# ---------------------------------------------------------------------------


async def test_event_segments_follow_the_plans_lifecycle(client: AsyncClient) -> None:
    me, me_id = await _user(client, "me")
    _, sam_id = await _user(client, "sam")
    hosting = await _event(me_id, NOW + timedelta(days=2))
    joined_full = await _event(sam_id, NOW + timedelta(days=1), status="full", members=(me_id,))
    cancelled_future = await _event(me_id, NOW + timedelta(days=3), status="cancelled")
    completed_future_dated = await _event(sam_id, NOW + timedelta(days=4), status="completed", members=(me_id,))
    started = await _event(sam_id, NOW - timedelta(hours=2), members=(me_id,))
    old = await _event(me_id, NOW - timedelta(days=30), status="completed")
    await _event(sam_id, NOW + timedelta(days=5))  # not mine

    upcoming = await _mine(client, me, f"segment=upcoming&as_of={AS_OF}")
    assert _ids(upcoming) == [joined_full, hosting]
    assert upcoming["total"] == 2
    past = await _mine(client, me, f"segment=past&as_of={AS_OF}")
    # Newest first, including future-dated cancelled/completed sessions.
    assert _ids(past) == [completed_future_dated, cancelled_future, started, old]
    assert past["total"] == 4

    # The legacy listing is unchanged: everything mine, oldest first.
    legacy = await _mine(client, me, "limit=50")
    assert _ids(legacy) == [old, started, joined_full, hosting, cancelled_future, completed_future_dated]


async def test_a_left_session_is_in_neither_segment(client: AsyncClient) -> None:
    me, me_id = await _user(client, "me")
    host, host_id = await _user(client, "host")
    created = await client.post(
        "/events",
        json={
            "title": "Run",
            "sport": "running",
            "mode": "casual",
            "starts_at": (NOW + timedelta(days=2)).isoformat(),
            "location_text": "Park",
            "capacity": 4,
        },
        headers=host,
    )
    event_id = created.json()["id"]
    assert (await client.post(f"/events/{event_id}/join", headers=me)).status_code == 200
    assert _ids(await _mine(client, me, f"segment=upcoming&as_of={AS_OF}")) == [event_id]
    assert (await client.post(f"/events/{event_id}/leave", headers=me)).status_code == 200
    for segment in ("upcoming", "past"):
        assert _ids(await _mine(client, me, f"segment={segment}&as_of={AS_OF}")) == []
    # The host still has it.
    assert _ids(await _mine(client, host, f"segment=upcoming&as_of={AS_OF}")) == [event_id]


async def test_as_of_fixes_the_classification_for_every_page(client: AsyncClient) -> None:
    me, me_id = await _user(client, "me")
    soon = await _event(me_id, NOW + timedelta(minutes=30))
    before = (NOW + timedelta(minutes=29)).isoformat().replace("+00:00", "Z")
    after = (NOW + timedelta(minutes=31)).isoformat().replace("+00:00", "Z")
    assert _ids(await _mine(client, me, f"segment=upcoming&as_of={before}")) == [soon]
    assert _ids(await _mine(client, me, f"segment=past&as_of={before}")) == []
    assert _ids(await _mine(client, me, f"segment=upcoming&as_of={after}")) == []
    assert _ids(await _mine(client, me, f"segment=past&as_of={after}")) == [soon]
    # Offset-free as_of is UTC, like every API instant.
    naive_after = (NOW + timedelta(minutes=31)).replace(tzinfo=None).isoformat()
    assert _ids(await _mine(client, me, f"segment=past&as_of={naive_after}")) == [soon]


async def test_equal_start_times_page_deterministically(client: AsyncClient) -> None:
    me, me_id = await _user(client, "me")
    same = NOW + timedelta(days=3)
    ids = [await _event(me_id, same) for _ in range(5)]
    seen: list[str] = []
    for offset in range(0, 6, 2):
        page = await _mine(client, me, f"segment=upcoming&as_of={AS_OF}&limit=2&offset={offset}")
        assert page["total"] == 5
        seen += _ids(page)
    assert seen == sorted(ids)  # id breaks the tie, no duplicates, nothing skipped
    past_same = NOW - timedelta(days=3)
    old_ids = [await _event(me_id, past_same, status="completed") for _ in range(3)]
    past = await _mine(client, me, f"segment=past&as_of={AS_OF}")
    assert _ids(past) == sorted(old_ids, reverse=True)


async def test_segment_needs_mine_and_a_known_value(client: AsyncClient) -> None:
    me, _ = await _user(client, "me")
    r = await client.get(f"/events?segment=upcoming&as_of={AS_OF}", headers=me)
    assert r.status_code == 422
    assert r.json()["detail"] == "segment is only available with mine=true"
    r = await client.get("/events?mine=true&segment=pending", headers=me)
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# 1:1 bookings
# ---------------------------------------------------------------------------


async def _match(client: AsyncClient, a: tuple[dict, str], b: tuple[dict, str]) -> str:
    for (headers, _), (_, target) in ((a, b), (b, a)):
        r = await client.post(
            "/discovery/actions",
            json={"target_user_id": target, "action": "like", "sport": "running"},
            headers=headers,
        )
    return r.json()["match_id"]


async def _booking(match_id: str, proposer: str, partner: str, starts_at: datetime, status: str, hours: int = 1) -> str:
    async with _TestSession() as db:
        b = Booking(
            match_id=uuid.UUID(match_id),
            proposer_id=uuid.UUID(proposer),
            partner_id=uuid.UUID(partner),
            sport="running",
            starts_at=starts_at,
            ends_at=starts_at + timedelta(hours=hours),
            status=status,
        )
        db.add(b)
        await db.commit()
        return str(b.id)


async def _bookings(client: AsyncClient, headers: dict, query: str) -> dict:
    r = await client.get(f"/bookings?{query}", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


async def test_booking_segments_follow_the_plans_lifecycle(client: AsyncClient) -> None:
    me = await _user(client, "me")
    alex = await _user(client, "alex")
    match_id = await _match(client, me, alex)
    me_id, alex_id = me[1], alex[1]
    proposal = await _booking(match_id, alex_id, me_id, NOW + timedelta(days=2), "proposed")
    stale_proposal = await _booking(match_id, me_id, alex_id, NOW - timedelta(days=1), "proposed")
    confirmed = await _booking(match_id, me_id, alex_id, NOW + timedelta(days=1), "confirmed")
    in_progress = await _booking(match_id, me_id, alex_id, NOW - timedelta(minutes=30), "confirmed", hours=2)
    ended = await _booking(match_id, me_id, alex_id, NOW - timedelta(days=2), "confirmed")
    cancelled_future = await _booking(match_id, me_id, alex_id, NOW + timedelta(days=3), "cancelled")
    completed_future_dated = await _booking(match_id, me_id, alex_id, NOW + timedelta(days=4), "completed")
    declined = await _booking(match_id, alex_id, me_id, NOW + timedelta(days=5), "declined")

    q = f"as_of={AS_OF}"
    pending = await _bookings(client, me[0], f"segment=pending&{q}")
    assert (_ids(pending), pending["total"]) == ([proposal], 1)
    upcoming = await _bookings(client, me[0], f"segment=upcoming&{q}")
    # A confirmed session in progress stays upcoming until it ends.
    assert _ids(upcoming) == [in_progress, confirmed]
    past = await _bookings(client, me[0], f"segment=past&{q}")
    assert _ids(past) == [declined, completed_future_dated, cancelled_future, stale_proposal, ended]
    assert past["total"] == 5
    # The status filter the app sends still combines with the segment.
    only_terminal = await _bookings(client, me[0], f"segment=past&{q}&status=cancelled,declined")
    assert _ids(only_terminal) == [declined, cancelled_future]


async def test_booking_segments_stay_private_to_participants(client: AsyncClient) -> None:
    me = await _user(client, "me")
    alex = await _user(client, "alex")
    other = await _user(client, "other")
    match_id = await _match(client, me, alex)
    await _booking(match_id, me[1], alex[1], NOW + timedelta(days=1), "confirmed")
    for segment in ("upcoming", "pending", "past"):
        body = await _bookings(client, other[0], f"segment={segment}&as_of={AS_OF}")
        assert (body["items"], body["total"]) == ([], 0)


async def test_history_never_displaces_upcoming_or_pending(client: AsyncClient) -> None:
    me = await _user(client, "me")
    alex = await _user(client, "alex")
    match_id = await _match(client, me, alex)
    history = [await _booking(match_id, me[1], alex[1], NOW - timedelta(days=100 - i), "completed") for i in range(55)]
    confirmed = await _booking(match_id, me[1], alex[1], NOW + timedelta(days=6), "confirmed")
    proposal = await _booking(match_id, alex[1], me[1], NOW + timedelta(days=7), "proposed")

    # The old client's first page of 50 holds only history.
    legacy = await _bookings(client, me[0], "limit=50")
    assert confirmed not in _ids(legacy) and proposal not in _ids(legacy)

    q = f"as_of={AS_OF}&limit=20"
    assert _ids(await _bookings(client, me[0], f"segment=upcoming&{q}")) == [confirmed]
    assert _ids(await _bookings(client, me[0], f"segment=pending&{q}")) == [proposal]
    seen: list[str] = []
    for offset in (0, 20, 40, 60):
        page = await _bookings(client, me[0], f"segment=past&{q}&offset={offset}")
        assert page["total"] == 55
        seen += _ids(page)
    assert seen == list(reversed(history))
