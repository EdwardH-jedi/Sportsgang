"""Crew CRUD / membership / geo / blocking tests using in-memory SQLite."""

from __future__ import annotations

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
from app.models.safety import Block

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


async def _register(client: AsyncClient, name: str = "Runner") -> tuple[str, str]:
    global _counter
    _counter += 1
    email = f"crew_{_counter}_{name.lower().replace(' ', '_')}@example.com"
    r = await client.post("/auth/register", json={"email": email, "password": "password123"})
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    await client.put("/users/me/profile", json={"display_name": name}, headers=_auth(token))
    me = await client.get("/auth/me", headers=_auth(token))
    return token, me.json()["id"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _payload(**overrides) -> dict:
    body = {
        "name": "Surry Hills Dawn Patrol",
        "description": "Easy 5k loops before work",
        "home_area": "Surry Hills",
        "pace_min_sec_per_km": 300,
        "pace_max_sec_per_km": 360,
    }
    body.update(overrides)
    return body


async def _create(client: AsyncClient, token: str, **overrides) -> dict:
    r = await client.post("/crews", json=_payload(**overrides), headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


async def _wipe_crews() -> None:
    async with _TestSession() as db:
        await db.execute(delete(CrewMember))
        await db.execute(delete(Crew))
        await db.commit()


async def _block(blocker_id: str, blocked_id: str) -> None:
    async with _TestSession() as db:
        db.add(Block(blocker_id=UUID(blocker_id), blocked_id=UUID(blocked_id)))
        await db.commit()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/crews"),
        ("post", "/crews"),
        ("get", "/crews/00000000-0000-0000-0000-000000000000"),
        ("patch", "/crews/00000000-0000-0000-0000-000000000000"),
        ("delete", "/crews/00000000-0000-0000-0000-000000000000"),
        ("post", "/crews/00000000-0000-0000-0000-000000000000/join"),
        ("delete", "/crews/00000000-0000-0000-0000-000000000000/membership"),
    ],
)
async def test_crew_routes_require_auth(client: AsyncClient, method: str, path: str) -> None:
    r = await client.request(method, path, json=_payload() if method in ("post", "patch") else None)
    assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Create / detail
# ---------------------------------------------------------------------------


async def test_create_crew_makes_creator_owner(client: AsyncClient) -> None:
    token, uid = await _register(client, "Olivia Owner")
    body = await _create(client, token, home_lat=-33.886543, home_lng=151.211987, sport="Running")

    assert body["name"] == "Surry Hills Dawn Patrol"
    assert body["sport"] == "running"
    assert body["home_area"] == "Surry Hills"
    assert body["visibility"] == "public"
    assert body["created_by"] == uid
    assert body["member_count"] == 1
    assert body["my_role"] == "owner"
    assert body["distance_km"] is None
    assert body["next_run"] is None
    assert body["upcoming_runs"] == []
    assert body["members"] == [
        {
            "user_id": uid,
            "display_name": "Olivia Owner",
            "avatar_url": None,
            "role": "owner",
            "joined_at": body["members"][0]["joined_at"],
        }
    ]
    # Coordinates are write-only.
    assert "home_lat" not in body
    assert "home_lng" not in body

    async with _TestSession() as db:
        row = (await db.execute(select(Crew).where(Crew.id == UUID(body["id"])))).scalar_one()
    assert (row.home_lat, row.home_lng) == (-33.89, 151.21)


async def test_create_crew_defaults(client: AsyncClient) -> None:
    token, _ = await _register(client)
    r = await client.post("/crews", json={"name": "  Minimal   Crew ", "home_area": "Newtown"}, headers=_auth(token))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "Minimal Crew"
    assert body["sport"] == "running"
    assert body["description"] is None
    assert body["pace_min_sec_per_km"] is None
    assert body["pace_max_sec_per_km"] is None


