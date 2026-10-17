"""Discovery endpoint tests using an in-memory SQLite async database."""

from __future__ import annotations

from typing import AsyncGenerator
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app

# Import all model modules so Base.metadata is fully populated.
from app.models import match, profile, user  # noqa: F401

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


async def _register(client: AsyncClient, email: str) -> str:
    r = await client.post("/auth/register", json={"email": email, "password": "password123"})
    assert r.status_code == 201
    return r.json()["access_token"]


async def _register_with_id(client: AsyncClient, email: str) -> tuple[str, str]:
    """Register and additionally fetch the user id via /auth/me.

    Used by tests that need to assert on user_id ordering in the discovery
    feed without making the broader test fixture more invasive.
    """
    token = await _register(client, email)
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    return token, me.json()["id"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_discovery_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/discovery?sport=gym")
    # FastAPI's HTTPBearer (auto_error=True) returns 401 with
    # `Not authenticated` when no credentials are presented; accept either
    # 401 or 403 to stay robust to FastAPI/Starlette internals changes.
    assert r.status_code in (401, 403)


async def test_discovery_returns_paginated_shape(client: AsyncClient) -> None:
    token = await _register(client, "disc_shape@example.com")
    r = await client.get("/discovery?sport=gym", headers=_auth(token))
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert "limit" in body
    assert "offset" in body
    assert isinstance(body["items"], list)


async def test_discovery_excludes_current_user(client: AsyncClient) -> None:
    token = await _register(client, "disc_self@example.com")
    # Give self a profile + sport profile so they could theoretically appear
    await client.put(
        "/users/me/profile",
        json={"display_name": "Self User"},
        headers=_auth(token),
    )
    await client.post(
        "/users/me/sport-profiles",
        json={"sport": "gym", "level": "beginner"},
        headers=_auth(token),
    )
    me = await client.get("/auth/me", headers=_auth(token))
    self_id = me.json()["id"]

    r = await client.get("/discovery?sport=gym", headers=_auth(token))
    assert r.status_code == 200
    user_ids = [item["user_id"] for item in r.json()["items"]]
    assert self_id not in user_ids


async def test_discovery_returns_users_with_matching_sport_profile(
    client: AsyncClient,
) -> None:
    token_viewer = await _register(client, "disc_viewer@example.com")
    token_partner = await _register(client, "disc_partner@example.com")

    # Partner sets up a gym profile
    await client.put(
        "/users/me/profile",
        json={"display_name": "Gym Partner", "suburb": "Bondi"},
        headers=_auth(token_partner),
    )
    await client.post(
        "/users/me/sport-profiles",
        json={"sport": "gym", "level": "intermediate"},
        headers=_auth(token_partner),
    )
    me_partner = await client.get("/auth/me", headers=_auth(token_partner))
    partner_id = me_partner.json()["id"]

    r = await client.get("/discovery?sport=gym", headers=_auth(token_viewer))
    assert r.status_code == 200
    user_ids = [item["user_id"] for item in r.json()["items"]]
    assert partner_id in user_ids


async def test_discovery_card_carries_full_bio_and_photo_urls(
    client: AsyncClient,
) -> None:
    """V1 partner detail preview needs full bio and the ordered photo list.

    bio_excerpt is the 160-char card preview; bio is the full text. photo_urls
    is the ordered set of all uploaded photos (avatar_url is photoUrls[0]).
    Both are read by the mobile detail-preview modal.
    """
    token_viewer = await _register(client, "disc_detail_viewer@example.com")
    token_partner = await _register(client, "disc_detail_partner@example.com")

    long_bio = "Looking for a steady gym partner. " * 8  # > 160 chars
    await client.put(
        "/users/me/profile",
        json={"display_name": "Gym Partner", "suburb": "Bondi", "bio": long_bio},
        headers=_auth(token_partner),
    )
    await client.post(
        "/users/me/sport-profiles",
        json={"sport": "gym", "level": "intermediate"},
        headers=_auth(token_partner),
    )

    r = await client.get("/discovery?sport=gym", headers=_auth(token_viewer))
    assert r.status_code == 200
    items = r.json()["items"]
    me_partner = await client.get("/auth/me", headers=_auth(token_partner))
    partner_id = me_partner.json()["id"]
    card = next(item for item in items if item["user_id"] == partner_id)

    # Schema contract: both fields are present for the partner detail preview.
    assert "bio" in card
    assert "photo_urls" in card
    # Full bio round-trips, even though excerpt is truncated.
    assert card["bio"] == long_bio.strip() or card["bio"] == long_bio
    # bio_excerpt is the 160-char preview the card uses.
    assert card["bio_excerpt"] is not None
    assert len(card["bio_excerpt"]) <= 160
    # photo_urls is always a list (empty when the user hasn't uploaded).
    assert isinstance(card["photo_urls"], list)


async def test_record_action_requires_auth(client: AsyncClient) -> None:
    r = await client.post(
        "/discovery/actions",
        json={
            "target_user_id": "00000000-0000-0000-0000-000000000001",
            "action": "like",
            "sport": "gym",
        },
    )
    assert r.status_code in (401, 403)


async def test_record_action_rejects_self_target_and_persists_nothing(client: AsyncClient) -> None:
    from sqlalchemy import func, select

    from app.models.match import DiscoveryAction, Match

    token, user_id = await _register_with_id(client, "disc_self_action@example.com")
    response = await client.post(
        "/discovery/actions",
        json={"target_user_id": user_id, "action": "like", "sport": "gym"},
        headers=_auth(token),
    )
    assert response.status_code == 422

    async with _TestSession() as session:
        action_count = (
            await session.execute(
                select(func.count())
                .select_from(DiscoveryAction)
                .where(
                    DiscoveryAction.actor_id == UUID(user_id),
                    DiscoveryAction.target_id == UUID(user_id),
                )
            )
        ).scalar_one()
        match_count = (
            await session.execute(
                select(func.count())
                .select_from(Match)
                .where(
                    Match.user1_id == UUID(user_id),
                    Match.user2_id == UUID(user_id),
                )
            )
        ).scalar_one()
    assert action_count == 0
    assert match_count == 0


async def test_database_rejects_self_match(client: AsyncClient) -> None:
    from app.models.match import Match

    _, user_id = await _register_with_id(client, "disc_self_match_db@example.com")
    async with _TestSession() as session:
        session.add(Match(user1_id=UUID(user_id), user2_id=UUID(user_id), sport="gym", status="active"))
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()


async def test_record_action_returns_shape(client: AsyncClient) -> None:
    token_a = await _register(client, "disc_act_a@example.com")
    token_b = await _register(client, "disc_act_b@example.com")
    me_b = await client.get("/auth/me", headers=_auth(token_b))
    user_b_id = me_b.json()["id"]

    r = await client.post(
        "/discovery/actions",
        json={"target_user_id": user_b_id, "action": "like", "sport": "gym"},
        headers=_auth(token_a),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["action"] == "like"
    assert body["match_created"] is False
    assert body["match_id"] is None


async def test_one_sided_like_does_not_create_match(client: AsyncClient) -> None:
    token_a = await _register(client, "disc_one_a@example.com")
    token_b = await _register(client, "disc_one_b@example.com")
    me_b = await client.get("/auth/me", headers=_auth(token_b))
    user_b_id = me_b.json()["id"]

    r = await client.post(
        "/discovery/actions",
        json={"target_user_id": user_b_id, "action": "like", "sport": "gym"},
        headers=_auth(token_a),
    )
    assert r.json()["match_created"] is False
    assert r.json()["match_id"] is None


async def test_mutual_like_creates_match(client: AsyncClient) -> None:
    token_a = await _register(client, "disc_mutual_a@example.com")
    token_b = await _register(client, "disc_mutual_b@example.com")

    me_a = await client.get("/auth/me", headers=_auth(token_a))
    me_b = await client.get("/auth/me", headers=_auth(token_b))
    user_a_id = me_a.json()["id"]
    user_b_id = me_b.json()["id"]

    # A likes B — no match yet
    r1 = await client.post(
        "/discovery/actions",
        json={"target_user_id": user_b_id, "action": "like", "sport": "gym"},
        headers=_auth(token_a),
    )
    assert r1.json()["match_created"] is False

    # B likes A — mutual → match created
    r2 = await client.post(
        "/discovery/actions",
        json={"target_user_id": user_a_id, "action": "like", "sport": "gym"},
        headers=_auth(token_b),
    )
    assert r2.status_code == 200
    assert r2.json()["match_created"] is True
    assert r2.json()["match_id"] is not None


async def test_pass_action_does_not_create_match(client: AsyncClient) -> None:
    token_a = await _register(client, "disc_pass_a@example.com")
    token_b = await _register(client, "disc_pass_b@example.com")

    me_a = await client.get("/auth/me", headers=_auth(token_a))
    me_b = await client.get("/auth/me", headers=_auth(token_b))
    user_a_id = me_a.json()["id"]
    user_b_id = me_b.json()["id"]

    # A passes B
    await client.post(
        "/discovery/actions",
        json={"target_user_id": user_b_id, "action": "pass", "sport": "golf"},
        headers=_auth(token_a),
    )
    # B likes A — should not create match because A passed
    r = await client.post(
        "/discovery/actions",
        json={"target_user_id": user_a_id, "action": "like", "sport": "golf"},
        headers=_auth(token_b),
    )
    assert r.json()["match_created"] is False


async def test_acted_on_users_excluded_from_feed(client: AsyncClient) -> None:
    token_a = await _register(client, "disc_excl_a@example.com")
    token_b = await _register(client, "disc_excl_b@example.com")

    me_b = await client.get("/auth/me", headers=_auth(token_b))
    user_b_id = me_b.json()["id"]

    # Partner B sets up profile so they appear in feed
    await client.put(
        "/users/me/profile",
        json={"display_name": "Excluded Partner"},
        headers=_auth(token_b),
    )
    await client.post(
        "/users/me/sport-profiles",
        json={"sport": "gym", "level": "beginner"},
        headers=_auth(token_b),
    )

    # A passes B
    await client.post(
        "/discovery/actions",
        json={"target_user_id": user_b_id, "action": "pass", "sport": "gym"},
        headers=_auth(token_a),
    )

    # B should no longer appear in A's feed
    r = await client.get("/discovery?sport=gym", headers=_auth(token_a))
    user_ids = [item["user_id"] for item in r.json()["items"]]
    assert user_b_id not in user_ids


# ---------------------------------------------------------------------------
# _score_compatibility unit tests  (pure function, no DB / no HTTP)
# ---------------------------------------------------------------------------


def _make_sp(level: str, preferred_times: list[str]):
    """Build a minimal SportProfile-shaped duck-typed object.

    `_score_compatibility` only reads ``level`` and ``preferred_times``,
    so a SimpleNamespace is enough — and avoids the SQLAlchemy 2.x
    ``InstrumentedAttribute`` machinery that rejects writes on instances
    created via ``__new__`` without state-tracking.
    """
    from types import SimpleNamespace

    return SimpleNamespace(level=level, preferred_times=preferred_times)


def test_score_same_level_flexible_is_one():
    from app.services.discovery import _score_compatibility

    sp = _make_sp("intermediate", ["flexible"])
    assert _score_compatibility("intermediate", ["morning"], sp) == 1.0


def test_score_same_level_no_overlap():
    from app.services.discovery import _score_compatibility

    sp = _make_sp("intermediate", ["evening"])
    score = _score_compatibility("intermediate", ["morning"], sp)
    # 0.6 * 1.0 + 0.4 * 0.0 = 0.6
    assert score == pytest.approx(0.6)


def test_score_one_level_apart_flexible():
    from app.services.discovery import _score_compatibility

    sp = _make_sp("advanced", ["flexible"])
    score = _score_compatibility("intermediate", ["morning"], sp)
    # 0.6 * 0.5 + 0.4 * 1.0 = 0.7
    assert score == pytest.approx(0.7)


def test_score_two_levels_apart_flexible():
    from app.services.discovery import _score_compatibility

    sp = _make_sp("advanced", ["flexible"])
    score = _score_compatibility("beginner", ["morning"], sp)
    # 0.6 * 0.0 + 0.4 * 1.0 = 0.4
    assert score == pytest.approx(0.4)


def test_score_partial_time_overlap():
    from app.services.discovery import _score_compatibility

    sp = _make_sp("intermediate", ["morning", "evening"])
    score = _score_compatibility("intermediate", ["morning", "afternoon"], sp)
    # level = 1.0, overlap = 1/2 = 0.5
    # 0.6 * 1.0 + 0.4 * 0.5 = 0.8
    assert score == pytest.approx(0.8)


# ---------------------------------------------------------------------------
# Integration: feed ordering respects compatibility score
# ---------------------------------------------------------------------------


async def test_feed_orders_by_compatibility(client: AsyncClient) -> None:
    """Higher-compatibility partner must appear before lower-compatibility one."""
    token_actor, uid_actor = await _register_with_id(client, "score_actor@example.com")
    token_hi, uid_hi = await _register_with_id(client, "score_hi@example.com")
    token_lo, uid_lo = await _register_with_id(client, "score_lo@example.com")

    # Actor: intermediate gym, morning
    await client.put(
        "/users/me/profile",
        json={"display_name": "Actor"},
        headers=_auth(token_actor),
    )
    await client.post(
        "/users/me/sport-profiles",
        json={"sport": "gym", "level": "intermediate", "preferred_times": ["morning"]},
        headers=_auth(token_actor),
    )

    # High-match partner: same level + same time → score 1.0
    await client.put(
        "/users/me/profile",
        json={"display_name": "High Match"},
        headers=_auth(token_hi),
    )
    await client.post(
        "/users/me/sport-profiles",
        json={"sport": "gym", "level": "intermediate", "preferred_times": ["morning"]},
        headers=_auth(token_hi),
    )

    # Low-match partner: two levels apart + different time → score 0.0
    await client.put(
        "/users/me/profile",
        json={"display_name": "Low Match"},
        headers=_auth(token_lo),
    )
    await client.post(
        "/users/me/sport-profiles",
        json={"sport": "gym", "level": "beginner", "preferred_times": ["evening"]},
        headers=_auth(token_lo),
    )

    r = await client.get("/discovery?sport=gym&limit=50", headers=_auth(token_actor))
    assert r.status_code == 200
    ids = [item["user_id"] for item in r.json()["items"]]

    assert uid_hi in ids, "high-match partner missing from feed"
    assert uid_lo in ids, "low-match partner missing from feed"
    assert ids.index(uid_hi) < ids.index(uid_lo), "high-match partner should rank before low-match partner"


# ---------------------------------------------------------------------------
# Duplicate match prevention
# ---------------------------------------------------------------------------


async def test_repeat_mutual_like_does_not_create_duplicate_match(client: AsyncClient) -> None:
    """Re-issuing an already-mutual like must not create a second Match row."""
    from uuid import UUID

    from sqlalchemy import and_, func, select

    from app.models.match import Match

    token_a = await _register(client, "disc_dup_a@example.com")
    token_b = await _register(client, "disc_dup_b@example.com")

    uid_a = (await client.get("/auth/me", headers=_auth(token_a))).json()["id"]
    uid_b = (await client.get("/auth/me", headers=_auth(token_b))).json()["id"]

    # First mutual-like sequence → match created.
    await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_b, "action": "like", "sport": "gym"},
        headers=_auth(token_a),
    )
    r_first = await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_a, "action": "like", "sport": "gym"},
        headers=_auth(token_b),
    )
    assert r_first.status_code == 200
    assert r_first.json()["match_created"] is True
    original_match_id = r_first.json()["match_id"]

    # Either side re-posts the like for the same pair + sport.
    r_repeat_b = await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_a, "action": "like", "sport": "gym"},
        headers=_auth(token_b),
    )
    assert r_repeat_b.status_code == 200
    assert r_repeat_b.json()["match_created"] is False
    assert r_repeat_b.json()["match_id"] is None

    r_repeat_a = await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_b, "action": "like", "sport": "gym"},
        headers=_auth(token_a),
    )
    assert r_repeat_a.status_code == 200
    assert r_repeat_a.json()["match_created"] is False

    # Exactly one Match row should exist for this (pair, sport).
    u1_str, u2_str = sorted([uid_a, uid_b])
    async with _TestSession() as session:
        count = (
            await session.execute(
                select(func.count())
                .select_from(Match)
                .where(
                    and_(
                        Match.user1_id == UUID(u1_str),
                        Match.user2_id == UUID(u2_str),
                        Match.sport == "gym",
                    )
                )
            )
        ).scalar_one()
    assert count == 1, f"expected exactly one Match row, found {count}"
    assert original_match_id is not None


