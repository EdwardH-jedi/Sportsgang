"""Contact authority ordering on real PostgreSQL (review Q01–Q03, CONTRACTS.md §8).

The pair's `users` rows are the one authority boundary. A contact effect —
socket admission (check → register), realtime delivery (check → broadcast),
proposal push (check → token → provider) — holds the pair's FOR SHARE lock
from its check to the end of its effect; a block takes FOR NO KEY UPDATE.
Each test pins one interleaving with deterministic barriers on real
PostgreSQL, a real uvicorn server and a real websockets client; a block's
wait is observed in pg_stat_activity, not inferred from a sleep.

The overnight review's probes paused an effect between its check and its
effect and then committed a block. After this repair that interleaving
cannot happen: the block's commit waits for the effect. These tests assert
that wait and the resulting order instead, and keep the safety property —
nothing is admitted, delivered or pushed after the block commits.

Run against disposable services only (see test_run_golf_v2_journey.py).
"""

from __future__ import annotations

import asyncio
import json
import os
import pathlib
import sys
from collections.abc import AsyncGenerator
from unittest.mock import patch
from uuid import UUID

import pytest
import uvicorn
from httpx import AsyncClient
from sqlalchemy import select, text
from test_contact_restriction import (
    _closed_with,
    _free_port,
    _match,
    _PairLock,
    _proposal,
    _register,
    _restricted,
    _scalar,
)
from websockets.asyncio.client import connect

from app.db.session import AsyncSessionLocal, engine
from app.main import app
from app.models.notification import NotificationEvent
from app.services import chat as chat_service
from app.services import notifications as notif_service
from app.services import safety

BLOCK_WAIT = "%FOR NO KEY UPDATE%"  # block/unblock's pair lock
CONTACT_WAIT = "%FOR SHARE%"  # a contact effect's pair lock


@pytest.fixture(autouse=True)
async def _fresh_pool() -> AsyncGenerator[None, None]:
    await engine.dispose(close=False)
    yield


async def _lock_waiter(pattern: str, timeout: float = 5.0) -> None:
    """Return once some backend waits on a row lock in a statement matching `pattern`."""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while True:
        async with engine.connect() as conn:
            waiting = (
                await conn.execute(
                    text(
                        "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() "
                        "AND wait_event_type = 'Lock' AND query ILIKE :p"
                    ),
                    {"p": pattern},
                )
            ).scalar_one()
        if waiting:
            return
        assert loop.time() < deadline, f"no backend waited on a lock in {pattern}"
        await asyncio.sleep(0.02)


async def _open(url: str):
    """Open a client socket as a task-friendly coroutine (the handshake may be held)."""
    return await connect(url)


async def _registered(room: str, count: int) -> None:
    for _ in range(250):
        if len(chat_service.connections._rooms.get(room, [])) == count:
            return
        await asyncio.sleep(0.02)
    raise AssertionError(f"room {room} never had {count} registered socket(s)")


class _Server:
    """The app under a real uvicorn server, with an HTTP client pointed at it."""

    async def __aenter__(self) -> _Server:
        self.port = _free_port()
        self.server = uvicorn.Server(
            uvicorn.Config(app, host="127.0.0.1", port=self.port, lifespan="off", log_level="warning")
        )
        self.serving = asyncio.create_task(self.server.serve())
        while not self.server.started:
            await asyncio.sleep(0.02)
        self.client = AsyncClient(base_url=f"http://127.0.0.1:{self.port}", timeout=20)
        return self

    def ws(self, match_id: str, token: str) -> str:
        return f"ws://127.0.0.1:{self.port}/matches/{match_id}/ws?token={token}"

    async def __aexit__(self, exc_type, *exc) -> None:
        await self.client.aclose()
        self.server.should_exit = True
        try:
            await asyncio.wait_for(self.serving, timeout=10)
        except TimeoutError:
            if exc_type is None:  # don't mask the test's own failure
                raise


async def _pair(client: AsyncClient, tag: str):
    a, a_id, a_token = await _register(client, f"{tag}-a")
    b, b_id, b_token = await _register(client, f"{tag}-b")
    match_id = await _match(client, a, a_id, b, b_id)
    return a, a_id, a_token, b, b_id, b_token, match_id


# ─── Q01: realtime admission and delivery ────────────────────────────────────