@pytest.mark.parametrize(
    "overrides",
    [
        {"name": "x" * 61},
        {"name": "   "},
        {"description": "x" * 501},
        {"home_area": ""},
        {"pace_min_sec_per_km": 400, "pace_max_sec_per_km": 300},
        {"pace_min_sec_per_km": 149},
        {"pace_max_sec_per_km": 901},
        {"home_lat": -33.9},
        {"home_lat": -33.9, "home_lng": 200},
        {"visibility": "private"},
    ],
)
async def test_create_crew_validation(client: AsyncClient, overrides: dict) -> None:
    token, _ = await _register(client)
    r = await client.post("/crews", json=_payload(**overrides), headers=_auth(token))
    assert r.status_code == 422, r.text


async def test_create_crew_runs_content_moderation(client: AsyncClient) -> None:
    await _wipe_crews()
    token, _ = await _register(client)
    for overrides in ({"name": "BANNED_PROFANITY_FIXTURE runners"}, {"description": "BANNED_PROFANITY_FIXTURE"}):
        r = await client.post("/crews", json=_payload(**overrides), headers=_auth(token))
        assert r.status_code == 422, r.text
    async with _TestSession() as db:
        assert list((await db.execute(select(Crew))).scalars().all()) == []


async def test_get_unknown_crew_is_404(client: AsyncClient) -> None:
    token, _ = await _register(client)
    r = await client.get("/crews/00000000-0000-0000-0000-000000000000", headers=_auth(token))
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Join / leave
# ---------------------------------------------------------------------------


async def test_join_crew_and_duplicate_join(client: AsyncClient) -> None:
    owner, owner_id = await _register(client, "Owner")
    member, member_id = await _register(client, "Mia Member")
    crew_id = (await _create(client, owner))["id"]

    r = await client.post(f"/crews/{crew_id}/join", headers=_auth(member))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["member_count"] == 2
    assert body["my_role"] == "member"
    assert [m["user_id"] for m in body["members"]] == [owner_id, member_id]
    assert [m["role"] for m in body["members"]] == ["owner", "member"]

    again = await client.post(f"/crews/{crew_id}/join", headers=_auth(member))
    assert again.status_code == 409

    owner_view = await client.get(f"/crews/{crew_id}", headers=_auth(owner))
    assert owner_view.json()["my_role"] == "owner"
    assert owner_view.json()["member_count"] == 2


async def test_join_unknown_crew_is_404(client: AsyncClient) -> None:
    token, _ = await _register(client)
    r = await client.post("/crews/00000000-0000-0000-0000-000000000000/join", headers=_auth(token))
    assert r.status_code == 404


async def test_member_can_leave(client: AsyncClient) -> None:
    owner, _ = await _register(client)
    member, _ = await _register(client)
    crew_id = (await _create(client, owner))["id"]
    await client.post(f"/crews/{crew_id}/join", headers=_auth(member))

    r = await client.delete(f"/crews/{crew_id}/membership", headers=_auth(member))
    assert r.status_code == 200, r.text
    assert r.json() == {"crew_id": crew_id, "crew_deleted": False}

    detail = await client.get(f"/crews/{crew_id}", headers=_auth(member))
    assert detail.json()["member_count"] == 1
    assert detail.json()["my_role"] is None

    # Leaving twice → not a member.
    again = await client.delete(f"/crews/{crew_id}/membership", headers=_auth(member))
    assert again.status_code == 404


async def test_last_owner_cannot_leave_while_members_remain(client: AsyncClient) -> None:
    owner, _ = await _register(client)
    member, _ = await _register(client)
    crew_id = (await _create(client, owner))["id"]
    await client.post(f"/crews/{crew_id}/join", headers=_auth(member))

    r = await client.delete(f"/crews/{crew_id}/membership", headers=_auth(owner))
    assert r.status_code == 409, r.text
    assert "only owner" in r.json()["detail"]

    # Once the member has gone, the owner leaving dissolves the crew.
    await client.delete(f"/crews/{crew_id}/membership", headers=_auth(member))
    r = await client.delete(f"/crews/{crew_id}/membership", headers=_auth(owner))
    assert r.status_code == 200, r.text
    assert r.json() == {"crew_id": crew_id, "crew_deleted": True}
    gone = await client.get(f"/crews/{crew_id}", headers=_auth(owner))
    assert gone.status_code == 404


