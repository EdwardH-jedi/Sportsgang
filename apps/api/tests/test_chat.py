"""Chat endpoint tests using an in-memory SQLite async database."""

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
    user_id = me.json()["id"]
    return token, user_id


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _mutual_like_and_get_match_id(
    client: AsyncClient,
    token_a: str,
    uid_a: str,
    token_b: str,
    uid_b: str,
    sport: str = "gym",
) -> str:
    await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_b, "action": "like", "sport": sport},
        headers=_auth(token_a),
    )
    r = await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_a, "action": "like", "sport": sport},
        headers=_auth(token_b),
    )
    return r.json()["match_id"]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_list_messages_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/matches/00000000-0000-0000-0000-000000000001/messages")
    assert r.status_code in (401, 403)


async def test_send_message_requires_auth(client: AsyncClient) -> None:
    r = await client.post(
        "/matches/00000000-0000-0000-0000-000000000001/messages",
        json={"body": "hello"},
    )
    assert r.status_code in (401, 403)


async def test_list_messages_nonexistent_match_returns_404(client: AsyncClient) -> None:
    token, _ = await _register(client, "chat_noexist@example.com")
    r = await client.get(
        "/matches/00000000-0000-0000-0000-000000000001/messages",
        headers=_auth(token),
    )
    assert r.status_code == 404


async def test_non_participant_cannot_read_messages(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "chat_nonpart_a@example.com")
    token_b, uid_b = await _register(client, "chat_nonpart_b@example.com")
    token_c, _ = await _register(client, "chat_nonpart_c@example.com")

    match_id = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)

    r = await client.get(f"/matches/{match_id}/messages", headers=_auth(token_c))
    assert r.status_code == 403


async def test_messages_empty_initially(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "chat_empty_a@example.com")
    token_b, uid_b = await _register(client, "chat_empty_b@example.com")

    match_id = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)

    r = await client.get(f"/matches/{match_id}/messages", headers=_auth(token_a))
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


async def test_send_and_receive_message(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "chat_send_a@example.com")
    token_b, uid_b = await _register(client, "chat_send_b@example.com")

    match_id = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)

    send_r = await client.post(
        f"/matches/{match_id}/messages",
        json={"body": "Hey, want to hit the gym tomorrow?"},
        headers=_auth(token_a),
    )
    assert send_r.status_code == 201
    msg = send_r.json()
    assert msg["body"] == "Hey, want to hit the gym tomorrow?"
    assert msg["match_id"] == match_id
    assert "sender_id" in msg
    assert "id" in msg

    list_r = await client.get(f"/matches/{match_id}/messages", headers=_auth(token_b))
    assert list_r.status_code == 200
    items = list_r.json()["items"]
    assert len(items) == 1
    assert items[0]["body"] == "Hey, want to hit the gym tomorrow?"


async def test_send_message_blocked_by_moderation_returns_422_and_does_not_persist(
    client: AsyncClient,
) -> None:
    """
    Integration: a message containing disallowed content is rejected
    with the moderation service's safe user message, and no Message
    row is created.

    Uses the ``BANNED_PROFANITY_FIXTURE`` sentinel so the test file
    doesn't contain real slurs. Real-word coverage lives in the
    unit-test surface (``test_content_moderation.py``).
    """
    token_a, uid_a = await _register(client, "chat_mod_a@example.com")
    token_b, uid_b = await _register(client, "chat_mod_b@example.com")
    match_id = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)

    r = await client.post(
        f"/matches/{match_id}/messages",
        json={"body": "hey BANNED_PROFANITY_FIXTURE jerk"},
        headers=_auth(token_a),
    )
    assert r.status_code == 422, r.text
    assert "community guidelines" in r.json()["detail"].lower()
    # Defense in depth: the matched fragment must NOT leak to the client.
    assert "BANNED" not in r.json()["detail"]

    # No message persisted — listing should return empty.
    list_r = await client.get(f"/matches/{match_id}/messages", headers=_auth(token_a))
    assert list_r.status_code == 200
    assert list_r.json()["items"] == []


async def test_messages_ordered_by_created_at_asc(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "chat_order_a@example.com")
    token_b, uid_b = await _register(client, "chat_order_b@example.com")

    match_id = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)

    await client.post(f"/matches/{match_id}/messages", json={"body": "first"}, headers=_auth(token_a))
    await client.post(f"/matches/{match_id}/messages", json={"body": "second"}, headers=_auth(token_b))
    await client.post(f"/matches/{match_id}/messages", json={"body": "third"}, headers=_auth(token_a))

    r = await client.get(f"/matches/{match_id}/messages", headers=_auth(token_a))
    bodies = [m["body"] for m in r.json()["items"]]
    assert bodies == ["first", "second", "third"]