async def test_admission_past_its_check_makes_the_block_wait_and_is_then_closed() -> None:
    async with app.router.lifespan_context(app), _Server() as srv:
        a, a_id, a_token, b, b_id, _, match_id = await _pair(srv.client, "adm")
        reached, resume = asyncio.Event(), asyncio.Event()
        original = chat_service.connections.connect

        async def held(room, ws):
            if room == match_id:
                reached.set()
                await resume.wait()
            await original(room, ws)

        with patch.object(chat_service.connections, "connect", held):
            opening = asyncio.create_task(_open(srv.ws(match_id, a_token)))
            try:
                await asyncio.wait_for(reached.wait(), timeout=5)  # check passed; lock held; not registered
                block = asyncio.create_task(srv.client.post(f"/blocks/{b_id}", headers=a))
                await _lock_waiter(BLOCK_WAIT)
                assert not block.done()
            finally:
                resume.set()
            ws = await asyncio.wait_for(opening, timeout=10)
            try:
                assert (await asyncio.wait_for(block, timeout=10)).status_code == 201
                await _closed_with(ws, 4003)  # no frame first: recv() must raise the close
            finally:
                await ws.close()
        assert not chat_service.connections._rooms.get(match_id)


async def test_admission_after_a_committed_block_is_refused_and_never_registered() -> None:
    async with app.router.lifespan_context(app), _Server() as srv:
        a, a_id, a_token, b, b_id, b_token, match_id = await _pair(srv.client, "adm-late")
        assert (await srv.client.post(f"/blocks/{b_id}", headers=a)).status_code == 201
        for token in (a_token, b_token):
            async with connect(srv.ws(match_id, token)) as ws:
                await _closed_with(ws, 4003)
        assert not chat_service.connections._rooms.get(match_id)


async def test_delivery_past_its_check_makes_the_block_wait_and_is_ordered_before_closure() -> None:
    async with app.router.lifespan_context(app), _Server() as srv:
        a, a_id, a_token, b, b_id, _, match_id = await _pair(srv.client, "dlv")
        order: list[str] = []
        checked, release = asyncio.Event(), asyncio.Event()
        original_broadcast = chat_service.connections.broadcast
        original_close = chat_service.close_pair_rooms

        async def held_broadcast(room, data):
            if room == match_id and data["body"] == "in flight":
                checked.set()
                await release.wait()
            await original_broadcast(room, data)
            order.append(f"frame:{data['body']}")

        async def closing(db, x, y):
            order.append("closure")
            await original_close(db, x, y)

        with (
            patch.object(chat_service.connections, "broadcast", held_broadcast),
            patch.object(chat_service, "close_pair_rooms", closing),
        ):
            async with connect(srv.ws(match_id, a_token)) as ws:
                await _registered(match_id, 1)
                send = asyncio.create_task(
                    srv.client.post(f"/matches/{match_id}/messages", json={"body": "in flight"}, headers=b)
                )
                try:
                    await asyncio.wait_for(checked.wait(), timeout=5)  # stored, checked, lock held
                    block = asyncio.create_task(srv.client.post(f"/blocks/{b_id}", headers=a))
                    await _lock_waiter(BLOCK_WAIT)
                    assert not block.done()
                finally:
                    release.set()
                frame = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                assert frame["body"] == "in flight"
                assert (await asyncio.wait_for(send, timeout=10)).status_code == 201
                assert (await asyncio.wait_for(block, timeout=10)).status_code == 201
                await _closed_with(ws, 4003)
            after = await srv.client.post(f"/matches/{match_id}/messages", json={"body": "after"}, headers=b)
            assert _restricted(after)
        assert order == ["frame:in flight", "closure"]


