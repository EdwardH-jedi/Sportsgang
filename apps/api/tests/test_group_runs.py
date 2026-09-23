"""Group runs: run fields on events, crew-linked runs, geo / time filters, PATCH."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app
from app.models import (  # noqa: F401  — populate Base.metadata
    booking,
    chat,
    crew,
    event,
    match,
    profile,
    rank,
    safety,
    tournament,
    user,
    venue,
)
from app.models.crew import Crew, CrewMember
from app.models.event import Event, EventParticipant

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

_counter = 0

_RUN_FIELDS = (
    "crew_id",
    "crew_name",
    "meeting_lat",
    "meeting_lng",
    "distance_km",
    "pace_min_sec_per_km",
    "pace_max_sec_per_km",
    "distance_km_from_you",
)


async def _register(client: AsyncClient) -> tuple[str, str]:
    global _counter
    _counter += 1
    r = await client.post(
        "/auth/register", json={"email": f"grp_run_{_counter}@example.com", "password": "password123"}
    )
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    me = await client.get("/auth/me", headers=_auth(token))
    return token, me.json()["id"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _in(hours: float) -> str:
    return (datetime.now(tz=timezone.utc) + timedelta(hours=hours)).isoformat()


def _run(**overrides) -> dict:
    body = {
        "title": "Tuesday tempo",
        "sport": "running",
        "starts_at": _in(24),
        "location_text": "Prince Alfred Park pool entrance",
        "capacity": 12,
        "meeting_lat": -33.8889123456,
        "meeting_lng": 151.2033987654,
        "distance_km": 8.004,
        "pace_min_sec_per_km": 300,
        "pace_max_sec_per_km": 330,
    }
    body.update(overrides)
    return body


async def _create_run(client: AsyncClient, token: str, **overrides) -> dict:
    r = await client.post("/events", json=_run(**overrides), headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


async def _create_crew(client: AsyncClient, token: str, **overrides) -> str:
    body = {"name": "Redfern Runners", "home_area": "Redfern", **overrides}
    r = await client.post("/crews", json=body, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _wipe() -> None:
    async with _TestSession() as db:
        await db.execute(delete(EventParticipant))
        await db.execute(delete(Event))
        await db.execute(delete(CrewMember))
        await db.execute(delete(Crew))
        await db.commit()


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


async def test_create_group_run_returns_run_fields(client: AsyncClient) -> None:
    token, _ = await _register(client)
    body = await _create_run(client, token)
    assert body["meeting_lat"] == -33.88891
    assert body["meeting_lng"] == 151.2034
    assert body["distance_km"] == 8.0
    assert body["pace_min_sec_per_km"] == 300
    assert body["pace_max_sec_per_km"] == 330
    assert body["crew_id"] is None
    assert body["crew_name"] is None
    assert body["distance_km_from_you"] is None


async def test_v1_event_payload_is_unchanged_plus_null_run_fields(client: AsyncClient) -> None:
    """A v1.0 client's create payload still works; new fields are all null."""
    token, _ = await _register(client)
    r = await client.post(
        "/events",
        json={
            "title": "Bondi pickup hoops",
            "sport": "basketball",
            "mode": "casual",
            "starts_at": _in(3),
            "location_text": "Bondi Beach Court",
            "capacity": 10,
            "visibility": "public",
        },
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    for field in _RUN_FIELDS:
        assert body[field] is None, field
    for field in ("id", "host_user_id", "host", "title", "participant_count", "spots_left", "participants"):
        assert field in body


@pytest.mark.parametrize(
    "overrides",
    [
        {"meeting_lng": None},
        {"meeting_lat": 91},
        {"distance_km": 0.4},
        {"distance_km": 100.5},
        {"pace_min_sec_per_km": 400, "pace_max_sec_per_km": 300},
        {"pace_min_sec_per_km": 100},
    ],
)
async def test_create_group_run_validation(client: AsyncClient, overrides: dict) -> None:
    token, _ = await _register(client)
    r = await client.post("/events", json=_run(**overrides), headers=_auth(token))
    assert r.status_code == 422, r.text


async def test_create_run_without_meeting_lng_key_is_rejected(client: AsyncClient) -> None:
    token, _ = await _register(client)
    body = _run()
    body.pop("meeting_lng")
    r = await client.post("/events", json=body, headers=_auth(token))
    assert r.status_code == 422, r.text


async def test_only_crew_members_can_create_crew_runs(client: AsyncClient) -> None:
    await _wipe()
    owner, _ = await _register(client)
    member, _ = await _register(client)
    outsider, _ = await _register(client)
    crew_id = await _create_crew(client, owner)
    await client.post(f"/crews/{crew_id}/join", headers=_auth(member))

    by_owner = await _create_run(client, owner, crew_id=crew_id)
    assert by_owner["crew_id"] == crew_id
    assert by_owner["crew_name"] == "Redfern Runners"
    by_member = await _create_run(client, member, crew_id=crew_id)
    assert by_member["crew_id"] == crew_id

    denied = await client.post("/events", json=_run(crew_id=crew_id), headers=_auth(outsider))
    assert denied.status_code == 403, denied.text
    unknown = await client.post(
        "/events", json=_run(crew_id="00000000-0000-0000-0000-000000000000"), headers=_auth(owner)
    )
    assert unknown.status_code == 404, unknown.text

    async with _TestSession() as db:
        rows = list((await db.execute(select(Event))).scalars().all())
    assert len(rows) == 2


# ---------------------------------------------------------------------------
# List filters
# ---------------------------------------------------------------------------


async def test_list_filters_by_crew_sport_and_time_window(client: AsyncClient) -> None:
    await _wipe()
    token, _ = await _register(client)
    crew_id = await _create_crew(client, token)
    tomorrow = await _create_run(client, token, crew_id=crew_id, starts_at=_in(24))
    next_week = await _create_run(client, token, starts_at=_in(24 * 6))
    tennis = await _create_run(client, token, sport="tennis", starts_at=_in(48))

    by_crew = await client.get("/events", params={"crew_id": crew_id}, headers=_auth(token))
    assert [e["id"] for e in by_crew.json()["items"]] == [tomorrow["id"]]

    running = await client.get("/events", params={"sport": "running"}, headers=_auth(token))
    assert [e["id"] for e in running.json()["items"]] == [tomorrow["id"], next_week["id"]]

    window = await client.get("/events", params={"from": _in(12), "to": _in(72)}, headers=_auth(token))
    assert window.status_code == 200, window.text
    assert [e["id"] for e in window.json()["items"]] == [tomorrow["id"], tennis["id"]]
    assert window.json()["total"] == 2

    only_from = await client.get("/events", params={"from": _in(100)}, headers=_auth(token))
    assert [e["id"] for e in only_from.json()["items"]] == [next_week["id"]]

    backwards = await client.get("/events", params={"from": _in(72), "to": _in(12)}, headers=_auth(token))
    assert backwards.status_code == 422


async def test_list_geo_filter(client: AsyncClient) -> None:
    await _wipe()
    token, _ = await _register(client)
    near = await _create_run(client, token, meeting_lat=-33.9, meeting_lng=151.2, starts_at=_in(5))
    also_near = await _create_run(client, token, meeting_lat=-33.95, meeting_lng=151.2, starts_at=_in(2))
    await _create_run(client, token, meeting_lat=-34.5, meeting_lng=151.2, starts_at=_in(3))  # ~67 km
    no_coords = await _create_run(client, token, meeting_lat=None, meeting_lng=None, starts_at=_in(4))

    r = await client.get("/events", params={"lat": -33.9, "lng": 151.2}, headers=_auth(token))
    assert r.status_code == 200, r.text
    body = r.json()
    # Still ordered by start time; distance is exact-ish (1 dp) for a public meeting point.
    assert [e["id"] for e in body["items"]] == [also_near["id"], near["id"]]
    assert [e["distance_km_from_you"] for e in body["items"]] == [5.6, 0.0]
    assert body["total"] == 2

    paged = await client.get(
        "/events", params={"lat": -33.9, "lng": 151.2, "limit": 1, "offset": 1}, headers=_auth(token)
    )
    assert [e["id"] for e in paged.json()["items"]] == [near["id"]]
    assert paged.json()["total"] == 2

    plain = await client.get("/events", headers=_auth(token))
    assert plain.json()["total"] == 4
    assert no_coords["id"] in {e["id"] for e in plain.json()["items"]}
    assert all(e["distance_km_from_you"] is None for e in plain.json()["items"])

    assert (await client.get("/events", params={"lat": -33.9}, headers=_auth(token))).status_code == 422
    too_wide = await client.get("/events", params={"lat": -33.9, "lng": 151.2, "radius_km": 60}, headers=_auth(token))
    assert too_wide.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /events/{id}
# ---------------------------------------------------------------------------


async def test_host_can_update_run_fields(client: AsyncClient) -> None:
    await _wipe()
    host, _ = await _register(client)
    crew_id = await _create_crew(client, host)
    run = await _create_run(client, host)

    r = await client.patch(
        f"/events/{run['id']}",
        json={
            "title": "Tuesday tempo (moved)",
            "distance_km": 10,
            "pace_max_sec_per_km": 345,
            "meeting_lat": None,
            "meeting_lng": None,
            "crew_id": crew_id,
            "description": "",
        },
        headers=_auth(host),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["title"] == "Tuesday tempo (moved)"
    assert body["distance_km"] == 10.0
    assert body["pace_min_sec_per_km"] == 300
    assert body["pace_max_sec_per_km"] == 345
    assert body["meeting_lat"] is None
    assert body["crew_id"] == crew_id
    assert body["crew_name"] == "Redfern Runners"
    assert body["description"] is None
    # Untouched fields survive.
    assert body["location_text"] == "Prince Alfred Park pool entrance"
    assert body["capacity"] == 12


async def test_update_permissions_and_rules(client: AsyncClient) -> None:
    await _wipe()
    host, _ = await _register(client)
    guest, _ = await _register(client)
    other_owner, _ = await _register(client)
    foreign_crew = await _create_crew(client, other_owner, name="Not yours")
    run = await _create_run(client, host, capacity=3)
    await client.post(f"/events/{run['id']}/join", headers=_auth(guest))

    assert (await client.patch(f"/events/{run['id']}", json={"title": "x"}, headers=_auth(guest))).status_code == 403
    assert (
        await client.patch("/events/00000000-0000-0000-0000-000000000000", json={"title": "x"}, headers=_auth(host))
    ).status_code == 404

    for patch in (
        {"capacity": 1},  # below the 2 people already joined
        {"title": None},
        {"pace_min_sec_per_km": 400},  # above the stored max of 330
        {"meeting_lat": -33.9},
        {"title": "BANNED_PROFANITY_FIXTURE"},
    ):
        r = await client.patch(f"/events/{run['id']}", json=patch, headers=_auth(host))
        assert r.status_code == 422, (patch, r.text)

    crew_denied = await client.patch(f"/events/{run['id']}", json={"crew_id": foreign_crew}, headers=_auth(host))
    assert crew_denied.status_code == 403

    # Capacity changes recompute open/full.
    full = await client.patch(f"/events/{run['id']}", json={"capacity": 2}, headers=_auth(host))
    assert full.json()["status"] == "full"
    reopened = await client.patch(f"/events/{run['id']}", json={"capacity": 5}, headers=_auth(host))
    assert reopened.json()["status"] == "open"
    assert reopened.json()["spots_left"] == 3

    await client.post(f"/events/{run['id']}/cancel", headers=_auth(host))
    frozen = await client.patch(f"/events/{run['id']}", json={"title": "Back on"}, headers=_auth(host))
    assert frozen.status_code == 422


# ---------------------------------------------------------------------------
# Crew integration
# ---------------------------------------------------------------------------


async def test_crew_detail_and_list_show_upcoming_runs(client: AsyncClient) -> None:
    await _wipe()
    owner, _ = await _register(client)
    runner, _ = await _register(client)
    crew_id = await _create_crew(client, owner)

    later = await _create_run(client, owner, crew_id=crew_id, title="Later", starts_at=_in(48), capacity=5)
    sooner = await _create_run(client, owner, crew_id=crew_id, title="Sooner", starts_at=_in(24), capacity=4)
    await client.post(f"/events/{sooner['id']}/join", headers=_auth(runner))
    await _create_run(client, owner, crew_id=crew_id, title="Past", starts_at=_in(-24))
    cancelled = await _create_run(client, owner, crew_id=crew_id, title="Cancelled", starts_at=_in(12))
    await client.post(f"/events/{cancelled['id']}/cancel", headers=_auth(owner))
    await _create_run(client, owner, title="Not a crew run", starts_at=_in(6))

    detail = await client.get(f"/crews/{crew_id}", headers=_auth(runner))
    assert detail.status_code == 200, detail.text
    runs = detail.json()["upcoming_runs"]
    assert [r["id"] for r in runs] == [sooner["id"], later["id"]]
    assert runs[0]["crew_name"] == "Redfern Runners"
    assert runs[0]["has_joined"] is True
    assert runs[0]["participant_count"] == 2

    listing = await client.get("/crews", headers=_auth(runner))
    [item] = listing.json()["items"]
    assert item["next_run"] == {
        "id": sooner["id"],
        "title": "Sooner",
        "starts_at": item["next_run"]["starts_at"],
        "location_text": "Prince Alfred Park pool entrance",
        "distance_km": 8.0,
        "pace_min_sec_per_km": 300,
        "pace_max_sec_per_km": 330,
        "spots_left": 2,
    }


async def test_deleting_crew_keeps_its_runs(client: AsyncClient) -> None:
    await _wipe()
    owner, _ = await _register(client)
    crew_id = await _create_crew(client, owner)
    run = await _create_run(client, owner, crew_id=crew_id)

    assert (await client.delete(f"/crews/{crew_id}", headers=_auth(owner))).status_code == 204
    r = await client.get(f"/events/{run['id']}", headers=_auth(owner))
    assert r.status_code == 200
    assert r.json()["crew_id"] is None
    assert r.json()["crew_name"] is None
    async with _TestSession() as db:
        row = (await db.execute(select(Event).where(Event.id == UUID(run["id"])))).scalar_one()
    assert row.crew_id is None
