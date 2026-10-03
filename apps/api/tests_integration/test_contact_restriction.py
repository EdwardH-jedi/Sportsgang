"""Blocked contact on real PostgreSQL/Redis: lock ordering, races, live WebSocket.

Run after `alembic upgrade head` with POSTGRES_URL / REDIS_URL pointing at
disposable services (see test_run_golf_v2_journey.py). Contract:
docs/run-golf-v2/CONTRACTS.md §8.

The lock tests hold the pair's `users` rows from a second connection to pin
an interleaving deterministically: a contact write that waits on a block's
lock re-reads after the block commits and writes nothing; a block waits for
an in-flight contact write. The WebSocket test runs the app under a real
uvicorn server and a real websockets client.
"""

from __future__ import annotations

import asyncio
import socket
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
import uvicorn
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed

from app.core.config import get_settings
from app.db.session import engine
from app.main import app
from app.services.safety import CONTACT_UNAVAILABLE


@pytest.fixture(autouse=True)
async def _fresh_pool() -> AsyncGenerator[None, None]:
    await engine.dispose(close=False)
    yield


def _peer() -> tuple[str, int]:
    octets = uuid4().bytes
    return f"10.{octets[0]}.{octets[1]}.{octets[2]}", 40000 + octets[3]


async def _register(client: AsyncClient, tag: str) -> tuple[dict[str, str], str, str]:
    async with AsyncClient(transport=ASGITransport(app=app, client=_peer()), base_url="http://test") as signup:
        r = await signup.post(
            "/auth/register",
            json={"email": f"cr-{tag}-{uuid4().hex[:10]}@example.com", "password": "integration-password-123"},
        )
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = await client.get("/auth/me", headers=headers)
    return headers, me.json()["id"], token


async def _match(client: AsyncClient, a: dict, a_id: str, b: dict, b_id: str) -> str:
    like = {"action": "like", "sport": "running"}
    first = await client.post("/discovery/actions", json={**like, "target_user_id": b_id}, headers=a)
    assert first.status_code == 200, first.text
    r = await client.post("/discovery/actions", json={**like, "target_user_id": a_id}, headers=b)
    assert r.json()["match_created"] is True, r.text
    return r.json()["match_id"]


def _proposal(match_id: str) -> dict:
    start = datetime.now(timezone.utc) + timedelta(days=3)
    return {
        "match_id": match_id,
        "sport": "running",
        "starts_at": start.isoformat(),
        "ends_at": (start + timedelta(hours=1)).isoformat(),
    }


async def _scalar(sql: str, **params) -> int:
    async with engine.connect() as conn:
        return (await conn.execute(text(sql), params)).scalar_one()


class _PairLock:
    """Hold the pair's users rows from a second connection, like a concurrent transaction."""

    def __init__(self, a_id: str, b_id: str, mode: str) -> None:
        self.ids = [a_id, b_id]
        self.mode = mode
        self.engine = create_async_engine(get_settings().async_postgres_url)

    async def __aenter__(self):
        self.conn = await self.engine.connect()
        self.tx = await self.conn.begin()
        await self.conn.execute(
            text(f"SELECT id FROM users WHERE id IN (:a, :b) ORDER BY id {self.mode}"),
            {"a": self.ids[0], "b": self.ids[1]},
        )
        return self

    async def block(self, blocker_id: str, blocked_id: str) -> None:
        await self.conn.execute(
            text("INSERT INTO blocks (id, blocker_id, blocked_id, created_at) VALUES (:id, :x, :y, now())"),
            {"id": str(uuid4()), "x": blocker_id, "y": blocked_id},
        )

    async def __aexit__(self, *exc) -> None:
        await self.conn.close()
        await self.engine.dispose()


async def _assert_waits(task: asyncio.Task) -> None:
    await asyncio.sleep(1.0)
    assert not task.done(), "the request must wait for the other transaction's lock"


def _restricted(r) -> bool:
    return r.status_code == 403 and r.json()["detail"] == CONTACT_UNAVAILABLE


async def test_contact_writes_waiting_on_a_block_are_refused_and_write_nothing() -> None:
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            a, a_id, _ = await _register(client, "lock-a")
            b, b_id, _ = await _register(client, "lock-b")
            match_id = await _match(client, a, a_id, b, b_id)

            async with _PairLock(a_id, b_id, "FOR NO KEY UPDATE") as lock:
                await lock.block(a_id, b_id)
                send = asyncio.create_task(
                    client.post(f"/matches/{match_id}/messages", json={"body": "racing the block"}, headers=b)
                )
                like = asyncio.create_task(
                    client.post(
                        "/discovery/actions",
                        json={"target_user_id": a_id, "action": "like", "sport": "golf"},
                        headers=b,
                    )
                )
                propose = asyncio.create_task(client.post("/bookings", json=_proposal(match_id), headers=b))
                for task in (send, like, propose):
                    await _assert_waits(task)
                await lock.tx.commit()

            for task in (send, like, propose):
                result = await asyncio.wait_for(task, timeout=10)
                assert _restricted(result), result.text
            assert await _scalar("SELECT count(*) FROM messages WHERE match_id = :m", m=match_id) == 0
            assert await _scalar("SELECT count(*) FROM bookings WHERE match_id = :m", m=match_id) == 0
            assert (
                await _scalar(
                    "SELECT count(*) FROM discovery_actions WHERE actor_id = :b AND sport = 'golf'",
                    b=b_id,
                )
                == 0
            )
            assert await _scalar("SELECT count(*) FROM notification_events WHERE user_id = :a", a=a_id) == 0


