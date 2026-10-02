"""HTTP tests for the v2 running/golf discovery feed (in-memory SQLite).

Each test gets a fresh schema so feed contents are exactly the users the
test creates. Contract: docs/run-golf-v2/CONTRACTS.md §4.
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


async def _user(client: AsyncClient, name: str, *sport_profiles: dict) -> tuple[dict[str, str], str]:
    r = await client.post(
        "/auth/register", json={"email": f"{name.lower()}_{uuid.uuid4().hex[:6]}@example.com", "password": "pw123456"}
    )
    assert r.status_code == 201, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    me = await client.get("/auth/me", headers=headers)
    r = await client.put("/users/me/profile", json={"display_name": name, "suburb": "Newtown"}, headers=headers)
    assert r.status_code == 200, r.text
    for body in sport_profiles:
        r = await client.post("/users/me/sport-profiles", json=body, headers=headers)
        assert r.status_code == 201, r.text
    return headers, me.json()["id"]


def golf(**fields) -> dict:
    return {
        "sport": "golf",
        "level": "intermediate",
        "preferred_times": ["morning"],
        "preferences_version": 2,
        "golf_handicap_source": "none",
        "golf_experience": "played_rounds",
        "golf_partner_intents": ["similar_level"],
        **fields,
    }


def run(**fields) -> dict:
    return {
        "sport": "running",
        "level": "intermediate",
        "preferred_times": ["morning"],
        "preferences_version": 2,
        "run_pace_mode": "match_pace",
        "run_pace_min_sec_per_km": 330,
        "run_pace_max_sec_per_km": 390,
        **fields,
    }


BEGINNER = golf(golf_experience="range", golf_partner_intents=["learn_from_experienced"], level="beginner")
EXPERT_WELCOMING = golf(
    golf_handicap_tenths=62,
    golf_handicap_source="official_index",
    golf_experience="regular",
    golf_partner_intents=["welcome_beginners"],
    level="advanced",
)
EXPERT_SIMILAR_ONLY = {**EXPERT_WELCOMING, "golf_partner_intents": ["similar_level"]}


async def _feed(client: AsyncClient, headers: dict, query: str) -> dict:
    r = await client.get(f"/discovery?{query}", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


async def test_golf_feed_is_bilateral_and_explains_itself(client: AsyncClient) -> None:
    viewer, _ = await _user(client, "Bea", BEGINNER)
    _, mentor_id = await _user(client, "Mentor", EXPERT_WELCOMING)
    _, picky_id = await _user(client, "Picky", EXPERT_SIMILAR_ONLY)
    _, legacy_id = await _user(client, "Legacy", {"sport": "golf", "level": "advanced", "golf_club": "Moore Park"})

    body = await _feed(client, viewer, "sport=golf")
    ids = [item["user_id"] for item in body["items"]]
    assert picky_id not in ids  # the expert's own similar-level rule excludes Bea
    assert ids == [mentor_id, legacy_id]  # compatible before needs_setup
    assert body["total"] == 2
    assert body["viewer_setup_required"] is False
    assert body["pool_limit"] == 200

    mentor = body["items"][0]
    assert mentor["compatibility"]["tier"] == "compatible"
    reason_codes = {r["code"] for r in mentor["compatibility"]["reasons"]}
    assert {"more_experienced", "welcomes_beginners"} <= reason_codes
    summary = mentor["sport_profiles"][0]
    assert summary["preferences_configured"] is True
    assert summary["golf_handicap_tenths"] == 62
    assert summary["golf_partner_intents"] == ["welcome_beginners"]

    legacy = body["items"][1]
    assert legacy["compatibility"]["tier"] == "needs_setup"
    assert legacy["compatibility"]["reasons"] == []
    assert legacy["sport_profiles"][0]["preferences_configured"] is False


async def test_viewer_without_v2_preferences_gets_setup_flag_and_no_claims(client: AsyncClient) -> None:
    viewer, _ = await _user(client, "Old", {"sport": "golf", "level": "beginner"})
    await _user(client, "Mentor", EXPERT_WELCOMING)
    body = await _feed(client, viewer, "sport=golf")
    assert body["viewer_setup_required"] is True
    assert len(body["items"]) == 1
    compat = body["items"][0]["compatibility"]
    assert compat["tier"] == "needs_setup"
    assert compat["reasons"] == []
    assert {c["code"] for c in compat["caveats"]} == {"viewer_setup_required"}


async def test_viewer_with_no_sport_profile_also_needs_setup(client: AsyncClient) -> None:
    viewer, _ = await _user(client, "Nobody")
    await _user(client, "Runner", run())
    body = await _feed(client, viewer, "sport=running")
    assert body["viewer_setup_required"] is True
    assert body["items"][0]["compatibility"]["tier"] == "needs_setup"


@pytest.mark.parametrize("direction", ["viewer_blocks", "candidate_blocks"])
async def test_blocking_either_direction_hides_the_profile(client: AsyncClient, direction: str) -> None:
    viewer, viewer_id = await _user(client, "Bea", BEGINNER)
    mentor, mentor_id = await _user(client, "Mentor", EXPERT_WELCOMING)
    assert [i["user_id"] for i in (await _feed(client, viewer, "sport=golf"))["items"]] == [mentor_id]
    if direction == "viewer_blocks":
        r = await client.post(f"/blocks/{mentor_id}", headers=viewer)
    else:
        r = await client.post(f"/blocks/{viewer_id}", headers=mentor)
    assert r.status_code == 201, r.text
    assert (await _feed(client, viewer, "sport=golf"))["items"] == []


async def test_running_pace_overlap_and_exclusion(client: AsyncClient) -> None:
    viewer, _ = await _user(client, "Viv", run())
    _, overlap_id = await _user(client, "Overlap", run(run_pace_min_sec_per_km=360, run_pace_max_sec_per_km=420))
    _, too_fast_id = await _user(client, "Fast", run(run_pace_min_sec_per_km=240, run_pace_max_sec_per_km=300))
    _, social_id = await _user(
        client, "Social", run(run_pace_mode="social", run_pace_min_sec_per_km=None, run_pace_max_sec_per_km=None)
    )
    body = await _feed(client, viewer, "sport=running")
    by_id = {i["user_id"]: i for i in body["items"]}
    assert too_fast_id not in by_id
    assert [i["user_id"] for i in body["items"]] == [overlap_id, social_id]
    assert by_id[overlap_id]["compatibility"]["tier"] == "compatible"
    assert "6:00–6:30" in by_id[overlap_id]["compatibility"]["reasons"][0]["text"]
    social = by_id[social_id]["compatibility"]
    assert social["tier"] == "unverified"
    assert "pace_overlap" not in {r["code"] for r in social["reasons"]}

    strict = await _feed(client, viewer, "sport=running&strict_pace=true")
    assert [i["user_id"] for i in strict["items"]] == [overlap_id]


async def test_strict_pace_needs_the_viewers_own_range(client: AsyncClient) -> None:
    viewer, _ = await _user(
        client, "Soc", run(run_pace_mode="social", run_pace_min_sec_per_km=None, run_pace_max_sec_per_km=None)
    )
    r = await client.get("/discovery?sport=running&strict_pace=true", headers=viewer)
    assert r.status_code == 422
    assert "pace range" in r.json()["detail"]
    r = await client.get("/discovery?sport=golf&strict_pace=true", headers=viewer)
    assert r.status_code == 422


async def test_cursor_pages_do_not_skip_after_an_action_between_loads(client: AsyncClient) -> None:
    viewer, _ = await _user(client, "Viv", run())
    for i in range(7):
        # Distinct fit points so the ordering is not just by user id.
        times = ["morning"] if i % 2 else ["evening"]
        await _user(client, f"Runner{i}", run(preferred_times=times))

    full = [i["user_id"] for i in (await _feed(client, viewer, "sport=running&limit=50"))["items"]]
    assert len(full) == 7

    page1 = await _feed(client, viewer, "sport=running&limit=3")
    page1_ids = [i["user_id"] for i in page1["items"]]
    assert page1_ids == full[:3]
    assert page1["next_cursor"]

    # Act on a page-1 card before loading page 2: it leaves the pool, which
    # would shift an offset-based page 2 by one and silently skip full[3].
    r = await client.post(
        "/discovery/actions",
        json={"target_user_id": page1_ids[0], "action": "pass", "sport": "running"},
        headers=viewer,
    )
    assert r.status_code == 200, r.text

    page2 = await _feed(client, viewer, f"sport=running&limit=3&cursor={page1['next_cursor']}")
    assert [i["user_id"] for i in page2["items"]] == full[3:6]
    page3 = await _feed(client, viewer, f"sport=running&limit=3&cursor={page2['next_cursor']}")
    assert [i["user_id"] for i in page3["items"]] == full[6:]
    assert page3["next_cursor"] is None

    seen = page1_ids + [i["user_id"] for i in page2["items"] + page3["items"]]
    assert seen == full  # every candidate exactly once, in order
    assert len(set(seen)) == len(seen)

    # Demonstrates what the cursor avoids: the legacy offset now skips full[3].
    shifted = await _feed(client, viewer, "sport=running&limit=3&offset=3")
    assert shifted["items"][0]["user_id"] == full[4]


async def test_invalid_cursor_is_rejected(client: AsyncClient) -> None:
    viewer, _ = await _user(client, "Viv", run())
    r = await client.get("/discovery?sport=running&cursor=not-a-cursor", headers=viewer)
    assert r.status_code == 422


async def test_legacy_sport_feed_keeps_the_old_contract(client: AsyncClient) -> None:
    viewer, _ = await _user(client, "Gymmer", {"sport": "gym", "level": "beginner"})
    await _user(client, "Other", {"sport": "gym", "level": "advanced", "gym_name": "Anytime"})
    body = await _feed(client, viewer, "sport=gym")
    assert len(body["items"]) == 1
    assert body["items"][0]["compatibility"] is None
    assert body["items"][0]["sport_profiles"][0]["gym_name"] == "Anytime"
    assert body["next_cursor"] is None
    assert body["viewer_setup_required"] is False


async def test_old_client_like_flow_still_creates_a_match_on_v2_sports(client: AsyncClient) -> None:
    a, a_id = await _user(client, "Bea", BEGINNER)
    b, b_id = await _user(client, "Mentor", EXPERT_WELCOMING)
    r1 = await client.post(
        "/discovery/actions", json={"target_user_id": b_id, "action": "like", "sport": "golf"}, headers=a
    )
    r2 = await client.post(
        "/discovery/actions", json={"target_user_id": a_id, "action": "like", "sport": "golf"}, headers=b
    )
    assert r1.json()["match_created"] is False
    assert r2.json()["match_created"] is True
    assert r2.json()["match_id"]