async def test_both_participants_see_same_messages(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "chat_both_a@example.com")
    token_b, uid_b = await _register(client, "chat_both_b@example.com")

    match_id = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)

    await client.post(f"/matches/{match_id}/messages", json={"body": "hi"}, headers=_auth(token_a))

    r_a = await client.get(f"/matches/{match_id}/messages", headers=_auth(token_a))
    r_b = await client.get(f"/matches/{match_id}/messages", headers=_auth(token_b))

    ids_a = {m["id"] for m in r_a.json()["items"]}
    ids_b = {m["id"] for m in r_b.json()["items"]}
    assert ids_a == ids_b


# ---------------------------------------------------------------------------
# ConnectionManager unit tests  (no HTTP / no DB)
# ---------------------------------------------------------------------------


async def test_connection_manager_broadcast_reaches_all_connections() -> None:
    from unittest.mock import AsyncMock

    from app.services.chat import ConnectionManager as _ConnectionManager

    manager = _ConnectionManager()
    ws1, ws2 = AsyncMock(), AsyncMock()

    await manager.connect("room-x", ws1)
    await manager.connect("room-x", ws2)

    await manager.broadcast("room-x", {"body": "hello"})

    ws1.send_json.assert_called_once_with({"body": "hello"})
    ws2.send_json.assert_called_once_with({"body": "hello"})


async def test_connection_manager_broadcast_skips_other_rooms() -> None:
    from unittest.mock import AsyncMock

    from app.services.chat import ConnectionManager as _ConnectionManager

    manager = _ConnectionManager()
    ws_a, ws_b = AsyncMock(), AsyncMock()

    await manager.connect("room-a", ws_a)
    await manager.connect("room-b", ws_b)

    await manager.broadcast("room-a", {"body": "only-a"})

    ws_a.send_json.assert_called_once()
    ws_b.send_json.assert_not_called()


async def test_connection_manager_disconnect_stops_future_broadcasts() -> None:
    from unittest.mock import AsyncMock

    from app.services.chat import ConnectionManager as _ConnectionManager

    manager = _ConnectionManager()
    ws = AsyncMock()

    await manager.connect("room-y", ws)
    manager.disconnect("room-y", ws)

    await manager.broadcast("room-y", {"body": "ghost"})

    ws.send_json.assert_not_called()


async def test_connection_manager_tolerates_send_failure() -> None:
    """A stale socket that raises on send_json must not crash the broadcast."""
    from unittest.mock import AsyncMock

    from app.services.chat import ConnectionManager as _ConnectionManager

    manager = _ConnectionManager()
    bad_ws, good_ws = AsyncMock(), AsyncMock()
    bad_ws.send_json.side_effect = RuntimeError("broken pipe")

    await manager.connect("room-z", bad_ws)
    await manager.connect("room-z", good_ws)

    # Should not raise
    await manager.broadcast("room-z", {"body": "resilient"})

    good_ws.send_json.assert_called_once_with({"body": "resilient"})


# ---------------------------------------------------------------------------
# Broadcast integration: HTTP send_message triggers _manager.broadcast
# ---------------------------------------------------------------------------


async def test_send_message_triggers_ws_broadcast(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    token_a, uid_a = await _register(client, "ws_bcast_a@example.com")
    token_b, uid_b = await _register(client, "ws_bcast_b@example.com")
    match_id = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)

    broadcast_calls: list[tuple[str, dict]] = []

    async def _capture_broadcast(room: str, data: dict) -> None:
        broadcast_calls.append((room, data))

    import app.services.chat as chat_service

    monkeypatch.setattr(chat_service.connections, "broadcast", _capture_broadcast)

    r = await client.post(
        f"/matches/{match_id}/messages",
        json={"body": "ws broadcast test"},
        headers=_auth(token_a),
    )
    assert r.status_code == 201

    assert len(broadcast_calls) == 1
    room, data = broadcast_calls[0]
    assert room == match_id
    assert data["body"] == "ws broadcast test"
    assert data["senderId"] == uid_a
    assert data["matchId"] == match_id
    assert "id" in data
    assert "createdAt" in data