async def test_review_two_barrier_case_keeps_admission_and_delivery_before_the_block() -> None:
    """The review's Q01 two-barrier run, under the repaired ordering.

    Admission is held between its check and registration, and a stored
    message's delivery between its check and broadcast. The review then
    committed a block and saw the frame arrive afterwards. Now the block
    waits for both: the frame reaches the new socket before the block
    commits, and the block then closes it. Nothing arrives after the commit.
    """
    async with app.router.lifespan_context(app), _Server() as srv:
        a, a_id, a_token, b, b_id, _, match_id = await _pair(srv.client, "two")
        async with AsyncSessionLocal() as db:
            stored = await chat_service.send_message(db, UUID(match_id), UUID(b_id), "stored before block")

        order: list[str] = []
        admitted, register = asyncio.Event(), asyncio.Event()
        checked, broadcast = asyncio.Event(), asyncio.Event()
        original_connect = chat_service.connections.connect
        original_broadcast = chat_service.connections.broadcast
        original_close = chat_service.close_pair_rooms

        async def held_connect(room, ws):
            admitted.set()
            await register.wait()
            await original_connect(room, ws)
            order.append("registered")

        async def held_broadcast(room, data):
            checked.set()
            await broadcast.wait()
            await original_broadcast(room, data)
            order.append(f"frame:{data['body']}")

        async def closing(db, x, y):
            order.append("closure")
            await original_close(db, x, y)

        with (
            patch.object(chat_service.connections, "connect", held_connect),
            patch.object(chat_service.connections, "broadcast", held_broadcast),
            patch.object(chat_service, "close_pair_rooms", closing),
        ):
            opening = asyncio.create_task(_open(srv.ws(match_id, a_token)))
            async with AsyncSessionLocal() as db:
                try:
                    await asyncio.wait_for(admitted.wait(), timeout=5)
                    pushing = asyncio.create_task(chat_service.deliver_message(db, stored))
                    await asyncio.wait_for(checked.wait(), timeout=5)
                    block = asyncio.create_task(srv.client.post(f"/blocks/{b_id}", headers=a))
                    await _lock_waiter(BLOCK_WAIT)

                    register.set()
                    await _registered(match_id, 1)
                    await _lock_waiter(BLOCK_WAIT)  # still waiting: the delivery holds the lock
                    assert not block.done()
                finally:
                    register.set()
                    broadcast.set()
                assert await asyncio.wait_for(pushing, timeout=10) is True
            ws = await asyncio.wait_for(opening, timeout=10)
            try:
                frame = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                assert frame["body"] == "stored before block"
                assert (await asyncio.wait_for(block, timeout=10)).status_code == 201
                await _closed_with(ws, 4003)
            finally:
                await ws.close()
        assert order == ["registered", "frame:stored before block", "closure"]


# ─── Q02: fresh account state after the pair lock ────────────────────────────


@pytest.mark.parametrize("operation", ["send", "like", "proposal"])
async def test_actor_deactivated_while_waiting_on_the_pair_lock_is_refused(operation: str) -> None:
    async with app.router.lifespan_context(app), _Server() as srv:
        a, a_id, _, _, b_id, _, match_id = await _pair(srv.client, f"fresh-{operation}")
        path, payload, rows_sql, rows_param = {
            "send": (
                f"/matches/{match_id}/messages",
                {"body": "inactive after lock"},
                "SELECT count(*) FROM messages WHERE match_id = :p",
                match_id,
            ),
            "like": (
                "/discovery/actions",
                {"target_user_id": b_id, "sport": "golf", "action": "like"},
                "SELECT count(*) FROM discovery_actions WHERE actor_id = :p AND sport = 'golf'",
                a_id,
            ),
            "proposal": (
                "/bookings",
                _proposal(match_id),
                "SELECT count(*) FROM bookings WHERE match_id = :p",
                match_id,
            ),
        }[operation]

        async with _PairLock(a_id, b_id, "FOR NO KEY UPDATE") as lock:
            await lock.conn.execute(text("UPDATE users SET is_active = false WHERE id = :id"), {"id": a_id})
            # Authentication reads the committed (active) row; the write then waits at the pair lock.
            request = asyncio.create_task(srv.client.post(path, json=payload, headers=a))
            await _lock_waiter(CONTACT_WAIT)
            assert not request.done()
            await lock.tx.commit()

        result = await asyncio.wait_for(request, timeout=10)
        assert _restricted(result), result.text
        assert await _scalar(rows_sql, p=rows_param) == 0
        assert (
            await _scalar(
                "SELECT count(*) FROM notification_events WHERE booking_id IS NOT NULL AND user_id = :b", b=b_id
            )
            == 0
        )
        assert (await srv.client.get("/auth/me", headers=a)).status_code == 401


# ─── Q03: proposal push dispatch ─────────────────────────────────────────────


