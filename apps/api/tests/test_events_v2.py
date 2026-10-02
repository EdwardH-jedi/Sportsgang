"""v2 running / golf group sessions on /events (in-memory SQLite).

Contract: docs/run-golf-v2/CONTRACTS.md §5. Capacity is total including the
host; session preferences are informational; only status and capacity gate
joining. Real-PostgreSQL concurrency lives in tests_integration.
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

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

_engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
_TestSession = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)


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
    await client.put("/users/me/profile", json={"display_name": name.title()}, headers=headers)
    return headers, me.json()["id"]


def _future(days: int = 3) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


RUN_DETAILS = {
    "distance_km": 10,
    "pace_mode": "target_pace",
    "pace_min_sec_per_km": 330,
    "pace_max_sec_per_km": 360,
    "group_style": "stay_together",
    "beginner_friendly": False,
    "walk_breaks_ok": True,
}

GOLF_DETAILS = {
    "holes": 9,
    "tee_time_status": "planning",
    "estimated_cost_cents": 3500,
    "handicap_min_tenths": -21,
    "handicap_max_tenths": 180,
    "beginners_welcome": True,
}


def run_session(**overrides) -> dict:
    body = {
        "title": "Saturday 10k",
        "sport": "running",
        "mode": "casual",
        "starts_at": _future(),
        "location_text": "Centennial Park, Paddington Gates",
        "capacity": 8,
        "run_details": dict(RUN_DETAILS),
    }
    body.update(overrides)
    return body


def golf_round(**overrides) -> dict:
    body = {
        "title": "Moore Park 9",
        "sport": "golf",
        "mode": "casual",
        "starts_at": _future(),
        "location_text": "Moore Park Golf",
        "capacity": 4,
        "golf_details": dict(GOLF_DETAILS),
    }
    body.update(overrides)
    return body


# ---------------------------------------------------------------------------
# Round trips
# ---------------------------------------------------------------------------


async def test_running_session_round_trips_typed_details(client: AsyncClient) -> None:
    host, _ = await _user(client, "host")
    r = await client.post("/events", json=run_session(), headers=host)
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["golf_details"] is None
    assert created["run_details"] == {**RUN_DETAILS, "distance_km": 10.0}
    detail = await client.get(f"/events/{created['id']}", headers=host)
    assert detail.json()["run_details"]["pace_min_sec_per_km"] == 330
    listed = await client.get("/events?sport=running", headers=host)
    assert listed.json()["items"][0]["run_details"]["group_style"] == "stay_together"


async def test_social_run_has_no_target_pace(client: AsyncClient) -> None:
    host, _ = await _user(client, "host")
    details = {**RUN_DETAILS, "pace_mode": "social", "pace_min_sec_per_km": None, "pace_max_sec_per_km": None}
    r = await client.post("/events", json=run_session(run_details=details), headers=host)
    assert r.status_code == 201, r.text
    assert r.json()["run_details"]["pace_mode"] == "social"
    assert r.json()["run_details"]["pace_min_sec_per_km"] is None


async def test_golf_round_round_trips_with_plus_handicap_guide(client: AsyncClient) -> None:
    host, _ = await _user(client, "host")
    r = await client.post("/events", json=golf_round(), headers=host)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["run_details"] is None
    assert body["golf_details"] == GOLF_DETAILS
    assert body["capacity"] == 4
    assert body["participant_count"] == 1  # host auto-joined
    assert body["spots_left"] == 3


async def test_legacy_event_create_is_unchanged(client: AsyncClient) -> None:
    host, _ = await _user(client, "host")
    r = await client.post(
        "/events",
        json={
            "title": "Bondi hoops",
            "sport": "basketball",
            "mode": "ranked",
            "starts_at": _future(),
            "location_text": "Bondi courts",
            "capacity": 10,
        },
        headers=host,
    )
    assert r.status_code == 201, r.text
    assert r.json()["run_details"] is None
    assert r.json()["golf_details"] is None
    assert r.json()["mode"] == "ranked"


async def test_running_event_without_details_still_allowed_for_old_clients(client: AsyncClient) -> None:
    host, _ = await _user(client, "host")
    r = await client.post("/events", json=run_session(run_details=None), headers=host)
    assert r.status_code == 201, r.text
    assert r.json()["run_details"] is None


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("body", "needle"),
    [
        (run_session(sport="golf"), "running session"),
        (golf_round(sport="running"), "golf round"),
        (run_session(golf_details=dict(GOLF_DETAILS)), "not both"),
        (run_session(mode="ranked"), "casual"),
        (golf_round(mode="ranked"), "casual"),
        (golf_round(capacity=5), "2 to 4"),
        (golf_round(capacity=1), "2 to 4"),
        (run_session(capacity=51), "2 to 50"),
        (run_session(capacity=1), "2 to 50"),
        (run_session(run_details={**RUN_DETAILS, "pace_max_sec_per_km": None}), "both"),
        (run_session(run_details={**RUN_DETAILS, "pace_min_sec_per_km": 400}), "fastest"),
        (run_session(run_details={**RUN_DETAILS, "pace_mode": "social"}), "social run"),
        (golf_round(golf_details={**GOLF_DETAILS, "handicap_max_tenths": None}), "both ends"),
        (golf_round(golf_details={**GOLF_DETAILS, "handicap_min_tenths": 200}), "lower end"),
    ],
)
async def test_cross_field_rules_return_readable_422(client: AsyncClient, body: dict, needle: str) -> None:
    host, _ = await _user(client, "host")
    r = await client.post("/events", json=body, headers=host)
    assert r.status_code == 422, r.text
    assert needle in r.json()["detail"]


@pytest.mark.parametrize(
    "body",
    [
        run_session(run_details={**RUN_DETAILS, "distance_km": 0}),
        run_session(run_details={**RUN_DETAILS, "distance_km": 101}),
        run_session(run_details={**RUN_DETAILS, "distance_km": -5}),
        run_session(run_details={**RUN_DETAILS, "pace_min_sec_per_km": 6.30}),
        run_session(run_details={**RUN_DETAILS, "pace_min_sec_per_km": 60}),
        run_session(run_details={**RUN_DETAILS, "group_style": "solo"}),
        golf_round(golf_details={**GOLF_DETAILS, "holes": 27}),
        golf_round(golf_details={**GOLF_DETAILS, "tee_time_status": "booked"}),
        golf_round(golf_details={**GOLF_DETAILS, "estimated_cost_cents": -1}),
        golf_round(golf_details={**GOLF_DETAILS, "handicap_min_tenths": -101}),
    ],
)
async def test_field_rules_reject_bad_values(client: AsyncClient, body: dict) -> None:
    host, _ = await _user(client, "host")
    r = await client.post("/events", json=body, headers=host)
    assert r.status_code == 422, r.text


# ---------------------------------------------------------------------------
# Capacity, joins and permissions
# ---------------------------------------------------------------------------


async def test_golf_capacity_counts_the_host_and_rejects_the_fifth(client: AsyncClient) -> None:
    host, _ = await _user(client, "host")
    event_id = (await client.post("/events", json=golf_round(), headers=host)).json()["id"]
    players = [await _user(client, f"p{i}") for i in range(4)]

    for headers, _ in players[:2]:
        assert (await client.post(f"/events/{event_id}/join", headers=headers)).status_code == 200
    state = (await client.get(f"/events/{event_id}", headers=host)).json()
    # "4 golfers, 1 spot left" = host + 2 joiners.
    assert (state["capacity"], state["participant_count"], state["spots_left"]) == (4, 3, 1)
    assert state["status"] == "open"

    r = await client.post(f"/events/{event_id}/join", headers=players[2][0])
    assert r.status_code == 200
    assert r.json()["status"] == "full"
    assert r.json()["spots_left"] == 0

    r = await client.post(f"/events/{event_id}/join", headers=players[3][0])
    assert r.status_code == 422
    assert r.json()["detail"] == "Event is full"
    assert (await client.get(f"/events/{event_id}", headers=host)).json()["participant_count"] == 4


async def test_repeated_join_does_not_increase_count(client: AsyncClient) -> None:
    host, _ = await _user(client, "host")
    joiner, _ = await _user(client, "joiner")
    event_id = (await client.post("/events", json=run_session(), headers=host)).json()["id"]
    assert (await client.post(f"/events/{event_id}/join", headers=joiner)).status_code == 200
    again = await client.post(f"/events/{event_id}/join", headers=joiner)
    assert again.status_code == 409
    assert (await client.get(f"/events/{event_id}", headers=host)).json()["participant_count"] == 2
    # Host is already a participant too.
    assert (await client.post(f"/events/{event_id}/join", headers=host)).status_code == 409


async def test_leave_then_rejoin_and_full_reopens(client: AsyncClient) -> None:
    host, _ = await _user(client, "host")
    a, _ = await _user(client, "a")
    event_id = (await client.post("/events", json=golf_round(capacity=2), headers=host)).json()["id"]
    assert (await client.post(f"/events/{event_id}/join", headers=a)).json()["status"] == "full"
    left = await client.post(f"/events/{event_id}/leave", headers=a)
    assert left.json()["status"] == "open"
    assert left.json()["participant_count"] == 1
    assert (await client.post(f"/events/{event_id}/join", headers=a)).json()["participant_count"] == 2


async def test_join_after_cancel_or_complete_keeps_server_reason(client: AsyncClient) -> None:
    host, _ = await _user(client, "host")
    late, _ = await _user(client, "late")
    event_id = (await client.post("/events", json=run_session(), headers=host)).json()["id"]
    assert (await client.post(f"/events/{event_id}/cancel", headers=host)).json()["status"] == "cancelled"
    r = await client.post(f"/events/{event_id}/join", headers=late)
    assert r.status_code == 422
    assert r.json()["detail"] == "Cannot join a cancelled event"


async def test_outsiders_cannot_change_host_state_or_attendance(client: AsyncClient) -> None:
    host, _ = await _user(client, "host")
    joiner, joiner_id = await _user(client, "joiner")
    outsider, _ = await _user(client, "outsider")
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    event_id = (await client.post("/events", json=golf_round(starts_at=past), headers=host)).json()["id"]
    await client.post(f"/events/{event_id}/join", headers=joiner)

    assert (await client.post(f"/events/{event_id}/cancel", headers=outsider)).status_code == 403
    assert (await client.post(f"/events/{event_id}/complete", headers=joiner)).status_code == 403
    r = await client.post(
        f"/events/{event_id}/attendance",
        json={"participant_user_id": joiner_id, "attendance_status": "no_show"},
        headers=outsider,
    )
    assert r.status_code == 403
    # Attendance outcomes are not exposed to outsiders.
    assert (await client.get(f"/events/{event_id}/attendance", headers=outsider)).status_code == 404
    # General detail never carries attendance_status.
    detail = (await client.get(f"/events/{event_id}", headers=outsider)).json()
    assert all("attendance_status" not in p for p in detail["participants"])
    assert (await client.get(f"/events/{event_id}", headers=host)).json()["status"] == "open"


# ---------------------------------------------------------------------------
# Lists
# ---------------------------------------------------------------------------


async def test_upcoming_filter_hides_past_sessions(client: AsyncClient) -> None:
    host, _ = await _user(client, "host")
    past = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    past_id = (await client.post("/events", json=run_session(starts_at=past), headers=host)).json()["id"]
    future_id = (await client.post("/events", json=run_session(), headers=host)).json()["id"]
    all_ids = [e["id"] for e in (await client.get("/events?sport=running", headers=host)).json()["items"]]
    assert set(all_ids) == {past_id, future_id}
    upcoming = (await client.get("/events?sport=running&upcoming=true", headers=host)).json()
    assert [e["id"] for e in upcoming["items"]] == [future_id]
    assert upcoming["total"] == 1


async def test_mine_lists_hosted_and_joined_including_cancelled(client: AsyncClient) -> None:
    host, _ = await _user(client, "host")
    runner, _ = await _user(client, "runner")
    hosted = (await client.post("/events", json=run_session(), headers=host)).json()["id"]
    other = (await client.post("/events", json=golf_round(), headers=runner)).json()["id"]
    await client.post(f"/events/{other}/join", headers=host)
    await client.post(f"/events/{other}/cancel", headers=runner)

    mine = (await client.get("/events?mine=true", headers=host)).json()
    by_id = {e["id"]: e for e in mine["items"]}
    assert set(by_id) == {hosted, other}
    assert by_id[other]["status"] == "cancelled"
    assert by_id[other]["golf_details"]["holes"] == 9

    theirs = (await client.get("/events?mine=true", headers=runner)).json()
    assert {e["id"] for e in theirs["items"]} == {other}