async def test_block_waits_for_an_in_flight_contact_write() -> None:
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            a, a_id, _ = await _register(client, "share-a")
            b, b_id, _ = await _register(client, "share-b")
            await _match(client, a, a_id, b, b_id)

            # A send holding the pair's FOR SHARE lock; the block must queue behind it.
            async with _PairLock(a_id, b_id, "FOR SHARE") as lock:
                block = asyncio.create_task(client.post(f"/blocks/{b_id}", headers=a))
                await _assert_waits(block)
                await lock.tx.rollback()
            assert (await asyncio.wait_for(block, timeout=10)).status_code == 201


async def test_concurrent_sends_and_block_leave_a_consistent_history() -> None:
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            a, a_id, _ = await _register(client, "burst-a")
            b, b_id, _ = await _register(client, "burst-b")
            match_id = await _match(client, a, a_id, b, b_id)

            sends = [
                client.post(f"/matches/{match_id}/messages", json={"body": f"burst {i}"}, headers=b) for i in range(12)
            ]
            results = await asyncio.gather(client.post(f"/blocks/{b_id}", headers=a), *sends)
            assert results[0].status_code == 201
            statuses = [r.status_code for r in results[1:]]
            assert set(statuses) <= {201, 403}
            # Exactly the accepted sends were stored; refused ones wrote nothing.
            stored = await _scalar("SELECT count(*) FROM messages WHERE match_id = :m", m=match_id)
            assert stored == statuses.count(201)
            after = await client.post(f"/matches/{match_id}/messages", json={"body": "after"}, headers=b)
            assert _restricted(after)
            assert await _scalar("SELECT count(*) FROM messages WHERE match_id = :m", m=match_id) == stored


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


async def _closed_with(ws, code: int) -> None:
    with pytest.raises(ConnectionClosed) as info:
        await asyncio.wait_for(ws.recv(), timeout=5)
    assert info.value.rcvd is not None and info.value.rcvd.code == code


async def test_live_websocket_block_closes_sockets_and_refuses_reconnect() -> None:
    port = _free_port()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, lifespan="off", log_level="warning"))
    async with app.router.lifespan_context(app):
        serving = asyncio.create_task(server.serve())
        try:
            while not server.started:
                await asyncio.sleep(0.05)
            async with AsyncClient(base_url=f"http://127.0.0.1:{port}") as client:
                a, a_id, a_token = await _register(client, "ws-a")
                b, b_id, b_token = await _register(client, "ws-b")
                match_id = await _match(client, a, a_id, b, b_id)
                url = f"ws://127.0.0.1:{port}/matches/{match_id}/ws?token="

                async with connect(url + a_token) as ws_a, connect(url + b_token) as ws_b:
                    sent = await client.post(f"/matches/{match_id}/messages", json={"body": "hello"}, headers=b)
                    assert sent.status_code == 201
                    frame = await asyncio.wait_for(ws_a.recv(), timeout=5)
                    assert '"body":"hello"' in frame.replace(" ", "")
                    assert frame == await asyncio.wait_for(ws_b.recv(), timeout=5)  # sender's own echo

                    assert (await client.post(f"/blocks/{b_id}", headers=a)).status_code == 201
                    await _closed_with(ws_a, 4003)
                    await _closed_with(ws_b, 4003)

                for token in (a_token, b_token):
                    async with connect(url + token) as ws:
                        await _closed_with(ws, 4003)
                assert _restricted(
                    await client.post(f"/matches/{match_id}/messages", json={"body": "blocked"}, headers=b)
                )
                assert await _scalar("SELECT count(*) FROM messages WHERE match_id = :m", m=match_id) == 1

                assert (await client.delete(f"/blocks/{b_id}", headers=a)).status_code == 204
                async with connect(url + a_token) as ws_a:
                    again = await client.post(f"/matches/{match_id}/messages", json={"body": "unblocked"}, headers=b)
                    assert again.status_code == 201
                    frame = await asyncio.wait_for(ws_a.recv(), timeout=5)
                    assert '"body":"unblocked"' in frame.replace(" ", "")

                async with engine.begin() as conn:
                    await conn.execute(text("UPDATE users SET is_active = false WHERE id = :b"), {"b": b_id})
                async with connect(url + b_token) as ws:
                    await _closed_with(ws, 1008)
                assert (await client.get("/auth/me", headers=b)).status_code == 401
        finally:
            server.should_exit = True
            await asyncio.wait_for(serving, timeout=10)