async def _proposal_with_tokens(client: AsyncClient, tag: str):
    a, a_id, _, b, b_id, _, match_id = await _pair(client, tag)
    for headers, who in ((a, "a"), (b, "b")):
        r = await client.post(
            "/notifications/token",
            json={"token": f"ExponentPushToken[{tag}-{who}-{match_id[:8]}]", "platform": "ios"},
            headers=headers,
        )
        assert r.status_code in (200, 201), r.text
    proposal = await client.post("/bookings", json=_proposal(match_id), headers=a)
    assert proposal.status_code == 201, proposal.text
    return a, a_id, b, b_id, match_id, proposal.json()["id"]


async def _event(booking_id: str, kind: str) -> NotificationEvent:
    async with AsyncSessionLocal() as db:
        return (
            await db.execute(
                select(NotificationEvent).where(
                    NotificationEvent.booking_id == UUID(booking_id), NotificationEvent.notification_type == kind
                )
            )
        ).scalar_one()


class _Provider:
    """Recording provider: no network call, only what would have been sent."""

    def __init__(self, order: list[str] | None = None) -> None:
        self.calls: list[tuple[str, str]] = []
        self.order = order

    async def __call__(self, token: str, title: str, body: str, data: dict) -> bool:
        self.calls.append((data["bookingId"], data["type"]))
        if self.order is not None:
            self.order.append(f"provider:{data['type']}")
        return True

    def types_for(self, booking_id: str) -> list[str]:
        return [kind for bid, kind in self.calls if bid == booking_id]


async def test_block_that_commits_before_dispatch_authorization_suppresses_the_proposal_push() -> None:
    async with app.router.lifespan_context(app), _Server() as srv:
        a, a_id, b, b_id, _, booking_id = await _proposal_with_tokens(srv.client, "push-first")
        provider = _Provider()
        reached, resume = asyncio.Event(), asyncio.Event()
        original_lock = safety.lock_contact

        async def held_lock(db, x, y):
            if {str(x), str(y)} == {a_id, b_id}:
                reached.set()
                await resume.wait()
            return await original_lock(db, x, y)

        with (
            patch.object(notif_service, "_send_expo_push", provider),
            patch.object(safety, "lock_contact", held_lock),
        ):
            async with AsyncSessionLocal() as db:
                job = asyncio.create_task(notif_service.process_pending_notifications(db))
                await asyncio.wait_for(reached.wait(), timeout=5)  # before the pair lock
                assert (await srv.client.post(f"/blocks/{b_id}", headers=a)).status_code == 201
                resume.set()
                await asyncio.wait_for(job, timeout=10)
        assert provider.types_for(booking_id) == []
        event = await _event(booking_id, "proposal_received")
        assert event.sent_at is None and event.failed_reason == "contact_restricted"


async def test_dispatch_that_holds_the_pair_lock_first_makes_the_block_wait_without_deadlock() -> None:
    async with app.router.lifespan_context(app), _Server() as srv:
        a, _, b, b_id, _, booking_id = await _proposal_with_tokens(srv.client, "push-wins")
        order: list[str] = []
        provider = _Provider(order)
        reached, resume = asyncio.Event(), asyncio.Event()
        original_token = notif_service._get_latest_push_token
        original_close = chat_service.close_pair_rooms

        async def held_token(db, user_id):
            if str(user_id) == b_id:
                reached.set()
                await resume.wait()
            return await original_token(db, user_id)

        async def closing(db, x, y):
            order.append("closure")
            await original_close(db, x, y)

        with (
            patch.object(notif_service, "_send_expo_push", provider),
            patch.object(notif_service, "_get_latest_push_token", held_token),
            patch.object(chat_service, "close_pair_rooms", closing),
        ):
            async with AsyncSessionLocal() as db:
                job = asyncio.create_task(notif_service.process_pending_notifications(db))
                await asyncio.wait_for(reached.wait(), timeout=5)  # token lookup runs under the pair lock
                block = asyncio.create_task(srv.client.post(f"/blocks/{b_id}", headers=a))
                await _lock_waiter(BLOCK_WAIT)
                assert not block.done()
                resume.set()
                await asyncio.wait_for(job, timeout=10)
                assert (await asyncio.wait_for(block, timeout=10)).status_code == 201
        assert provider.types_for(booking_id) == ["proposal_received"]
        assert order == ["provider:proposal_received", "closure"]
        assert (await _event(booking_id, "proposal_received")).sent_at is not None


