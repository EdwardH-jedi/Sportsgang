"""Safety (report + block) endpoint tests."""

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

from app.models import match, profile, user, chat, booking  # noqa: F401
from app.models import google_calendar, notification, safety  # noqa: F401
from app.models import event  # noqa: F401  — needed for the target_event_id FK

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


async def _register(client: AsyncClient, email: str) -> tuple[str, str]:
    r = await client.post("/auth/register", json={"email": email, "password": "password123"})
    token = r.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    return token, me.json()["id"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Report tests
# ---------------------------------------------------------------------------


async def test_create_report_requires_auth(client: AsyncClient) -> None:
    r = await client.post(
        "/reports",
        json={
            "reported_user_id": "00000000-0000-0000-0000-000000000001",
            "reason": "spam",
        },
    )
    assert r.status_code in (401, 403)


async def test_create_report_returns_record(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "rep_create_a@example.com")
    _, uid_b = await _register(client, "rep_create_b@example.com")

    r = await client.post(
        "/reports",
        json={"reported_user_id": uid_b, "reason": "spam"},
        headers=_auth(token_a),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["reason"] == "spam"
    assert body["reported_id"] == uid_b


async def test_cannot_report_self(client: AsyncClient) -> None:
    token, uid = await _register(client, "rep_self@example.com")
    r = await client.post(
        "/reports",
        json={"reported_user_id": uid, "reason": "other"},
        headers=_auth(token),
    )
    assert r.status_code == 422


async def test_report_with_context(client: AsyncClient) -> None:
    token_a, _ = await _register(client, "rep_ctx_a@example.com")
    _, uid_b = await _register(client, "rep_ctx_b@example.com")

    r = await client.post(
        "/reports",
        json={"reported_user_id": uid_b, "reason": "harassment", "context": "Sent rude messages."},
        headers=_auth(token_a),
    )
    assert r.status_code == 201
    assert r.json()["context"] == "Sent rude messages."


# ---------------------------------------------------------------------------
# Block tests
# ---------------------------------------------------------------------------


async def test_block_requires_auth(client: AsyncClient) -> None:
    r = await client.post("/blocks/00000000-0000-0000-0000-000000000001")
    assert r.status_code in (401, 403)


async def test_block_user(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "blk_create_a@example.com")
    _, uid_b = await _register(client, "blk_create_b@example.com")

    r = await client.post(f"/blocks/{uid_b}", headers=_auth(token_a))
    assert r.status_code == 201
    body = r.json()
    assert body["blocker_id"] == uid_a
    assert body["blocked_id"] == uid_b


async def test_block_is_idempotent(client: AsyncClient) -> None:
    token_a, _ = await _register(client, "blk_idem_a@example.com")
    _, uid_b = await _register(client, "blk_idem_b@example.com")

    r1 = await client.post(f"/blocks/{uid_b}", headers=_auth(token_a))
    r2 = await client.post(f"/blocks/{uid_b}", headers=_auth(token_a))
    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["id"] == r2.json()["id"]


async def test_cannot_block_self(client: AsyncClient) -> None:
    token, uid = await _register(client, "blk_self@example.com")
    r = await client.post(f"/blocks/{uid}", headers=_auth(token))
    assert r.status_code == 422


async def test_list_blocks(client: AsyncClient) -> None:
    token_a, _ = await _register(client, "blk_list_a@example.com")
    _, uid_b = await _register(client, "blk_list_b@example.com")
    _, uid_c = await _register(client, "blk_list_c@example.com")

    await client.post(f"/blocks/{uid_b}", headers=_auth(token_a))
    await client.post(f"/blocks/{uid_c}", headers=_auth(token_a))

    r = await client.get("/blocks", headers=_auth(token_a))
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2


async def test_list_blocks_names_the_blocked_user(client: AsyncClient) -> None:
    """The blocked-users screen shows a name, never a raw id; a user without a
    profile still appears, with a null name."""
    token_a, _ = await _register(client, "blk_name_a@example.com")
    token_b, uid_b = await _register(client, "blk_name_b@example.com")
    _, uid_c = await _register(client, "blk_name_c@example.com")
    await client.put(
        "/users/me/profile",
        json={"display_name": "Named Runner"},
        headers=_auth(token_b),
    )

    await client.post(f"/blocks/{uid_b}", headers=_auth(token_a))
    await client.post(f"/blocks/{uid_c}", headers=_auth(token_a))

    r = await client.get("/blocks", headers=_auth(token_a))
    assert r.status_code == 200
    names = {item["blocked_id"]: item["blocked_display_name"] for item in r.json()["items"]}
    assert names == {uid_b: "Named Runner", uid_c: None}


async def test_unblock_user(client: AsyncClient) -> None:
    token_a, _ = await _register(client, "blk_unblk_a@example.com")
    _, uid_b = await _register(client, "blk_unblk_b@example.com")

    await client.post(f"/blocks/{uid_b}", headers=_auth(token_a))
    r = await client.delete(f"/blocks/{uid_b}", headers=_auth(token_a))
    assert r.status_code == 204

    list_r = await client.get("/blocks", headers=_auth(token_a))
    assert list_r.json()["total"] == 0


async def test_unblock_nonexistent_returns_404(client: AsyncClient) -> None:
    token, _ = await _register(client, "blk_noexist@example.com")
    r = await client.delete("/blocks/00000000-0000-0000-0000-000000000001", headers=_auth(token))
    assert r.status_code == 404


async def test_blocked_user_excluded_from_discovery(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "blk_disc_a@example.com")
    token_b, uid_b = await _register(client, "blk_disc_b@example.com")

    # Give B a profile + sport so they would appear in discovery
    await client.put(
        "/users/me/profile",
        json={"display_name": "Blocked User"},
        headers=_auth(token_b),
    )
    await client.post(
        "/users/me/sport-profiles",
        json={"sport": "gym", "level": "beginner"},
        headers=_auth(token_b),
    )

    # Confirm B appears in A's feed before blocking
    r_before = await client.get("/discovery?sport=gym", headers=_auth(token_a))
    user_ids_before = [item["user_id"] for item in r_before.json()["items"]]
    assert uid_b in user_ids_before

    # A blocks B
    await client.post(f"/blocks/{uid_b}", headers=_auth(token_a))

    # B should no longer appear
    r_after = await client.get("/discovery?sport=gym", headers=_auth(token_a))
    user_ids_after = [item["user_id"] for item in r_after.json()["items"]]
    assert uid_b not in user_ids_after


async def test_blocking_user_also_excluded_from_discovery(client: AsyncClient) -> None:
    """If B blocks A, then A should not see B in discovery (bidirectional hide)."""
    token_a, uid_a = await _register(client, "blk_bidir_a@example.com")
    token_b, uid_b = await _register(client, "blk_bidir_b@example.com")

    await client.put(
        "/users/me/profile",
        json={"display_name": "Bidirectional Block User"},
        headers=_auth(token_b),
    )
    await client.post(
        "/users/me/sport-profiles",
        json={"sport": "gym", "level": "intermediate"},
        headers=_auth(token_b),
    )

    # B blocks A
    await client.post(f"/blocks/{uid_a}", headers=_auth(token_b))

    # A should not see B in discovery
    r = await client.get("/discovery?sport=gym", headers=_auth(token_a))
    user_ids = [item["user_id"] for item in r.json()["items"]]
    assert uid_b not in user_ids


# ---------------------------------------------------------------------------
# GET /reports/mine
# ---------------------------------------------------------------------------


async def test_list_my_reports_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/reports/mine")
    assert r.status_code in (401, 403)


async def test_list_my_reports_returns_only_callers_reports(
    client: AsyncClient,
) -> None:
    """Caller sees only reports they submitted — never another user's."""
    token_a, uid_a = await _register(client, "rep_mine_a@example.com")
    token_b, uid_b = await _register(client, "rep_mine_b@example.com")
    _, uid_c = await _register(client, "rep_mine_c@example.com")

    # A reports B and C; B reports A. Caller A must see only the
    # two reports A submitted; B's report against A must not leak.
    await client.post(
        "/reports",
        json={"reported_user_id": uid_b, "reason": "harassment"},
        headers=_auth(token_a),
    )
    await client.post(
        "/reports",
        json={"reported_user_id": uid_c, "reason": "spam"},
        headers=_auth(token_a),
    )
    await client.post(
        "/reports",
        json={"reported_user_id": uid_a, "reason": "other"},
        headers=_auth(token_b),
    )

    r = await client.get("/reports/mine", headers=_auth(token_a))
    assert r.status_code == 200
    body = r.json()
    assert set(body.keys()) == {"items", "total"}
    assert body["total"] == 2
    assert len(body["items"]) == 2
    # Every item must be authored by the caller; never expose another
    # reporter's row.
    assert all(item["reporter_id"] == uid_a for item in body["items"])

    # B sees only their one report; doesn't leak A's two.
    rb = await client.get("/reports/mine", headers=_auth(token_b))
    body_b = rb.json()
    assert body_b["total"] == 1
    assert body_b["items"][0]["reporter_id"] == uid_b


async def test_list_my_reports_empty_response_shape(client: AsyncClient) -> None:
    token, _ = await _register(client, "rep_mine_empty@example.com")
    r = await client.get("/reports/mine", headers=_auth(token))
    assert r.status_code == 200
    body = r.json()
    assert body == {"items": [], "total": 0}


# ---------------------------------------------------------------------------
# V1.1 contract: target_type / target_event_id / status are server-controlled
# ---------------------------------------------------------------------------


from datetime import datetime, timedelta, timezone  # noqa: E402


def _event_payload(**overrides) -> dict:
    body = {
        "title": "Friendly hoops",
        "sport": "basketball",
        "mode": "casual",
        "starts_at": (datetime.now(tz=timezone.utc) - timedelta(hours=1)).isoformat(),
        "location_text": "Bondi Court",
        "capacity": 10,
        "visibility": "public",
    }
    body.update(overrides)
    return body


async def test_new_reports_default_to_submitted(client: AsyncClient) -> None:
    token_a, _ = await _register(client, "rep_default_a@example.com")
    _, uid_b = await _register(client, "rep_default_b@example.com")
    r = await client.post(
        "/reports",
        json={"reported_user_id": uid_b, "reason": "harassment"},
        headers=_auth(token_a),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "submitted"
    assert body["target_type"] == "user"
    assert body["target_event_id"] is None


async def test_public_create_report_cannot_set_actioned(
    client: AsyncClient,
) -> None:
    """
    The CreateReportRequest schema does NOT expose status, so a client
    that sends one must be ignored and the row must still default to
    'submitted'. Belt and braces against a future leak.
    """
    token_a, _ = await _register(client, "rep_actioned_a@example.com")
    _, uid_b = await _register(client, "rep_actioned_b@example.com")
    r = await client.post(
        "/reports",
        json={
            "reported_user_id": uid_b,
            "reason": "harassment",
            "status": "actioned",  # ignored by the schema
        },
        headers=_auth(token_a),
    )
    assert r.status_code == 201
    assert r.json()["status"] == "submitted"


async def test_event_report_create(client: AsyncClient) -> None:
    host_tok, _ = await _register(client, "rep_evt_host@example.com")
    reporter_tok, _ = await _register(client, "rep_evt_reporter@example.com")
    created = await client.post("/events", json=_event_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]

    r = await client.post(
        "/reports",
        json={
            "target_type": "event",
            "target_event_id": event_id,
            "reason": "unsafe_behavior",
        },
        headers=_auth(reporter_tok),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["target_type"] == "event"
    assert body["target_event_id"] == event_id
    assert body["reported_id"] is None
    assert body["status"] == "submitted"


async def test_event_report_unknown_event_404(client: AsyncClient) -> None:
    token, _ = await _register(client, "rep_evt_unknown@example.com")
    r = await client.post(
        "/reports",
        json={
            "target_type": "event",
            "target_event_id": "00000000-0000-0000-0000-000000000abc",
            "reason": "fraud_or_scam",
        },
        headers=_auth(token),
    )
    assert r.status_code == 404


async def test_cannot_report_own_event(client: AsyncClient) -> None:
    host_tok, _ = await _register(client, "rep_own_evt@example.com")
    created = await client.post("/events", json=_event_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    r = await client.post(
        "/reports",
        json={
            "target_type": "event",
            "target_event_id": event_id,
            "reason": "fraud_or_scam",
        },
        headers=_auth(host_tok),
    )
    assert r.status_code == 422


async def test_event_report_user_target_mismatch_rejected(
    client: AsyncClient,
) -> None:
    """target_type=user must omit target_event_id."""
    host_tok, _ = await _register(client, "rep_mix_host@example.com")
    other_tok, other_uid = await _register(client, "rep_mix_other@example.com")
    created = await client.post("/events", json=_event_payload(), headers=_auth(host_tok))
    event_id = created.json()["id"]
    r = await client.post(
        "/reports",
        json={
            "target_type": "user",
            "reported_user_id": other_uid,
            "target_event_id": event_id,
            "reason": "harassment",
        },
        headers=_auth(host_tok),
    )
    assert r.status_code == 422
