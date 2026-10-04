"""Event create / list / detail / join / leave tests using in-memory SQLite."""

from __future__ import annotations

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
from app.models import (  # noqa: F401  — populate Base.metadata
    booking,
    chat,
    event,
    match,
    profile,
    rank,
    safety,
    tournament,
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
# Helpers
# ---------------------------------------------------------------------------


async def _register(client: AsyncClient, email: str) -> tuple[str, str]:
    r = await client.post("/auth/register", json={"email": email, "password": "password123"})
    token = r.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    return token, me.json()["id"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _payload(**overrides) -> dict:
    # Default to a `starts_at` slightly in the past so existing
    # attendance-flow tests pass the new time-eligibility gate. Tests
    # that need a future event explicitly pass `starts_at` themselves.
    starts_at = (datetime.now(tz=timezone.utc) - timedelta(hours=1)).isoformat()
    body = {
        "title": "Bondi pickup hoops",
        "sport": "basketball",
        "mode": "casual",
        "starts_at": starts_at,
        "location_text": "Bondi Beach Court",
        "capacity": 10,
        "visibility": "public",
        "description": "Casual run, all welcome",
    }
    body.update(overrides)
    return body


def _future_starts_at(*, hours: int = 6) -> str:
    return (datetime.now(tz=timezone.utc) + timedelta(hours=hours)).isoformat()


async def _set_event_starts_at(event_id: str, when: datetime) -> None:
    """Helper for tests that need to push an event into the past."""
    from uuid import UUID

    from sqlalchemy import update

    from app.models.event import Event

    async with _TestSession() as db:
        await db.execute(update(Event).where(Event.id == UUID(event_id)).values(starts_at=when))
        await db.commit()


async def _wipe_events() -> None:
    from sqlalchemy import delete

    from app.models.event import Event, EventParticipant

    async with _TestSession() as db:
        await db.execute(delete(EventParticipant))
        await db.execute(delete(Event))
        await db.commit()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


async def test_list_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/events")
    assert r.status_code in (401, 403)


async def test_create_requires_auth(client: AsyncClient) -> None:
    r = await client.post("/events", json=_payload())
    assert r.status_code in (401, 403)


async def test_detail_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/events/00000000-0000-0000-0000-000000000000")
    assert r.status_code in (401, 403)


async def test_join_requires_auth(client: AsyncClient) -> None:
    r = await client.post("/events/00000000-0000-0000-0000-000000000000/join")
    assert r.status_code in (401, 403)


async def test_leave_requires_auth(client: AsyncClient) -> None:
    r = await client.post("/events/00000000-0000-0000-0000-000000000000/leave")
    assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


async def test_create_event_returns_detail(client: AsyncClient) -> None:
    await _wipe_events()
    token, uid = await _register(client, "evt_create@example.com")

    r = await client.post("/events", json=_payload(), headers=_auth(token))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["title"] == "Bondi pickup hoops"
    assert body["sport"] == "basketball"
    assert body["mode"] == "casual"
    assert body["status"] == "open"
    assert body["host_user_id"] == uid
    # Host auto-joins.
    assert body["participant_count"] == 1
    assert body["has_joined"] is True
    assert body["host"]["id"] == uid


async def test_create_event_blocked_by_moderation_returns_422(
    client: AsyncClient,
) -> None:
    """
    Title with disallowed text → 422 with safe message; no event row.

    Uses ``BANNED_PROFANITY_FIXTURE`` so the test file doesn't enumerate
    real slurs. Real-word coverage lives in
    ``apps/api/tests/test_content_moderation.py``.
    """
    await _wipe_events()
    token, _ = await _register(client, "evt_mod_title@example.com")

    r = await client.post(
        "/events",
        json=_payload(title="BANNED_PROFANITY_FIXTURE pickup hoops"),
        headers=_auth(token),
    )
    assert r.status_code == 422, r.text
    assert "community guidelines" in r.json()["detail"].lower()
    assert "BANNED" not in r.json()["detail"]

    # No event persisted.
    listing = await client.get("/events", headers=_auth(token))
    assert listing.json()["items"] == []


async def test_create_event_blocked_when_description_violates(
    client: AsyncClient,
) -> None:
    await _wipe_events()
    token, _ = await _register(client, "evt_mod_desc@example.com")

    r = await client.post(
        "/events",
        json=_payload(description="Free game! BANNED_SPAM_FIXTURE today"),
        headers=_auth(token),
    )
    assert r.status_code == 422, r.text
    assert "community guidelines" in r.json()["detail"].lower()


async def test_create_event_allows_normal_venue_name_in_location_text(
    client: AsyncClient,
) -> None:
    """
    Curated venue names from the picker must pass through. The backend
    does not moderate ``location_text`` (see ``services/events.py``).
    """
    await _wipe_events()
    token, _ = await _register(client, "evt_loc_safe@example.com")

    r = await client.post(
        "/events",
        json=_payload(location_text="Anytime Fitness Surry Hills, 428 Crown St"),
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text


async def test_create_event_capacity_must_be_positive(client: AsyncClient) -> None:
    await _wipe_events()
    token, _ = await _register(client, "evt_cap0@example.com")

    r = await client.post("/events", json=_payload(capacity=0), headers=_auth(token))
    assert r.status_code == 422


async def test_create_event_rejects_private_for_now(client: AsyncClient) -> None:
    await _wipe_events()
    token, _ = await _register(client, "evt_private@example.com")

    r = await client.post("/events", json=_payload(visibility="private"), headers=_auth(token))
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


async def test_list_returns_empty_for_fresh_user_with_no_events(
    client: AsyncClient,
) -> None:
    """
    Belt-and-suspenders: the mobile Battles screen ("Find a battle")
    must receive ``200 {items: [], total: 0}`` for a brand-new user when
    no events exist. A 404 / 500 here would break the empty-state UX.
    """
    await _wipe_events()
    token, _ = await _register(client, "evt_empty@example.com")
    r = await client.get("/events", headers=_auth(token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body == {"items": [], "total": 0}


async def test_list_returns_open_events(client: AsyncClient) -> None:
    await _wipe_events()
    token, _ = await _register(client, "evt_list@example.com")
    create = await client.post("/events", json=_payload(title="Soccer kickabout", sport="soccer"), headers=_auth(token))
    assert create.status_code == 201

    r = await client.get("/events", headers=_auth(token))
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "Soccer kickabout"
    assert body["items"][0]["sport"] == "soccer"


async def test_list_filters_by_sport(client: AsyncClient) -> None:
    await _wipe_events()
    token, _ = await _register(client, "evt_list_sport@example.com")
    await client.post("/events", json=_payload(sport="tennis", title="T"), headers=_auth(token))
    await client.post("/events", json=_payload(sport="golf", title="G"), headers=_auth(token))

    r = await client.get("/events?sport=tennis", headers=_auth(token))
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["sport"] == "tennis"


async def test_list_filters_by_mode(client: AsyncClient) -> None:
    await _wipe_events()
    token, _ = await _register(client, "evt_list_mode@example.com")
    await client.post("/events", json=_payload(mode="ranked", title="R"), headers=_auth(token))
    await client.post("/events", json=_payload(mode="casual", title="C"), headers=_auth(token))

    r = await client.get("/events?mode=ranked", headers=_auth(token))
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["mode"] == "ranked"


# ---------------------------------------------------------------------------
# Detail
# ---------------------------------------------------------------------------


async def test_detail_returns_participants(client: AsyncClient) -> None:
    await _wipe_events()
    token_a, _uid_a = await _register(client, "evt_detail_a@example.com")
    token_b, _uid_b = await _register(client, "evt_detail_b@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(token_a))
    event_id = created.json()["id"]

    r = await client.post(f"/events/{event_id}/join", headers=_auth(token_b))
    assert r.status_code == 200

    r = await client.get(f"/events/{event_id}", headers=_auth(token_a))
    assert r.status_code == 200
    body = r.json()
    assert body["participant_count"] == 2
    assert body["spots_left"] == 8
    assert len(body["participants"]) == 2


async def test_detail_unknown_event_returns_404(client: AsyncClient) -> None:
    token, _ = await _register(client, "evt_404@example.com")
    r = await client.get("/events/00000000-0000-0000-0000-000000000999", headers=_auth(token))
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Join
# ---------------------------------------------------------------------------


async def test_join_increments_participant_count(client: AsyncClient) -> None:
    await _wipe_events()
    token_a, _ = await _register(client, "evt_join_a@example.com")
    token_b, _ = await _register(client, "evt_join_b@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(token_a))
    event_id = created.json()["id"]

    r = await client.post(f"/events/{event_id}/join", headers=_auth(token_b))
    assert r.status_code == 200
    body = r.json()
    assert body["participant_count"] == 2
    assert body["has_joined"] is True
    assert body["status"] == "open"


async def test_cannot_join_twice_returns_409(client: AsyncClient) -> None:
    await _wipe_events()
    token_a, _ = await _register(client, "evt_dup_a@example.com")
    token_b, _ = await _register(client, "evt_dup_b@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(token_a))
    event_id = created.json()["id"]

    r1 = await client.post(f"/events/{event_id}/join", headers=_auth(token_b))
    assert r1.status_code == 200
    r2 = await client.post(f"/events/{event_id}/join", headers=_auth(token_b))
    assert r2.status_code == 409


async def test_host_cannot_join_twice(client: AsyncClient) -> None:
    """Host is auto-joined on create — explicit join must 409."""
    await _wipe_events()
    token, _ = await _register(client, "evt_host_dup@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(token))
    event_id = created.json()["id"]

    r = await client.post(f"/events/{event_id}/join", headers=_auth(token))
    assert r.status_code == 409


async def test_capacity_enforced_and_status_flips_to_full(client: AsyncClient) -> None:
    await _wipe_events()
    a_tok, _ = await _register(client, "evt_cap_a@example.com")
    b_tok, _ = await _register(client, "evt_cap_b@example.com")
    c_tok, _ = await _register(client, "evt_cap_c@example.com")

    created = await client.post("/events", json=_payload(capacity=2), headers=_auth(a_tok))
    event_id = created.json()["id"]
    # Host already filled slot 1; B fills slot 2 — flips to full.
    fill = await client.post(f"/events/{event_id}/join", headers=_auth(b_tok))
    assert fill.status_code == 200
    assert fill.json()["status"] == "full"

    third = await client.post(f"/events/{event_id}/join", headers=_auth(c_tok))
    assert third.status_code == 422
    assert "full" in third.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Leave
# ---------------------------------------------------------------------------


async def test_leave_after_join_decrements_count(client: AsyncClient) -> None:
    await _wipe_events()
    a_tok, _ = await _register(client, "evt_leave_a@example.com")
    b_tok, _ = await _register(client, "evt_leave_b@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(a_tok))
    event_id = created.json()["id"]

    await client.post(f"/events/{event_id}/join", headers=_auth(b_tok))
    r = await client.post(f"/events/{event_id}/leave", headers=_auth(b_tok))
    assert r.status_code == 200
    body = r.json()
    assert body["participant_count"] == 1
    assert body["has_joined"] is False


async def test_full_to_open_round_trip(client: AsyncClient) -> None:
    await _wipe_events()
    a_tok, _ = await _register(client, "evt_cycle_a@example.com")
    b_tok, _ = await _register(client, "evt_cycle_b@example.com")

    created = await client.post("/events", json=_payload(capacity=2), headers=_auth(a_tok))
    event_id = created.json()["id"]

    fill = await client.post(f"/events/{event_id}/join", headers=_auth(b_tok))
    assert fill.json()["status"] == "full"

    left = await client.post(f"/events/{event_id}/leave", headers=_auth(b_tok))
    assert left.status_code == 200
    assert left.json()["status"] == "open"
    assert left.json()["participant_count"] == 1


async def test_cannot_leave_when_not_joined(client: AsyncClient) -> None:
    await _wipe_events()
    a_tok, _ = await _register(client, "evt_noleave_a@example.com")
    b_tok, _ = await _register(client, "evt_noleave_b@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(a_tok))
    event_id = created.json()["id"]

    r = await client.post(f"/events/{event_id}/leave", headers=_auth(b_tok))
    assert r.status_code == 404


async def test_rejoin_after_leave(client: AsyncClient) -> None:
    """Re-activates the soft-left row instead of creating a duplicate."""
    await _wipe_events()
    a_tok, _ = await _register(client, "evt_rejoin_a@example.com")
    b_tok, _ = await _register(client, "evt_rejoin_b@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(a_tok))
    event_id = created.json()["id"]

    await client.post(f"/events/{event_id}/join", headers=_auth(b_tok))
    await client.post(f"/events/{event_id}/leave", headers=_auth(b_tok))
    rejoin = await client.post(f"/events/{event_id}/join", headers=_auth(b_tok))
    assert rejoin.status_code == 200
    assert rejoin.json()["participant_count"] == 2
    assert rejoin.json()["has_joined"] is True


async def test_every_membership_transition_takes_its_time_from_one_clock(client: AsyncClient, monkeypatch) -> None:
    """Host auto-join, first join, leave and rejoin all use _membership_time (review MA-A)."""
    from uuid import UUID

    from sqlalchemy import select

    from app.models.event import EventParticipant
    from app.services import events as events_service

    await _wipe_events()
    base = datetime(2026, 10, 4, 1, 0, tzinfo=timezone.utc)
    instants = iter(base + timedelta(minutes=i) for i in range(4))

    async def clock(db) -> datetime:
        return next(instants)

    monkeypatch.setattr(events_service, "_membership_time", clock)
    a_tok, _ = await _register(client, "evt_clock_a@example.com")
    b_tok, b_id = await _register(client, "evt_clock_b@example.com")
    event_id = (await client.post("/events", json=_payload(), headers=_auth(a_tok))).json()["id"]

    async def guest_row() -> EventParticipant:
        async with _TestSession() as db:
            stmt = select(EventParticipant).where(EventParticipant.user_id == UUID(b_id))
            return (await db.execute(stmt)).scalar_one()

    assert (await client.post(f"/events/{event_id}/join", headers=_auth(b_tok))).status_code == 200
    first = await guest_row()
    assert (await client.post(f"/events/{event_id}/leave", headers=_auth(b_tok))).status_code == 200
    left = await guest_row()
    assert (await client.post(f"/events/{event_id}/join", headers=_auth(b_tok))).status_code == 200
    rejoined = await guest_row()

    def utc(value: datetime) -> datetime:  # SQLite returns naive UTC
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value

    assert utc(first.joined_at) == base + timedelta(minutes=1)  # minute 0 was the host's auto-join
    assert utc(left.left_at) == base + timedelta(minutes=2)
    assert rejoined.id == first.id and rejoined.left_at is None
    assert utc(rejoined.joined_at) == base + timedelta(minutes=3)


async def test_host_cannot_leave_own_event(client: AsyncClient) -> None:
    """
    Host cannot orphan their own event until a cancel / transfer-host
    flow exists. The host participant row must stay active and the
    participant count must not change.
    """
    await _wipe_events()
    host_tok, host_uid = await _register(client, "evt_host_leave@example.com")
    other_tok, _ = await _register(client, "evt_host_leave_b@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]

    # Pull in a second participant so the count check has signal.
    await client.post(f"/events/{event_id}/join", headers=_auth(other_tok))

    r = await client.post(f"/events/{event_id}/leave", headers=_auth(host_tok))
    assert r.status_code == 409
    assert "host cannot leave" in r.json()["detail"].lower()

    detail = await client.get(f"/events/{event_id}", headers=_auth(host_tok))
    body = detail.json()
    assert body["host_user_id"] == host_uid
    assert body["has_joined"] is True  # host still active
    assert body["participant_count"] == 2
    participant_ids = {p["user_id"] for p in body["participants"]}
    assert host_uid in participant_ids


# ---------------------------------------------------------------------------
# Private event visibility
# ---------------------------------------------------------------------------


async def _seed_private_event(*, host_user_id: str, title: str = "Friends only") -> str:
    """
    Seed a private event directly via the ORM — the public POST /events
    rejects visibility='private' for now, so we go around it to verify
    the defensive read-side guard still holds.
    """
    from uuid import UUID, uuid4

    from app.models.event import Event, EventParticipant

    async with _TestSession() as db:
        e = Event(
            id=uuid4(),
            host_user_id=UUID(host_user_id),
            title=title,
            sport="basketball",
            mode="casual",
            starts_at=datetime.now(tz=timezone.utc) + timedelta(days=7),
            location_text="Bondi Court",
            capacity=10,
            visibility="private",
            status="open",
        )
        db.add(e)
        await db.flush()
        # Host auto-joins, same as the public create path.
        db.add(
            EventParticipant(
                event_id=e.id,
                user_id=UUID(host_user_id),
                status="joined",
            )
        )
        await db.commit()
        return str(e.id)


async def test_private_event_hidden_from_non_participant(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, host_uid = await _register(client, "evt_priv_host@example.com")
    outsider_tok, _ = await _register(client, "evt_priv_outsider@example.com")
    event_id = await _seed_private_event(host_user_id=host_uid)

    r = await client.get(f"/events/{event_id}", headers=_auth(outsider_tok))
    # Hide rather than 403 so non-participants can't probe for existence.
    assert r.status_code == 404


async def test_private_event_visible_to_host(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, host_uid = await _register(client, "evt_priv_host_self@example.com")
    event_id = await _seed_private_event(host_user_id=host_uid)

    r = await client.get(f"/events/{event_id}", headers=_auth(host_tok))
    assert r.status_code == 200
    assert r.json()["visibility"] == "private"


async def test_private_event_visible_to_active_participant(
    client: AsyncClient,
) -> None:
    from uuid import UUID

    from app.models.event import EventParticipant

    await _wipe_events()
    host_tok, host_uid = await _register(client, "evt_priv_host_p@example.com")
    member_tok, member_uid = await _register(client, "evt_priv_member@example.com")
    event_id = await _seed_private_event(host_user_id=host_uid)

    # Inject the member as a joined participant. POST /events/{id}/join
    # works for private rows too (the join service doesn't gate on
    # visibility yet), but bypassing it keeps this test focused on the
    # read-side guard.
    async with _TestSession() as db:
        db.add(
            EventParticipant(
                event_id=UUID(event_id),
                user_id=UUID(member_uid),
                status="joined",
            )
        )
        await db.commit()

    r = await client.get(f"/events/{event_id}", headers=_auth(member_tok))
    assert r.status_code == 200
    assert r.json()["has_joined"] is True


async def test_private_event_join_blocked_for_outsider(client: AsyncClient) -> None:
    """
    Closes the read-via-join bypass: outsider who knows the private
    event ID must not be able to join, otherwise they become an active
    participant and re-pass the detail-side 404 check.
    """
    await _wipe_events()
    host_tok, host_uid = await _register(client, "evt_priv_join_host@example.com")
    outsider_tok, _ = await _register(client, "evt_priv_join_out@example.com")
    event_id = await _seed_private_event(host_user_id=host_uid)

    # Confirm starting state — only the host is active.
    before = await client.get(f"/events/{event_id}", headers=_auth(host_tok))
    assert before.status_code == 200
    assert before.json()["participant_count"] == 1

    r = await client.post(f"/events/{event_id}/join", headers=_auth(outsider_tok))
    # Same hide-as-404 behavior as the detail-side guard.
    assert r.status_code == 404

    # The outsider must not have become an active participant.
    after = await client.get(f"/events/{event_id}", headers=_auth(host_tok))
    body = after.json()
    assert body["participant_count"] == 1
    participant_ids = {p["user_id"] for p in body["participants"]}
    assert participant_ids == {host_uid}

    # And the outsider still cannot read the detail (the bypass is closed).
    detail = await client.get(f"/events/{event_id}", headers=_auth(outsider_tok))
    assert detail.status_code == 404


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------


def _attendance_for(items: list[dict], user_id: str) -> dict | None:
    for it in items:
        if it["participant_user_id"] == user_id:
            return it
    return None


async def test_attendance_defaults_to_pending_for_host(client: AsyncClient) -> None:
    """After event create, the host auto-join row is attendance=pending."""
    await _wipe_events()
    host_tok, host_uid = await _register(client, "evt_att_host@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]

    r = await client.get(f"/events/{event_id}/attendance", headers=_auth(host_tok))
    assert r.status_code == 200
    body = r.json()
    entry = _attendance_for(body["items"], host_uid)
    assert entry is not None
    assert entry["attendance_status"] == "pending"


async def test_attendance_defaults_to_pending_after_join(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_att_p_host@example.com")
    p_tok, p_uid = await _register(client, "evt_att_p@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]

    await client.post(f"/events/{event_id}/join", headers=_auth(p_tok))

    r = await client.get(f"/events/{event_id}/attendance", headers=_auth(host_tok))
    body = r.json()
    entry = _attendance_for(body["items"], p_uid)
    assert entry is not None
    assert entry["attendance_status"] == "pending"


async def test_host_marks_participant_attended(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_mark_host@example.com")
    p_tok, p_uid = await _register(client, "evt_mark_p@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/join", headers=_auth(p_tok))

    r = await client.post(
        f"/events/{event_id}/attendance",
        json={"participant_user_id": p_uid, "attendance_status": "attended"},
        headers=_auth(host_tok),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["participant_user_id"] == p_uid
    assert body["attendance_status"] == "attended"
    assert body["attendance_confirmed_by_host_at"] is not None


async def test_host_marks_participant_no_show(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_ns_host@example.com")
    p_tok, p_uid = await _register(client, "evt_ns_p@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/join", headers=_auth(p_tok))

    r = await client.post(
        f"/events/{event_id}/attendance",
        json={"participant_user_id": p_uid, "attendance_status": "no_show"},
        headers=_auth(host_tok),
    )
    assert r.status_code == 200
    assert r.json()["attendance_status"] == "no_show"


async def test_host_marks_participant_excused(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_exc_host@example.com")
    p_tok, p_uid = await _register(client, "evt_exc_p@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/join", headers=_auth(p_tok))

    r = await client.post(
        f"/events/{event_id}/attendance",
        json={"participant_user_id": p_uid, "attendance_status": "excused"},
        headers=_auth(host_tok),
    )
    assert r.status_code == 200
    assert r.json()["attendance_status"] == "excused"


async def test_host_can_reset_to_pending(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_reset_host@example.com")
    p_tok, p_uid = await _register(client, "evt_reset_p@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/join", headers=_auth(p_tok))

    await client.post(
        f"/events/{event_id}/attendance",
        json={"participant_user_id": p_uid, "attendance_status": "attended"},
        headers=_auth(host_tok),
    )
    r = await client.post(
        f"/events/{event_id}/attendance",
        json={"participant_user_id": p_uid, "attendance_status": "pending"},
        headers=_auth(host_tok),
    )
    assert r.status_code == 200
    assert r.json()["attendance_status"] == "pending"


async def test_non_host_cannot_mark_others(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_nh_host@example.com")
    a_tok, a_uid = await _register(client, "evt_nh_a@example.com")
    b_tok, _ = await _register(client, "evt_nh_b@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/join", headers=_auth(a_tok))
    await client.post(f"/events/{event_id}/join", headers=_auth(b_tok))

    r = await client.post(
        f"/events/{event_id}/attendance",
        json={"participant_user_id": a_uid, "attendance_status": "attended"},
        headers=_auth(b_tok),
    )
    assert r.status_code == 403


async def test_host_cannot_mark_non_participant(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_np_host@example.com")
    _, outsider_uid = await _register(client, "evt_np_out@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]

    r = await client.post(
        f"/events/{event_id}/attendance",
        json={"participant_user_id": outsider_uid, "attendance_status": "no_show"},
        headers=_auth(host_tok),
    )
    assert r.status_code == 404


async def test_invalid_attendance_status_rejected(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_inv_host@example.com")
    p_tok, p_uid = await _register(client, "evt_inv_p@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/join", headers=_auth(p_tok))

    r = await client.post(
        f"/events/{event_id}/attendance",
        json={"participant_user_id": p_uid, "attendance_status": "showed_up"},
        headers=_auth(host_tok),
    )
    assert r.status_code == 422


async def test_left_participant_cannot_be_marked(client: AsyncClient) -> None:
    """Left participants are frozen — no_show is a different outcome."""
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_left_host@example.com")
    p_tok, p_uid = await _register(client, "evt_left_p@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/join", headers=_auth(p_tok))
    await client.post(f"/events/{event_id}/leave", headers=_auth(p_tok))

    r = await client.post(
        f"/events/{event_id}/attendance",
        json={"participant_user_id": p_uid, "attendance_status": "no_show"},
        headers=_auth(host_tok),
    )
    assert r.status_code == 422
    assert "left" in r.json()["detail"].lower()


# --- Self-report -----------------------------------------------------------


async def test_participant_can_self_report_attended(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_sr_host@example.com")
    p_tok, p_uid = await _register(client, "evt_sr_p@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/join", headers=_auth(p_tok))

    r = await client.post(
        f"/events/{event_id}/attendance/self",
        json={"attendance_status": "attended"},
        headers=_auth(p_tok),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["participant_user_id"] == p_uid
    assert body["attendance_status"] == "attended"
    assert body["attendance_self_reported_at"] is not None


async def test_participant_can_self_report_excused(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_sx_host@example.com")
    p_tok, _ = await _register(client, "evt_sx_p@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/join", headers=_auth(p_tok))

    r = await client.post(
        f"/events/{event_id}/attendance/self",
        json={"attendance_status": "excused"},
        headers=_auth(p_tok),
    )
    assert r.status_code == 200
    assert r.json()["attendance_status"] == "excused"


async def test_participant_cannot_self_report_no_show(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_sn_host@example.com")
    p_tok, _ = await _register(client, "evt_sn_p@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/join", headers=_auth(p_tok))

    r = await client.post(
        f"/events/{event_id}/attendance/self",
        json={"attendance_status": "no_show"},
        headers=_auth(p_tok),
    )
    assert r.status_code == 422


async def test_non_participant_cannot_self_report(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_xnp_host@example.com")
    outsider_tok, _ = await _register(client, "evt_xnp_out@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]

    r = await client.post(
        f"/events/{event_id}/attendance/self",
        json={"attendance_status": "attended"},
        headers=_auth(outsider_tok),
    )
    assert r.status_code == 403


async def test_left_participant_cannot_self_report(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_lsr_host@example.com")
    p_tok, _ = await _register(client, "evt_lsr_p@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/join", headers=_auth(p_tok))
    await client.post(f"/events/{event_id}/leave", headers=_auth(p_tok))

    r = await client.post(
        f"/events/{event_id}/attendance/self",
        json={"attendance_status": "attended"},
        headers=_auth(p_tok),
    )
    assert r.status_code == 403


# --- GET /attendance scoping ----------------------------------------------


async def test_host_sees_all_participants_attendance(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, host_uid = await _register(client, "evt_get_host@example.com")
    a_tok, a_uid = await _register(client, "evt_get_a@example.com")
    b_tok, b_uid = await _register(client, "evt_get_b@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/join", headers=_auth(a_tok))
    await client.post(f"/events/{event_id}/join", headers=_auth(b_tok))

    r = await client.get(f"/events/{event_id}/attendance", headers=_auth(host_tok))
    assert r.status_code == 200
    ids = {it["participant_user_id"] for it in r.json()["items"]}
    assert ids == {host_uid, a_uid, b_uid}


async def test_participant_only_sees_own_attendance(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_self_host@example.com")
    a_tok, a_uid = await _register(client, "evt_self_a@example.com")
    b_tok, _ = await _register(client, "evt_self_b@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/join", headers=_auth(a_tok))
    await client.post(f"/events/{event_id}/join", headers=_auth(b_tok))

    r = await client.get(f"/events/{event_id}/attendance", headers=_auth(a_tok))
    assert r.status_code == 200
    ids = [it["participant_user_id"] for it in r.json()["items"]]
    assert ids == [a_uid]


async def test_non_participant_cannot_read_attendance(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_out_host@example.com")
    outsider_tok, _ = await _register(client, "evt_out_out@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]

    r = await client.get(f"/events/{event_id}/attendance", headers=_auth(outsider_tok))
    assert r.status_code == 404


# --- Cancelled / completed event behavior ----------------------------------


async def _set_event_status(event_id: str, new_status: str) -> None:
    from uuid import UUID

    from sqlalchemy import update

    from app.models.event import Event

    async with _TestSession() as db:
        await db.execute(update(Event).where(Event.id == UUID(event_id)).values(status=new_status))
        await db.commit()


async def test_cancelled_event_attendance_update_rejected(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_cxl_host@example.com")
    p_tok, p_uid = await _register(client, "evt_cxl_p@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/join", headers=_auth(p_tok))

    await _set_event_status(event_id, "cancelled")

    r_host = await client.post(
        f"/events/{event_id}/attendance",
        json={"participant_user_id": p_uid, "attendance_status": "attended"},
        headers=_auth(host_tok),
    )
    assert r_host.status_code == 422

    r_self = await client.post(
        f"/events/{event_id}/attendance/self",
        json={"attendance_status": "attended"},
        headers=_auth(p_tok),
    )
    assert r_self.status_code == 422


async def test_completed_event_attendance_update_allowed(client: AsyncClient) -> None:
    """Completed events stay editable so the host can correct a mark."""
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_done_host@example.com")
    p_tok, p_uid = await _register(client, "evt_done_p@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/join", headers=_auth(p_tok))

    await _set_event_status(event_id, "completed")

    r = await client.post(
        f"/events/{event_id}/attendance",
        json={"participant_user_id": p_uid, "attendance_status": "attended"},
        headers=_auth(host_tok),
    )
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# Privacy regression: attendance never leaks through general event detail,
# and private-event outsiders are hidden from all attendance endpoints.
# ---------------------------------------------------------------------------


async def test_general_event_detail_does_not_leak_attendance_status(
    client: AsyncClient,
) -> None:
    """
    GET /events/{id} must NOT include attendance_status on participant
    summaries. Attendance data is served only by /attendance, which
    scopes results to host / self.
    """
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_leak_host@example.com")
    p_tok, p_uid = await _register(client, "evt_leak_p@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/join", headers=_auth(p_tok))

    # Host marks the joiner — this would be the value most likely to
    # leak if /events/{id} happened to surface it.
    await client.post(
        f"/events/{event_id}/attendance",
        json={"participant_user_id": p_uid, "attendance_status": "no_show"},
        headers=_auth(host_tok),
    )

    r = await client.get(f"/events/{event_id}", headers=_auth(host_tok))
    assert r.status_code == 200
    body = r.json()
    # The participant array must be present but every entry must omit
    # the attendance field. Belt-and-braces: also check the response
    # body string for "attendance" so any new attendance-shaped field
    # added to the participants payload trips this test.
    assert body["participants"], "expected at least one participant"
    for p in body["participants"]:
        assert "attendance_status" not in p
        assert "attendanceStatus" not in p
    # Outer event payload also shouldn't carry attendance data.
    assert "attendance_status" not in body
    assert "attendanceStatus" not in body


async def test_private_event_outsider_cannot_get_attendance(
    client: AsyncClient,
) -> None:
    """Hide-as-404, not 403, for private-event outsiders."""
    await _wipe_events()
    host_tok, host_uid = await _register(client, "evt_pga_host@example.com")
    outsider_tok, _ = await _register(client, "evt_pga_out@example.com")
    event_id = await _seed_private_event(host_user_id=host_uid)

    r = await client.get(f"/events/{event_id}/attendance", headers=_auth(outsider_tok))
    assert r.status_code == 404


async def test_private_event_outsider_cannot_host_update_attendance(
    client: AsyncClient,
) -> None:
    """
    Outsider trying the host endpoint on a private event must get 404,
    not 403 — 403 would advertise that the event exists.
    """
    await _wipe_events()
    host_tok, host_uid = await _register(client, "evt_pha_host@example.com")
    outsider_tok, outsider_uid = await _register(client, "evt_pha_out@example.com")
    event_id = await _seed_private_event(host_user_id=host_uid)

    r = await client.post(
        f"/events/{event_id}/attendance",
        json={
            "participant_user_id": outsider_uid,
            "attendance_status": "attended",
        },
        headers=_auth(outsider_tok),
    )
    assert r.status_code == 404


async def test_private_event_outsider_cannot_self_report_attendance(
    client: AsyncClient,
) -> None:
    """Outsider on private self-report endpoint must also see 404."""
    await _wipe_events()
    host_tok, host_uid = await _register(client, "evt_psa_host@example.com")
    outsider_tok, _ = await _register(client, "evt_psa_out@example.com")
    event_id = await _seed_private_event(host_user_id=host_uid)

    r = await client.post(
        f"/events/{event_id}/attendance/self",
        json={"attendance_status": "attended"},
        headers=_auth(outsider_tok),
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Lifecycle: cancel / complete + attendance time eligibility
# ---------------------------------------------------------------------------


async def test_host_can_cancel_event(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_cancel_host@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]

    r = await client.post(f"/events/{event_id}/cancel", headers=_auth(host_tok))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "cancelled"


async def test_non_host_cannot_cancel_event(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_cancel_nh_host@example.com")
    other_tok, _ = await _register(client, "evt_cancel_nh_other@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]

    r = await client.post(f"/events/{event_id}/cancel", headers=_auth(other_tok))
    assert r.status_code == 403


async def test_cancel_is_idempotent(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_cancel_idem@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]

    r1 = await client.post(f"/events/{event_id}/cancel", headers=_auth(host_tok))
    r2 = await client.post(f"/events/{event_id}/cancel", headers=_auth(host_tok))
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r2.json()["status"] == "cancelled"


async def test_completed_event_cannot_be_cancelled(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_cxl_complete@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    complete = await client.post(f"/events/{event_id}/complete", headers=_auth(host_tok))
    assert complete.status_code == 200
    assert complete.json()["status"] == "completed"

    r = await client.post(f"/events/{event_id}/cancel", headers=_auth(host_tok))
    assert r.status_code == 422


async def test_cancelled_event_cannot_be_joined(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_cxl_join_host@example.com")
    joiner_tok, _ = await _register(client, "evt_cxl_join_other@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/cancel", headers=_auth(host_tok))

    r = await client.post(f"/events/{event_id}/join", headers=_auth(joiner_tok))
    assert r.status_code == 422


async def test_cancelled_event_blocks_attendance_updates(
    client: AsyncClient,
) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_cxl_att_host@example.com")
    p_tok, p_uid = await _register(client, "evt_cxl_att_p@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/join", headers=_auth(p_tok))
    await client.post(f"/events/{event_id}/cancel", headers=_auth(host_tok))

    host_mark = await client.post(
        f"/events/{event_id}/attendance",
        json={"participant_user_id": p_uid, "attendance_status": "attended"},
        headers=_auth(host_tok),
    )
    assert host_mark.status_code == 422

    self_mark = await client.post(
        f"/events/{event_id}/attendance/self",
        json={"attendance_status": "attended"},
        headers=_auth(p_tok),
    )
    assert self_mark.status_code == 422


# --- Complete ---------------------------------------------------------------


async def test_host_can_complete_after_starts_at(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_complete_host@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]

    r = await client.post(f"/events/{event_id}/complete", headers=_auth(host_tok))
    assert r.status_code == 200
    assert r.json()["status"] == "completed"


async def test_host_cannot_complete_before_starts_at(
    client: AsyncClient,
) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_complete_early@example.com")
    created = await client.post(
        "/events",
        json=_payload(starts_at=_future_starts_at(hours=6)),
        headers=_auth(host_tok),
    )
    event_id = created.json()["id"]

    r = await client.post(f"/events/{event_id}/complete", headers=_auth(host_tok))
    assert r.status_code == 422
    assert "before it has started" in r.json()["detail"].lower()


async def test_non_host_cannot_complete(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_complete_nh_host@example.com")
    other_tok, _ = await _register(client, "evt_complete_nh_other@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]

    r = await client.post(f"/events/{event_id}/complete", headers=_auth(other_tok))
    assert r.status_code == 403


async def test_cancelled_event_cannot_be_completed(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_complete_cxl@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/cancel", headers=_auth(host_tok))

    r = await client.post(f"/events/{event_id}/complete", headers=_auth(host_tok))
    assert r.status_code == 422


async def test_completed_event_cannot_be_joined(client: AsyncClient) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_done_join_host@example.com")
    joiner_tok, _ = await _register(client, "evt_done_join_other@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/complete", headers=_auth(host_tok))

    r = await client.post(f"/events/{event_id}/join", headers=_auth(joiner_tok))
    assert r.status_code == 422


# --- Attendance time eligibility -------------------------------------------


async def test_host_attendance_before_starts_at_rejected(
    client: AsyncClient,
) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_att_early_host@example.com")
    p_tok, p_uid = await _register(client, "evt_att_early_p@example.com")
    created = await client.post(
        "/events",
        json=_payload(starts_at=_future_starts_at(hours=3)),
        headers=_auth(host_tok),
    )
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/join", headers=_auth(p_tok))

    r = await client.post(
        f"/events/{event_id}/attendance",
        json={"participant_user_id": p_uid, "attendance_status": "attended"},
        headers=_auth(host_tok),
    )
    assert r.status_code == 422
    assert "after the game starts" in r.json()["detail"].lower()


async def test_participant_self_attendance_before_starts_at_rejected(
    client: AsyncClient,
) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_self_early_host@example.com")
    p_tok, _ = await _register(client, "evt_self_early_p@example.com")
    created = await client.post(
        "/events",
        json=_payload(starts_at=_future_starts_at(hours=3)),
        headers=_auth(host_tok),
    )
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/join", headers=_auth(p_tok))

    r = await client.post(
        f"/events/{event_id}/attendance/self",
        json={"attendance_status": "attended"},
        headers=_auth(p_tok),
    )
    assert r.status_code == 422


async def test_host_attendance_on_completed_event_allowed(
    client: AsyncClient,
) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_done_att_host@example.com")
    p_tok, p_uid = await _register(client, "evt_done_att_p@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/join", headers=_auth(p_tok))
    await client.post(f"/events/{event_id}/complete", headers=_auth(host_tok))

    r = await client.post(
        f"/events/{event_id}/attendance",
        json={"participant_user_id": p_uid, "attendance_status": "attended"},
        headers=_auth(host_tok),
    )
    assert r.status_code == 200
    assert r.json()["attendance_status"] == "attended"


async def test_self_attendance_on_completed_event_allowed(
    client: AsyncClient,
) -> None:
    await _wipe_events()
    host_tok, _ = await _register(client, "evt_done_self_host@example.com")
    p_tok, _ = await _register(client, "evt_done_self_p@example.com")
    created = await client.post("/events", json=_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    await client.post(f"/events/{event_id}/join", headers=_auth(p_tok))
    await client.post(f"/events/{event_id}/complete", headers=_auth(host_tok))

    r = await client.post(
        f"/events/{event_id}/attendance/self",
        json={"attendance_status": "attended"},
        headers=_auth(p_tok),
    )
    assert r.status_code == 200


# --- Hide-as-404 preserved on cancel/complete ------------------------------


async def _seed_private_event_lifecycle(*, host_user_id: str, status_value: str = "open") -> str:
    from uuid import UUID, uuid4

    from app.models.event import Event, EventParticipant

    async with _TestSession() as db:
        e = Event(
            id=uuid4(),
            host_user_id=UUID(host_user_id),
            title="Hidden",
            sport="basketball",
            mode="casual",
            starts_at=datetime.now(tz=timezone.utc) - timedelta(hours=1),
            location_text="Bondi Court",
            capacity=10,
            visibility="private",
            status=status_value,
        )
        db.add(e)
        await db.flush()
        db.add(EventParticipant(event_id=e.id, user_id=UUID(host_user_id), status="joined"))
        await db.commit()
        return str(e.id)


async def test_private_outsider_cannot_cancel(client: AsyncClient) -> None:
    await _wipe_events()
    _, host_uid = await _register(client, "evt_priv_cxl_host@example.com")
    outsider_tok, _ = await _register(client, "evt_priv_cxl_out@example.com")
    event_id = await _seed_private_event_lifecycle(host_user_id=host_uid)

    r = await client.post(f"/events/{event_id}/cancel", headers=_auth(outsider_tok))
    assert r.status_code == 404


async def test_private_outsider_cannot_complete(client: AsyncClient) -> None:
    await _wipe_events()
    _, host_uid = await _register(client, "evt_priv_dn_host@example.com")
    outsider_tok, _ = await _register(client, "evt_priv_dn_out@example.com")
    event_id = await _seed_private_event_lifecycle(host_user_id=host_uid)

    r = await client.post(f"/events/{event_id}/complete", headers=_auth(outsider_tok))
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Hide-as-404 must beat terminal-status 422 on join/leave so a private
# outsider cannot tell a real cancelled/completed event from an unknown id.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("event_status", ["cancelled", "completed"])
async def test_private_outsider_join_terminal_event_gets_404_not_422(client: AsyncClient, event_status: str) -> None:
    await _wipe_events()
    _, host_uid = await _register(client, f"evt_priv_join_terminal_host_{event_status}@example.com")
    outsider_tok, _ = await _register(client, f"evt_priv_join_terminal_out_{event_status}@example.com")
    event_id = await _seed_private_event_lifecycle(host_user_id=host_uid, status_value=event_status)

    r = await client.post(f"/events/{event_id}/join", headers=_auth(outsider_tok))
    assert r.status_code == 404, r.text


@pytest.mark.parametrize("event_status", ["cancelled", "completed"])
async def test_private_outsider_leave_terminal_event_gets_404_not_422(client: AsyncClient, event_status: str) -> None:
    await _wipe_events()
    _, host_uid = await _register(client, f"evt_priv_leave_terminal_host_{event_status}@example.com")
    outsider_tok, _ = await _register(client, f"evt_priv_leave_terminal_out_{event_status}@example.com")
    event_id = await _seed_private_event_lifecycle(host_user_id=host_uid, status_value=event_status)

    r = await client.post(f"/events/{event_id}/leave", headers=_auth(outsider_tok))
    assert r.status_code == 404, r.text
