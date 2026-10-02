"""v2 running/golf sport preferences: persistence, legacy-client writes,
explicit clearing, validation and sport switching (in-memory SQLite).

Contract: docs/run-golf-v2/CONTRACTS.md §2.
"""

from __future__ import annotations

import uuid
from typing import AsyncGenerator
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app
from app.models.user import User
from app.routers.auth import get_current_user
from app.services import sport_preferences

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

_engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
_TestSession = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)


@pytest.fixture(scope="module", autouse=True)
async def create_tables() -> AsyncGenerator[None, None]:
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
    async with _TestSession() as session:
        user = User(email=f"prefs_{uuid.uuid4().hex[:8]}@example.com", hashed_password="x")
        session.add(user)
        await session.commit()
        await session.refresh(user)

    async def _override_current_user() -> User:
        return user

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_redis] = _override_get_redis
    app.dependency_overrides[get_current_user] = _override_current_user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


GOLF_V2 = {
    "sport": "golf",
    "level": "advanced",
    "preferred_times": ["morning"],
    "preferences_version": 2,
    "golf_handicap_tenths": -21,
    "golf_handicap_source": "official_index",
    "golf_experience": "regular",
    "golf_partner_intents": ["welcome_beginners", "similar_level", "welcome_beginners"],
    "golf_similarity_tolerance_tenths": 40,
    "golf_preferred_holes": "18",
}

RUN_V2 = {
    "sport": "running",
    "level": "intermediate",
    "preferred_times": ["morning", "evening"],
    "preferences_version": 2,
    "run_pace_mode": "match_pace",
    "run_pace_min_sec_per_km": 330,
    "run_pace_max_sec_per_km": 390,
    "run_distances_km": [10, 5, 5.04],
    "run_group_style": "stay_together",
}


async def _post(client: AsyncClient, body: dict) -> tuple[int, dict]:
    r = await client.post("/users/me/sport-profiles", json=body)
    return r.status_code, r.json()


async def _get(client: AsyncClient, sport: str) -> dict:
    r = await client.get("/users/me/sport-profiles")
    assert r.status_code == 200, r.text
    return next(sp for sp in r.json() if sp["sport"] == sport)


# ---------------------------------------------------------------------------
# Persistence and read-back (the "restart the app" path)
# ---------------------------------------------------------------------------


async def test_golf_v2_round_trips_with_plus_handicap(client: AsyncClient) -> None:
    code, body = await _post(client, GOLF_V2)
    assert code == 201, body
    stored = await _get(client, "golf")
    assert stored["preferences_version"] == 2
    # +2.1 is stored as signed tenths -21, never clamped to >= 0.
    assert stored["golf_handicap_tenths"] == -21
    assert stored["golf_handicap_source"] == "official_index"
    assert stored["golf_partner_intents"] == ["welcome_beginners", "similar_level"]
    assert stored["golf_similarity_tolerance_tenths"] == 40
    assert stored["golf_preferred_holes"] == "18"
    assert stored["run_pace_mode"] is None


async def test_running_v2_round_trips_and_normalises_distances(client: AsyncClient) -> None:
    code, body = await _post(client, RUN_V2)
    assert code == 201, body
    stored = await _get(client, "running")
    assert stored["preferences_version"] == 2
    assert stored["run_pace_min_sec_per_km"] == 330
    assert stored["run_pace_max_sec_per_km"] == 390
    assert stored["run_distances_km"] == [5.0, 10.0]
    assert stored["run_group_style"] == "stay_together"
    assert stored["preferred_times"] == ["morning", "evening"]


async def test_social_runner_without_pace_is_valid_and_not_pace_zero(client: AsyncClient) -> None:
    code, body = await _post(
        client,
        {"sport": "running", "level": "beginner", "preferences_version": 2, "run_pace_mode": "social"},
    )
    assert code == 201, body
    assert body["run_pace_mode"] == "social"
    assert body["run_pace_min_sec_per_km"] is None
    assert body["run_pace_max_sec_per_km"] is None


