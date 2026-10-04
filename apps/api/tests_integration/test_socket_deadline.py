"""Finite realtime delivery and closure on real PostgreSQL (review MA-B, CONTRACTS.md §8).

Delivery holds the pair's contact lock while it sends, so a block waits for
it. The room's sends run concurrently under one deadline
(WS_SEND_TIMEOUT_SECONDS), whatever the number of sockets; unfinished sends
are cancelled and awaited before the lock is released. Close attempts run
concurrently, each bounded by WS_CLOSE_TIMEOUT_SECONDS, and are owned by the
connection manager, so a hung close or a cancelled caller cannot strand the
room's other sockets.

The sockets here stand in for the server side at the send/close boundary
(stalled, failing and hung transports are injected); the database locks, the
block request and the delivery path are real.

Run against disposable services only (see test_run_golf_v2_journey.py).
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator
from unittest.mock import patch
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient
from test_contact_authority import BLOCK_WAIT, _lock_waiter
from test_contact_restriction import _match, _register

from app.db.session import AsyncSessionLocal, engine
from app.main import app
from app.services import chat as chat_service
from app.services.chat import (
    WS_CLOSE_FORBIDDEN,
    WS_CLOSE_TIMEOUT_SECONDS,
    WS_CLOSE_UNAVAILABLE,
    WS_SEND_TIMEOUT_SECONDS,
)

OVERHEAD = 1.0  # measured database and scheduling slack on top of a deadline


@pytest.fixture(autouse=True)
async def _isolated() -> AsyncGenerator[None, None]:
    await engine.dispose(close=False)
    async with app.router.lifespan_context(app):
        yield
    chat_service.connections._rooms.clear()


class _Socket:
    """Server-side socket stand-in: records every send and close attempt."""

    def __init__(self, *, stall: bool = False, hang_close: bool = False, fail_close: bool = False) -> None:
        self.stall, self.hang_close, self.fail_close = stall, hang_close, fail_close
        self.sends = 0  # send invocations
        self.sending = 0  # sends still running
        self.frames: list[dict] = []
        self.send_entered = asyncio.Event()
        self.close_entered = asyncio.Event()
        self.closed_with: int | None = None

    async def send_json(self, data: dict) -> None:
        self.sends += 1
        self.sending += 1
        self.send_entered.set()
        try:
            if self.stall:
                await asyncio.Event().wait()
            self.frames.append(data)
        finally:
            self.sending -= 1

    async def close(self, code: int) -> None:
        self.close_entered.set()
        if self.fail_close:
            raise RuntimeError("injected close failure")
        if self.hang_close:
            await asyncio.Event().wait()
        self.closed_with = code


async def _pair(client: AsyncClient, tag: str):
    a, a_id, _ = await _register(client, f"{tag}-a")
    b, b_id, _ = await _register(client, f"{tag}-b")
    return a, a_id, b_id, await _match(client, a, a_id, b, b_id)


async def _closes_finished() -> None:
    loop = asyncio.get_running_loop()
    deadline = loop.time() + WS_CLOSE_TIMEOUT_SECONDS + OVERHEAD
    while chat_service.connections._closing:
        assert loop.time() < deadline, "close attempts are still running"
        await asyncio.sleep(0.02)


def _sending_at_release(db, sockets: list[_Socket]) -> tuple[list[int], object]:
    """Patch db.rollback (which releases the pair lock) to record sends still running."""
    seen: list[int] = []
    original = db.rollback

    async def rollback() -> None:
        seen.append(sum(s.sending for s in sockets))
        await original()

    return seen, patch.object(db, "rollback", rollback)


@pytest.mark.parametrize("stalled", [1, 3, 20])
async def test_stalled_sockets_share_one_room_deadline_while_a_block_waits(stalled: int) -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        a, a_id, b_id, match_id = await _pair(client, f"deadline-{stalled}")
        slow = [_Socket(stall=True, fail_close=i == 0, hang_close=i == 1) for i in range(stalled)]
        healthy = _Socket()
        chat_service.connections._rooms[match_id] = [*slow, healthy]
        loop = asyncio.get_running_loop()
        async with AsyncSessionLocal() as db:
            msg = await chat_service.send_message(db, UUID(match_id), UUID(a_id), "deadline")
            at_release, patched = _sending_at_release(db, slow)
            with patched:
                started = loop.time()
                delivery = asyncio.create_task(chat_service.deliver_message(db, msg))
                await asyncio.wait_for(asyncio.gather(*(s.send_entered.wait() for s in slow)), timeout=5)
                block = asyncio.create_task(client.post(f"/blocks/{b_id}", headers=a))
                await _lock_waiter(BLOCK_WAIT)  # the block waits on the delivery's pair lock
                assert await delivery is True
                delivered = loop.time() - started
                sends_before_commit = sum(s.sends for s in [*slow, healthy])
                r = await asyncio.wait_for(block, timeout=WS_CLOSE_TIMEOUT_SECONDS + OVERHEAD)
                blocked = loop.time() - started
        assert r.status_code == 201, r.text
        assert at_release == [0]  # every send settled before the lock was released
        assert WS_SEND_TIMEOUT_SECONDS <= delivered <= WS_SEND_TIMEOUT_SECONDS + OVERHEAD
        assert blocked <= WS_SEND_TIMEOUT_SECONDS + WS_CLOSE_TIMEOUT_SECONDS + OVERHEAD
        assert sum(s.sends for s in [*slow, healthy]) == sends_before_commit == stalled + 1  # none after
        assert len(healthy.frames) == 1 and healthy.closed_with == WS_CLOSE_FORBIDDEN
        await _closes_finished()
        assert all(s.close_entered.is_set() for s in slow)
        assert [s.closed_with for s in slow[2:]] == [WS_CLOSE_UNAVAILABLE] * max(stalled - 2, 0)
        assert not chat_service.connections._rooms.get(match_id)


async def test_cancelled_delivery_cancels_and_awaits_every_send_before_the_lock_is_released() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        a, a_id, b_id, match_id = await _pair(client, "deadline-cancel")
        slow = [_Socket(stall=True) for _ in range(3)]
        chat_service.connections._rooms[match_id] = list(slow)
        async with AsyncSessionLocal() as db:
            msg = await chat_service.send_message(db, UUID(match_id), UUID(a_id), "cancelled")
            at_release, patched = _sending_at_release(db, slow)
            with patched:
                delivery = asyncio.create_task(chat_service.deliver_message(db, msg))
                await asyncio.wait_for(asyncio.gather(*(s.send_entered.wait() for s in slow)), timeout=5)
                delivery.cancel()
                with pytest.raises(asyncio.CancelledError):
                    await delivery
            assert at_release == [0]
            r = await asyncio.wait_for(client.post(f"/blocks/{b_id}", headers=a), timeout=OVERHEAD + 1)
        assert r.status_code == 201, r.text
        assert sum(s.sends for s in slow) == 3
        await _closes_finished()
        assert [s.closed_with for s in slow] == [WS_CLOSE_UNAVAILABLE] * 3


async def test_failed_broadcast_releases_the_lock() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        a, a_id, b_id, match_id = await _pair(client, "deadline-raise")

        async def broken(room: str, data: dict) -> None:
            raise RuntimeError("injected broadcast failure")

        async with AsyncSessionLocal() as db:
            msg = await chat_service.send_message(db, UUID(match_id), UUID(a_id), "raises")
            with patch.object(chat_service.connections, "broadcast", broken):
                with pytest.raises(RuntimeError, match="injected"):
                    await chat_service.deliver_message(db, msg)
            r = await asyncio.wait_for(client.post(f"/blocks/{b_id}", headers=a), timeout=OVERHEAD + 1)
        assert r.status_code == 201, r.text


@pytest.mark.parametrize("cancel", [False, True], ids=["awaited", "cancelled"])
async def test_hung_or_failing_closes_cannot_strand_the_rooms_other_sockets(cancel: bool) -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        _, a_id, b_id, match_id = await _pair(client, f"close-{cancel}")
    hung = [_Socket(hang_close=True) for _ in range(5)]
    failing = _Socket(fail_close=True)
    healthy = [_Socket() for _ in range(3)]
    sockets = [hung[0], failing, *healthy, *hung[1:]]
    chat_service.connections._rooms[match_id] = list(sockets)
    loop = asyncio.get_running_loop()
    async with AsyncSessionLocal() as db:
        started = loop.time()
        closing = asyncio.create_task(chat_service.close_pair_rooms(db, UUID(a_id), UUID(b_id)))
        await asyncio.wait_for(hung[0].close_entered.wait(), timeout=5)
        if cancel:
            closing.cancel()
            with pytest.raises(asyncio.CancelledError):
                await closing
        else:
            await asyncio.wait_for(closing, timeout=WS_CLOSE_TIMEOUT_SECONDS + OVERHEAD)
            assert loop.time() - started <= WS_CLOSE_TIMEOUT_SECONDS + OVERHEAD  # not per socket
    assert not chat_service.connections._rooms.get(match_id)
    await _closes_finished()
    assert all(s.close_entered.is_set() for s in sockets)
    assert [s.closed_with for s in healthy] == [WS_CLOSE_FORBIDDEN] * 3