async def test_co_owner_can_leave(client: AsyncClient) -> None:
    owner, _ = await _register(client)
    co_owner, co_owner_id = await _register(client)
    crew_id = (await _create(client, owner))["id"]
    await client.post(f"/crews/{crew_id}/join", headers=_auth(co_owner))
    async with _TestSession() as db:
        row = (
            await db.execute(
                select(CrewMember).where(CrewMember.crew_id == UUID(crew_id), CrewMember.user_id == UUID(co_owner_id))
            )
        ).scalar_one()
        row.role = "owner"
        await db.commit()

    r = await client.delete(f"/crews/{crew_id}/membership", headers=_auth(owner))
    assert r.status_code == 200, r.text
    assert r.json()["crew_deleted"] is False


# ---------------------------------------------------------------------------
# Update / delete permissions
# ---------------------------------------------------------------------------


async def test_only_owner_can_update(client: AsyncClient) -> None:
    owner, _ = await _register(client)
    member, _ = await _register(client)
    outsider, _ = await _register(client)
    crew_id = (await _create(client, owner))["id"]
    await client.post(f"/crews/{crew_id}/join", headers=_auth(member))

    for token in (member, outsider):
        r = await client.patch(f"/crews/{crew_id}", json={"name": "Hijacked"}, headers=_auth(token))
        assert r.status_code == 403, r.text

    r = await client.patch(
        f"/crews/{crew_id}",
        json={"name": "Renamed", "description": None, "pace_max_sec_per_km": 420, "home_lat": 1.234, "home_lng": 2.345},
        headers=_auth(owner),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "Renamed"
    assert body["description"] is None
    assert body["pace_min_sec_per_km"] == 300
    assert body["pace_max_sec_per_km"] == 420
    assert "home_lat" not in body
    async with _TestSession() as db:
        row = (await db.execute(select(Crew).where(Crew.id == UUID(crew_id)))).scalar_one()
    assert (row.home_lat, row.home_lng) == (1.23, 2.35)


@pytest.mark.parametrize(
    "patch",
    [
        {"pace_max_sec_per_km": 200},  # below the stored min of 300
        {"pace_min_sec_per_km": 400},  # above the stored max of 360
        {"name": None},
        {"home_area": None},
        {"name": "x" * 61},
        {"home_lat": 10.0},
        {"visibility": "private"},
    ],
)
async def test_update_validation(client: AsyncClient, patch: dict) -> None:
    owner, _ = await _register(client)
    crew_id = (await _create(client, owner))["id"]
    r = await client.patch(f"/crews/{crew_id}", json=patch, headers=_auth(owner))
    assert r.status_code == 422, r.text


async def test_update_runs_content_moderation(client: AsyncClient) -> None:
    owner, _ = await _register(client)
    crew_id = (await _create(client, owner))["id"]
    r = await client.patch(f"/crews/{crew_id}", json={"name": "BANNED_PROFANITY_FIXTURE"}, headers=_auth(owner))
    assert r.status_code == 422


async def test_only_owner_can_delete(client: AsyncClient) -> None:
    owner, _ = await _register(client)
    member, _ = await _register(client)
    crew_id = (await _create(client, owner))["id"]
    await client.post(f"/crews/{crew_id}/join", headers=_auth(member))

    r = await client.delete(f"/crews/{crew_id}", headers=_auth(member))
    assert r.status_code == 403

    r = await client.delete(f"/crews/{crew_id}", headers=_auth(owner))
    assert r.status_code == 204
    assert (await client.get(f"/crews/{crew_id}", headers=_auth(owner))).status_code == 404
    async with _TestSession() as db:
        left = list((await db.execute(select(CrewMember).where(CrewMember.crew_id == UUID(crew_id)))).scalars().all())
    assert left == []


# ---------------------------------------------------------------------------
# Listing: mine / sport / q / geo
# ---------------------------------------------------------------------------


async def test_list_mine_sport_and_query_filters(client: AsyncClient) -> None:
    await _wipe_crews()
    alice, _ = await _register(client)
    bob, _ = await _register(client)
    run_crew = (await _create(client, alice, name="Bondi Sunrise", home_area="Bondi"))["id"]
    tennis_crew = (await _create(client, bob, name="Moore Park Hitters", home_area="Moore Park", sport="tennis"))["id"]
    await client.post(f"/crews/{tennis_crew}/join", headers=_auth(alice))
    bob_run = (await _create(client, bob, name="Glebe 100% Trail", home_area="Glebe"))["id"]

    everything = await client.get("/crews", headers=_auth(alice))
    assert everything.status_code == 200, everything.text
    body = everything.json()
    assert body["total"] == 3
    assert body["limit"] == 20
    assert body["offset"] == 0
    # Newest first without a geo filter.
    assert [c["id"] for c in body["items"]] == [bob_run, tennis_crew, run_crew]
    assert all(c["distance_km"] is None for c in body["items"])
    roles = {c["id"]: c["my_role"] for c in body["items"]}
    assert roles == {bob_run: None, tennis_crew: "member", run_crew: "owner"}

    mine = await client.get("/crews", params={"mine": "true"}, headers=_auth(alice))
    assert {c["id"] for c in mine.json()["items"]} == {run_crew, tennis_crew}

    tennis = await client.get("/crews", params={"sport": "Tennis"}, headers=_auth(alice))
    assert [c["id"] for c in tennis.json()["items"]] == [tennis_crew]

    by_name = await client.get("/crews", params={"q": "sunrise"}, headers=_auth(alice))
    assert [c["id"] for c in by_name.json()["items"]] == [run_crew]
    by_area = await client.get("/crews", params={"q": "GLEBE"}, headers=_auth(alice))
    assert [c["id"] for c in by_area.json()["items"]] == [bob_run]
    # LIKE wildcards in q are matched literally.
    literal = await client.get("/crews", params={"q": "100%"}, headers=_auth(alice))
    assert [c["id"] for c in literal.json()["items"]] == [bob_run]
    wildcard = await client.get("/crews", params={"q": "%"}, headers=_auth(alice))
    assert [c["id"] for c in wildcard.json()["items"]] == [bob_run]

    paged = await client.get("/crews", params={"limit": 1, "offset": 1}, headers=_auth(alice))
    assert [c["id"] for c in paged.json()["items"]] == [tennis_crew]
    assert paged.json()["total"] == 3


async def test_list_geo_filter_and_ordering(client: AsyncClient) -> None:
    await _wipe_crews()
    viewer, _ = await _register(client)
    owner, _ = await _register(client)
    member, _ = await _register(client)
    here = (await _create(client, owner, name="Here", home_lat=40.0, home_lng=-100.0))["id"]  # 0 km
    near_small = (await _create(client, owner, name="Near small", home_lat=40.02, home_lng=-100.0))["id"]  # ~2.2 km
    near_big = (await _create(client, owner, name="Near big", home_lat=40.02, home_lng=-100.0))["id"]
    await client.post(f"/crews/{near_big}/join", headers=_auth(member))
    far = (await _create(client, owner, name="Far", home_lat=40.3, home_lng=-100.0))["id"]  # ~33 km
    await _create(client, owner, name="No coords")

    r = await client.get("/crews", params={"lat": 40.0, "lng": -100.0}, headers=_auth(viewer))
    assert r.status_code == 200, r.text
    body = r.json()
    # Same distance bucket → more members first.
    assert [c["id"] for c in body["items"]] == [here, near_big, near_small]
    assert [c["distance_km"] for c in body["items"]] == [1.0, 2.5, 2.5]
    assert body["total"] == 3
    for item in body["items"]:
        assert "home_lat" not in item

    wide = await client.get("/crews", params={"lat": 40.0, "lng": -100.0, "radius_km": 50}, headers=_auth(viewer))
    assert [c["id"] for c in wide.json()["items"]][-1] == far
    assert wide.json()["items"][-1]["distance_km"] == 33.5

    bad = await client.get("/crews", params={"lat": 40.0}, headers=_auth(viewer))
    assert bad.status_code == 422
    too_wide = await client.get("/crews", params={"lat": 40.0, "lng": -100.0, "radius_km": 51}, headers=_auth(viewer))
    assert too_wide.status_code == 422


# ---------------------------------------------------------------------------
# Blocking
# ---------------------------------------------------------------------------


async def test_crews_of_blocked_owner_are_hidden(client: AsyncClient) -> None:
    await _wipe_crews()
    viewer, viewer_id = await _register(client)
    blocked_owner, blocked_owner_id = await _register(client)
    blocking_owner, blocking_owner_id = await _register(client)
    fine_owner, _ = await _register(client)

    hidden_a = (await _create(client, blocked_owner, name="Blocked owner crew"))["id"]
    hidden_b = (await _create(client, blocking_owner, name="Blocking owner crew"))["id"]
    visible = (await _create(client, fine_owner, name="Fine crew"))["id"]
    await _block(viewer_id, blocked_owner_id)
    await _block(blocking_owner_id, viewer_id)

    r = await client.get("/crews", headers=_auth(viewer))
    assert [c["id"] for c in r.json()["items"]] == [visible]
    assert r.json()["total"] == 1

    for crew_id in (hidden_a, hidden_b):
        assert (await client.get(f"/crews/{crew_id}", headers=_auth(viewer))).status_code == 404
        assert (await client.post(f"/crews/{crew_id}/join", headers=_auth(viewer))).status_code == 404


async def test_existing_member_keeps_access_after_blocking_owner(client: AsyncClient) -> None:
    await _wipe_crews()
    viewer, viewer_id = await _register(client)
    owner, owner_id = await _register(client)
    crew_id = (await _create(client, owner))["id"]
    await client.post(f"/crews/{crew_id}/join", headers=_auth(viewer))
    await _block(viewer_id, owner_id)

    # Hidden from discovery lists, but still in "your crews" and reachable.
    assert (await client.get("/crews", headers=_auth(viewer))).json()["items"] == []
    mine = await client.get("/crews", params={"mine": "true"}, headers=_auth(viewer))
    assert [c["id"] for c in mine.json()["items"]] == [crew_id]
    detail = await client.get(f"/crews/{crew_id}", headers=_auth(viewer))
    assert detail.status_code == 200
    # The blocked owner is left out of the member preview; the count is not.
    assert [m["user_id"] for m in detail.json()["members"]] == [viewer_id]
    assert detail.json()["member_count"] == 2
    leave = await client.delete(f"/crews/{crew_id}/membership", headers=_auth(viewer))
    assert leave.status_code == 200


# ---------------------------------------------------------------------------
# Account deletion
# ---------------------------------------------------------------------------


async def test_account_deletion_hands_over_or_dissolves_crews(client: AsyncClient) -> None:
    owner, owner_id = await _register(client)
    first, first_id = await _register(client)
    second, _ = await _register(client)
    shared = (await _create(client, owner, name="Shared"))["id"]
    solo = (await _create(client, owner, name="Solo"))["id"]
    await client.post(f"/crews/{shared}/join", headers=_auth(first))
    await client.post(f"/crews/{shared}/join", headers=_auth(second))

    r = await client.delete("/auth/me", headers=_auth(owner))
    assert r.status_code == 204, r.text

    detail = await client.get(f"/crews/{shared}", headers=_auth(first))
    assert detail.status_code == 200
    body = detail.json()
    assert body["member_count"] == 2
    assert body["my_role"] == "owner"
    assert body["created_by"] is None
    assert owner_id not in {m["user_id"] for m in body["members"]}
    assert first_id == body["members"][0]["user_id"]

    assert (await client.get(f"/crews/{solo}", headers=_auth(first))).status_code == 404