async def test_legacy_write_leaves_row_unconfigured(client: AsyncClient) -> None:
    code, body = await _post(client, {"sport": "golf", "level": "beginner", "golf_club": "Moore Park"})
    assert code == 201, body
    assert body["preferences_version"] is None
    assert body["golf_handicap_tenths"] is None
    assert body["golf_handicap_source"] is None


# ---------------------------------------------------------------------------
# Old-client compatibility
# ---------------------------------------------------------------------------


async def test_old_client_payload_after_v2_setup_preserves_v2_fields(client: AsyncClient) -> None:
    await _post(client, RUN_V2)
    # What a pre-v2 build sends from its sport editor: legacy fields only.
    code, body = await _post(
        client, {"sport": "running", "level": "advanced", "preferred_times": ["afternoon"], "goals": "sub-50 10k"}
    )
    assert code == 201, body
    stored = await _get(client, "running")
    assert stored["level"] == "advanced"
    assert stored["preferred_times"] == ["afternoon"]
    assert stored["goals"] == "sub-50 10k"
    assert stored["preferences_version"] == 2
    assert stored["run_pace_mode"] == "match_pace"
    assert stored["run_pace_min_sec_per_km"] == 330
    assert stored["run_pace_max_sec_per_km"] == 390
    assert stored["run_distances_km"] == [5.0, 10.0]


async def test_old_client_golf_payload_preserves_handicap_and_intents(client: AsyncClient) -> None:
    await _post(client, GOLF_V2)
    code, _ = await _post(client, {"sport": "golf", "level": "advanced", "golf_club": "The Lakes"})
    assert code == 201
    stored = await _get(client, "golf")
    assert stored["golf_club"] == "The Lakes"
    assert stored["golf_handicap_tenths"] == -21
    assert stored["golf_partner_intents"] == ["welcome_beginners", "similar_level"]


# ---------------------------------------------------------------------------
# Explicit clearing
# ---------------------------------------------------------------------------


async def test_explicit_null_clears_optional_field(client: AsyncClient) -> None:
    await _post(client, GOLF_V2)
    code, body = await _post(client, {"sport": "golf", "level": "advanced", "golf_preferred_holes": None})
    assert code == 201, body
    stored = await _get(client, "golf")
    assert stored["golf_preferred_holes"] is None
    assert stored["golf_handicap_tenths"] == -21


async def test_empty_distances_list_clears(client: AsyncClient) -> None:
    await _post(client, RUN_V2)
    code, body = await _post(client, {"sport": "running", "level": "intermediate", "run_distances_km": []})
    assert code == 201, body
    assert body["run_distances_km"] is None


async def test_clearing_required_field_while_configured_is_rejected(client: AsyncClient) -> None:
    await _post(client, GOLF_V2)
    code, body = await _post(client, {"sport": "golf", "level": "advanced", "golf_partner_intents": None})
    assert code == 422
    assert "partner" in body["detail"]
    stored = await _get(client, "golf")
    assert stored["golf_partner_intents"] == ["welcome_beginners", "similar_level"]


async def test_unconfigure_then_clear_is_allowed(client: AsyncClient) -> None:
    await _post(client, GOLF_V2)
    code, body = await _post(
        client,
        {"sport": "golf", "level": "advanced", "preferences_version": None, "golf_partner_intents": None},
    )
    assert code == 201, body
    assert body["preferences_version"] is None
    assert body["golf_partner_intents"] is None