async def test_status_notices_about_existing_bookings_still_dispatch_while_blocked() -> None:
    async with app.router.lifespan_context(app), _Server() as srv:
        a, _, b, b_id, match_id, to_decline = await _proposal_with_tokens(srv.client, "push-status")
        to_cancel = (await srv.client.post("/bookings", json=_proposal(match_id), headers=a)).json()["id"]
        assert (await srv.client.post(f"/bookings/{to_cancel}/confirm", headers=b, json={})).status_code == 200
        provider = _Provider()
        with patch.object(notif_service, "_send_expo_push", provider):
            async with AsyncSessionLocal() as db:
                await notif_service.process_pending_notifications(db)  # pre-block notices
            provider.calls.clear()

            assert (await srv.client.post(f"/blocks/{b_id}", headers=a)).status_code == 201
            assert (await srv.client.post(f"/bookings/{to_decline}/decline", headers=b, json={})).status_code == 200
            assert (await srv.client.post(f"/bookings/{to_cancel}/cancel", headers=a, json={})).status_code == 200
            async with AsyncSessionLocal() as db:
                await notif_service.process_pending_notifications(db)
        assert provider.types_for(to_decline) == ["booking_declined"]
        assert provider.types_for(to_cancel) == ["booking_cancelled"]


async def test_dispatch_that_cannot_take_the_pair_lock_in_time_leaves_the_notice_pending(monkeypatch) -> None:
    monkeypatch.setattr(notif_service, "CONTACT_LOCK_TIMEOUT", "300ms")
    async with app.router.lifespan_context(app), _Server() as srv:
        _, a_id, _, b_id, _, booking_id = await _proposal_with_tokens(srv.client, "push-timeout")
        provider = _Provider()
        with patch.object(notif_service, "_send_expo_push", provider):
            async with _PairLock(a_id, b_id, "FOR NO KEY UPDATE") as lock:
                async with AsyncSessionLocal() as db:
                    await asyncio.wait_for(notif_service.process_pending_notifications(db), timeout=10)
                event = await _event(booking_id, "proposal_received")
                assert provider.types_for(booking_id) == []
                assert event.sent_at is None and event.failed_reason is None  # deferred, not failed
                await lock.tx.rollback()
            async with AsyncSessionLocal() as db:
                await notif_service.process_pending_notifications(db)
        assert provider.types_for(booking_id) == ["proposal_received"]


async def _worker(mode: str, recipient_id: str, booking_id: str) -> asyncio.subprocess.Process:
    script = pathlib.Path(__file__).with_name("notification_worker_barrier.py")
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        str(script),
        mode,
        recipient_id,
        booking_id,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=os.environ.copy(),
        cwd=str(script.parents[1]),
    )
    line = await asyncio.wait_for(process.stdout.readline(), timeout=20)
    assert line.decode().strip() == "BARRIER", line
    return process


async def _finish(process: asyncio.subprocess.Process) -> list[str]:
    process.stdin.write(b"resume\n")
    await process.stdin.drain()
    stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=20)
    assert process.returncode == 0, stderr.decode()
    return [line.split(" ", 1)[1] for line in stdout.decode().splitlines() if line.startswith("PROVIDER_INVOCATION ")]


async def test_separate_worker_holding_the_pair_lock_makes_the_block_wait() -> None:
    async with app.router.lifespan_context(app), _Server() as srv:
        a, _, _, b_id, _, booking_id = await _proposal_with_tokens(srv.client, "worker-wins")
        process = await _worker("after-lock", b_id, booking_id)
        try:
            block = asyncio.create_task(srv.client.post(f"/blocks/{b_id}", headers=a))
            await _lock_waiter(BLOCK_WAIT)
            assert not block.done()
            assert await _finish(process) == ["proposal_received"]
            assert (await asyncio.wait_for(block, timeout=10)).status_code == 201
        finally:
            if process.returncode is None:
                process.kill()
                await process.wait()


async def test_block_committed_while_a_separate_worker_waits_before_the_lock_suppresses_the_push() -> None:
    async with app.router.lifespan_context(app), _Server() as srv:
        a, _, _, b_id, _, booking_id = await _proposal_with_tokens(srv.client, "worker-late")
        process = await _worker("before-lock", b_id, booking_id)
        try:
            assert (await srv.client.post(f"/blocks/{b_id}", headers=a)).status_code == 201
            assert await _finish(process) == []
        finally:
            if process.returncode is None:
                process.kill()
                await process.wait()
        event = await _event(booking_id, "proposal_received")
        assert event.sent_at is None and event.failed_reason == "contact_restricted"
