"""Profile endpoint tests using an in-memory SQLite async database."""

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

# ---------------------------------------------------------------------------
# In-memory SQLite engine
# ---------------------------------------------------------------------------

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
async def auth_client() -> AsyncGenerator[tuple[AsyncClient, str], None]:
    """Yields (client, bearer_token) for an already-registered user."""
    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_redis] = _override_get_redis

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Use unique email per fixture invocation to avoid collisions
        import uuid

        email = f"user_{uuid.uuid4().hex[:8]}@example.com"
        r = await ac.post("/auth/register", json={"email": email, "password": "password123"})
        token = r.json()["access_token"]
        yield ac, token

    app.dependency_overrides.clear()


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Profile tests
# ---------------------------------------------------------------------------


async def test_put_profile_creates_profile(auth_client) -> None:
    client, token = auth_client
    r = await client.put(
        "/users/me/profile",
        json={"display_name": "Alice", "suburb": "Bondi"},
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["display_name"] == "Alice"
    assert body["suburb"] == "Bondi"


async def test_get_profile_returns_profile_after_creation(auth_client) -> None:
    client, token = auth_client
    await client.put(
        "/users/me/profile",
        json={"display_name": "Bob"},
        headers=auth_headers(token),
    )
    r = await client.get("/users/me/profile", headers=auth_headers(token))
    assert r.status_code == 200
    assert r.json()["display_name"] == "Bob"


async def test_get_profile_returns_404_when_not_created(auth_client) -> None:
    client, token = auth_client
    r = await client.get("/users/me/profile", headers=auth_headers(token))
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Identity preferences tests
# ---------------------------------------------------------------------------


async def test_put_identity_preferences_upserts(auth_client) -> None:
    client, token = auth_client
    r = await client.put(
        "/users/me/identity-preferences",
        json={"open_to": ["male", "female"], "age_range_min": 25, "age_range_max": 45, "max_distance_km": 10},
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["open_to"] == ["male", "female"]
    assert body["age_range_min"] == 25
    assert body["max_distance_km"] == 10

    # Upsert again — should update
    r2 = await client.put(
        "/users/me/identity-preferences",
        json={"open_to": ["any"], "age_range_min": 18, "age_range_max": 65, "max_distance_km": 20},
        headers=auth_headers(token),
    )
    assert r2.status_code == 200
    assert r2.json()["open_to"] == ["any"]


# ---------------------------------------------------------------------------
# Sport profile tests
# ---------------------------------------------------------------------------


async def test_post_sport_profile_creates_gym_profile(auth_client) -> None:
    client, token = auth_client
    r = await client.post(
        "/users/me/sport-profiles",
        json={"sport": "gym", "level": "intermediate", "gym_name": "Fitness First"},
        headers=auth_headers(token),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["sport"] == "gym"
    assert body["level"] == "intermediate"
    assert body["gym_name"] == "Fitness First"


async def test_post_sport_profile_creates_golf_profile(auth_client) -> None:
    client, token = auth_client
    r = await client.post(
        "/users/me/sport-profiles",
        json={"sport": "golf", "level": "beginner", "golf_club": "Royal Sydney"},
        headers=auth_headers(token),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["sport"] == "golf"
    assert body["golf_club"] == "Royal Sydney"


async def test_post_sport_profile_same_sport_updates(auth_client) -> None:
    client, token = auth_client
    await client.post(
        "/users/me/sport-profiles",
        json={"sport": "gym", "level": "beginner"},
        headers=auth_headers(token),
    )
    r = await client.post(
        "/users/me/sport-profiles",
        json={"sport": "gym", "level": "advanced", "gym_name": "Anytime Fitness"},
        headers=auth_headers(token),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["level"] == "advanced"
    assert body["gym_name"] == "Anytime Fitness"


async def test_get_sport_profiles_returns_list(auth_client) -> None:
    client, token = auth_client
    await client.post(
        "/users/me/sport-profiles",
        json={"sport": "gym", "level": "beginner"},
        headers=auth_headers(token),
    )
    await client.post(
        "/users/me/sport-profiles",
        json={"sport": "golf", "level": "intermediate"},
        headers=auth_headers(token),
    )
    r = await client.get("/users/me/sport-profiles", headers=auth_headers(token))
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    sports = {sp["sport"] for sp in body}
    assert "gym" in sports
    assert "golf" in sports


# ---------------------------------------------------------------------------
# Coarse home location (run-first discovery)
# ---------------------------------------------------------------------------


async def _stored_home(token: str, client: AsyncClient) -> tuple[float | None, float | None]:
    from uuid import UUID

    from sqlalchemy import select

    from app.models.profile import UserProfile

    me = await client.get("/auth/me", headers=auth_headers(token))
    async with _TestSession() as db:
        row = (await db.execute(select(UserProfile).where(UserProfile.user_id == UUID(me.json()["id"])))).scalar_one()
        return row.home_lat, row.home_lng


async def test_put_profile_stores_rounded_home_location_and_never_returns_it(auth_client) -> None:
    client, token = auth_client
    r = await client.put(
        "/users/me/profile",
        json={"display_name": "Runner", "home_lat": -33.887654, "home_lng": 151.211234},
        headers=auth_headers(token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "home_lat" not in body
    assert "home_lng" not in body
    assert body["has_home_location"] is True

    assert await _stored_home(token, client) == (-33.89, 151.21)

    got = await client.get("/users/me/profile", headers=auth_headers(token))
    assert "home_lat" not in got.json()
    assert got.json()["has_home_location"] is True


async def test_put_profile_without_home_fields_keeps_stored_location(auth_client) -> None:
    """v1.0 clients never send home_lat/home_lng — an update must not wipe them."""
    client, token = auth_client
    await client.put(
        "/users/me/profile",
        json={"display_name": "Runner", "home_lat": -33.9, "home_lng": 151.2},
        headers=auth_headers(token),
    )
    r = await client.put(
        "/users/me/profile",
        json={"display_name": "Runner Renamed", "suburb": "Newtown"},
        headers=auth_headers(token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["display_name"] == "Runner Renamed"
    assert await _stored_home(token, client) == (-33.9, 151.2)


async def test_put_profile_can_clear_home_location(auth_client) -> None:
    client, token = auth_client
    await client.put(
        "/users/me/profile",
        json={"display_name": "Runner", "home_lat": -33.9, "home_lng": 151.2},
        headers=auth_headers(token),
    )
    r = await client.put(
        "/users/me/profile",
        json={"display_name": "Runner", "home_lat": None, "home_lng": None},
        headers=auth_headers(token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["has_home_location"] is False
    assert await _stored_home(token, client) == (None, None)


@pytest.mark.parametrize(
    "extra",
    [
        {"home_lat": 91.0, "home_lng": 151.2},
        {"home_lat": -33.9, "home_lng": -181.0},
        {"home_lat": -33.9},
        {"home_lng": 151.2},
        {"home_lat": -33.9, "home_lng": None},
    ],
)
async def test_put_profile_rejects_invalid_home_location(auth_client, extra: dict) -> None:
    client, token = auth_client
    r = await client.put(
        "/users/me/profile",
        json={"display_name": "Runner", **extra},
        headers=auth_headers(token),
    )
    assert r.status_code == 422, r.text