# ---------------------------------------------------------------------------
# Invalid combinations / ranges
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "patch",
    [
        {"run_pace_min_sec_per_km": 400, "run_pace_max_sec_per_km": 330},  # unordered
        {"run_pace_min_sec_per_km": 330, "run_pace_max_sec_per_km": None},  # half pair
        {"run_pace_min_sec_per_km": 6.30, "run_pace_max_sec_per_km": 390},  # "6:30" typed as decimal
        {"run_pace_min_sec_per_km": 0, "run_pace_max_sec_per_km": 390},  # social is not pace 0
        {"run_distances_km": [-5]},
        {"run_distances_km": [0]},
        {"run_distances_km": [5, 10, 15, 21.1, 30, 42.2, 50]},  # > 6 items
        {"run_pace_mode": "sprint"},
        {"run_pace_mode": "match_pace", "run_pace_min_sec_per_km": None, "run_pace_max_sec_per_km": None},
        {"golf_handicap_tenths": 120},  # golf field on a running row
    ],
)
async def test_invalid_running_payloads_rejected(client: AsyncClient, patch: dict) -> None:
    body = {**RUN_V2, **patch}
    code, resp = await _post(client, body)
    assert code == 422, resp


@pytest.mark.parametrize(
    "patch",
    [
        {"golf_handicap_tenths": 124, "golf_handicap_source": None},  # value without source
        {"golf_handicap_tenths": 124, "golf_handicap_source": "none"},  # value with "no handicap"
        {"golf_handicap_tenths": None, "golf_handicap_source": "estimate"},  # source w/o value (v2)
        {"golf_handicap_tenths": -101},  # beyond +10.0
        {"golf_handicap_tenths": 541},
        {"golf_partner_intents": []},  # v2 needs at least one intent
        {"golf_partner_intents": ["play_for_money"]},
        {"golf_experience": None},
        {"golf_similarity_tolerance_tenths": 5},
        {"golf_preferred_holes": "27"},
        {"run_pace_mode": "social"},  # running field on a golf row
    ],
)
async def test_invalid_golf_payloads_rejected(client: AsyncClient, patch: dict) -> None:
    code, resp = await _post(client, {**GOLF_V2, **patch})
    assert code == 422, resp


async def test_v2_marker_rejected_on_legacy_sport(client: AsyncClient) -> None:
    code, _ = await _post(client, {"sport": "gym", "level": "beginner", "preferences_version": 2})
    assert code == 422


async def test_no_handicap_beginner_is_valid(client: AsyncClient) -> None:
    code, body = await _post(
        client,
        {
            "sport": "golf",
            "level": "beginner",
            "preferences_version": 2,
            "golf_handicap_source": "none",
            "golf_experience": "range",
            "golf_partner_intents": ["learn_from_experienced"],
        },
    )
    assert code == 201, body
    assert body["golf_handicap_tenths"] is None
    assert body["golf_handicap_source"] == "none"


# ---------------------------------------------------------------------------
# Sport switching
# ---------------------------------------------------------------------------


async def test_both_sports_coexist_and_one_can_be_removed(client: AsyncClient) -> None:
    await _post(client, {"sport": "gym", "level": "beginner"})  # legacy row survives untouched
    assert (await _post(client, GOLF_V2))[0] == 201
    assert (await _post(client, RUN_V2))[0] == 201
    r = await client.delete("/users/me/sport-profiles/golf")
    assert r.status_code == 204
    r = await client.get("/users/me/sport-profiles")
    sports = {sp["sport"]: sp for sp in r.json()}
    assert set(sports) == {"gym", "running"}
    assert sports["gym"]["preferences_version"] is None
    assert sports["running"]["run_pace_min_sec_per_km"] == 330


# ---------------------------------------------------------------------------
# Pure validator
# ---------------------------------------------------------------------------


def _blank() -> dict:
    return {f: None for f in sport_preferences.V2_FIELDS}


def test_validate_merged_accepts_unconfigured_blank_rows() -> None:
    for sport in ("gym", "tennis", "golf", "running"):
        assert sport_preferences.validate_merged(sport, _blank()) == []


def test_validate_merged_lists_every_missing_golf_requirement() -> None:
    values = {**_blank(), "preferences_version": 2}
    errors = sport_preferences.validate_merged("golf", values)
    assert len(errors) == 3