async def test_different_sport_creates_separate_match(client: AsyncClient) -> None:
    """A second match for the same pair in a different sport is allowed."""
    from uuid import UUID

    from sqlalchemy import and_, func, select

    from app.models.match import Match

    token_a = await _register(client, "disc_dup_sport_a@example.com")
    token_b = await _register(client, "disc_dup_sport_b@example.com")
    uid_a = (await client.get("/auth/me", headers=_auth(token_a))).json()["id"]
    uid_b = (await client.get("/auth/me", headers=_auth(token_b))).json()["id"]

    # gym match
    await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_b, "action": "like", "sport": "gym"},
        headers=_auth(token_a),
    )
    r_gym = await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_a, "action": "like", "sport": "gym"},
        headers=_auth(token_b),
    )
    assert r_gym.json()["match_created"] is True

    # golf match — same pair, different sport → separate match row.
    await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_b, "action": "like", "sport": "golf"},
        headers=_auth(token_a),
    )
    r_golf = await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_a, "action": "like", "sport": "golf"},
        headers=_auth(token_b),
    )
    assert r_golf.json()["match_created"] is True
    assert r_golf.json()["match_id"] != r_gym.json()["match_id"]

    u1_str, u2_str = sorted([uid_a, uid_b])
    async with _TestSession() as session:
        count = (
            await session.execute(
                select(func.count())
                .select_from(Match)
                .where(
                    and_(
                        Match.user1_id == UUID(u1_str),
                        Match.user2_id == UUID(u2_str),
                    )
                )
            )
        ).scalar_one()
    assert count == 2, f"expected one match per sport (2 total), found {count}"
