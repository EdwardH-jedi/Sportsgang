"""Notification event ownership on real PostgreSQL (review MA-C, CONTRACTS.md §8).

Two processors — separate worker processes, or a worker and the API's
/internal endpoint — may run at once. Each due event is claimed by a
committed conditional UPDATE (pending → delivery_unconfirmed) before the
provider is called, so the provider is invoked at most once per event and a
loser skips it. A dispatch that stops before the provider call hands the
event back to pending; once the call has started, an unrecorded outcome
leaves it unconfirmed and it is not sent again.

The review's two-worker probe paused both processors at the token lookup,
which now runs after the claim: only the owner reaches it, and the loser no
longer sees the event as due. The decisive interleaving is pinned here before
the claim instead (`before-dispatch`), where both processors hold the event
in their due list.

Run against disposable services only (see test_run_golf_v2_journey.py).
"""

from __future__ import annotations

import asyncio
import os
import pathlib
import sys
from collections.abc import AsyncGenerator
from unittest.mock import patch

import pytest
from test_contact_authority import (
    CONTACT_WAIT,
    _event,
    _lock_waiter,
    _pair,
    _proposal_with_tokens,
    _Provider,
    _Server,
)
from test_contact_restriction import _PairLock, _proposal

from app.db.session import AsyncSessionLocal, engine
from app.main import app
from app.models.notification import NotificationEvent
from app.services import notifications as notif_service


@pytest.fixture(autouse=True)
async def _fresh_pool() -> AsyncGenerator[None, None]:
    await engine.dispose(close=False)
    yield


async def _spawn(
    mode: str, recipient_id: str, booking_id: str, event_id: str = "", *, barrier: bool = True
) -> asyncio.subprocess.Process:
    """Start a worker process; with `barrier`, return once it is paused."""
    script = pathlib.Path(__file__).with_name("notification_worker_barrier.py")
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        str(script),
        mode,
        recipient_id,
        booking_id,
        event_id,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=os.environ.copy(),
        cwd=str(script.parents[1]),
    )
    process.early = []  # lines printed before the barrier (other due events it processed first)
    while barrier:
        line = (await asyncio.wait_for(process.stdout.readline(), timeout=20)).decode().strip()
        if line == "BARRIER":
            break
        if not line:
            error = (await process.stderr.read()).decode()[-2000:]
            raise AssertionError(f"worker exited before its barrier: {process.early}\n{error}")
        process.early.append(line)
    return process


async def _resume(*processes: asyncio.subprocess.Process) -> list[list[str]]:
    """Release every paused worker at once and return each one's stdout lines."""
    for process in processes:
        process.stdin.write(b"resume\n")
    await asyncio.gather(*(process.stdin.drain() for process in processes))
    results = await asyncio.gather(*(asyncio.wait_for(p.communicate(), timeout=30) for p in processes))
    lines = []
    for process, (stdout, stderr) in zip(processes, results):
        assert process.returncode == 0, stderr.decode()
        lines.append(process.early + stdout.decode().splitlines())
    return lines


async def _kill(*processes: asyncio.subprocess.Process | None) -> None:
    for process in processes:
        if process is not None and process.returncode is None:
            process.kill()
            await process.wait()


def _tagged(lines: list[str], tag: str) -> list[str]:
    return [line.split(" ", 1)[1] for line in lines if line.startswith(f"{tag} ")]


async def _pair_lock_is_free(a_id: str, b_id: str) -> None:
    async with _PairLock(a_id, b_id, "FOR NO KEY UPDATE NOWAIT") as lock:  # raises if still held
        await lock.tx.rollback()


# ─── Overlapping processors ──────────────────────────────────────────────────


@pytest.mark.parametrize("kind", ["proposal_received", "booking_confirmed"])
async def test_two_workers_paused_before_the_claim_invoke_the_provider_once(kind: str) -> None:
    async with app.router.lifespan_context(app), _Server() as srv:
        _, a_id, b, b_id, _, booking_id = await _proposal_with_tokens(srv.client, f"own2-{kind[:8]}")
        recipient = b_id
        if kind == "booking_confirmed":  # a status notice: no pair lock, ownership alone
            assert (await srv.client.post(f"/bookings/{booking_id}/confirm", headers=b, json={})).status_code == 200
            recipient = a_id
        event_id = str((await _event(booking_id, kind)).id)
        first = second = None
        try:
            first = await _spawn("before-dispatch", recipient, booking_id, event_id)
            second = await _spawn("before-dispatch", recipient, booking_id, event_id)  # both hold it as due
            one, two = await _resume(first, second)
        finally:
            await _kill(first, second)
        sent = [k for k in _tagged(one, "PROVIDER_INVOCATION") + _tagged(two, "PROVIDER_INVOCATION") if k == kind]
        assert sent == [kind]
        assert sorted(_tagged(one, "OUTCOME") + _tagged(two, "OUTCOME")) == ["sent", "skipped"]
        event = await _event(booking_id, kind)
        assert event.sent_at is not None and event.failed_reason is None


async def test_internal_endpoint_skips_the_event_a_worker_owns_and_sends_the_rest_once() -> None:
    async with app.router.lifespan_context(app), _Server() as srv:
        _, _, _, held_recipient, _, held = await _proposal_with_tokens(srv.client, "own-held")
        _, _, b2, _, _, other = await _proposal_with_tokens(srv.client, "own-batch")
        assert (await srv.client.post(f"/bookings/{other}/confirm", headers=b2, json={})).status_code == 200
        provider = _Provider()
        worker = None
        try:
            worker = await _spawn("after-lock", held_recipient, held)  # owns `held`, paused under its pair lock
            with patch.object(notif_service, "_send_expo_push", provider):
                r = await asyncio.wait_for(srv.client.post("/internal/process-notifications"), timeout=5)
            assert r.status_code == 200, r.text
            assert provider.types_for(held) == []
            assert sorted(provider.types_for(other)) == ["booking_confirmed", "proposal_received"]
            (lines,) = await _resume(worker)
        finally:
            await _kill(worker)
        assert _tagged(lines, "PROVIDER_INVOCATION") == ["proposal_received"]
        assert [line for line in _tagged(lines, "OTHER_INVOCATION") if line.endswith(other)] == []
        for booking_id, kind in (
            (held, "proposal_received"),
            (other, "proposal_received"),
            (other, "booking_confirmed"),
        ):
            assert (await _event(booking_id, kind)).sent_at is not None


async def test_worker_skips_the_event_the_internal_endpoint_owns() -> None:
    async with app.router.lifespan_context(app), _Server() as srv:
        _, _, _, b_id, _, booking_id = await _proposal_with_tokens(srv.client, "own-endpoint")
        provider = _Provider()
        reached, resume = asyncio.Event(), asyncio.Event()
        original_token = notif_service._get_latest_push_token

        async def held_token(db, user_id):
            if str(user_id) == b_id:
                reached.set()
                await resume.wait()
            return await original_token(db, user_id)

        worker = None
        with (
            patch.object(notif_service, "_send_expo_push", provider),
            patch.object(notif_service, "_get_latest_push_token", held_token),
        ):
            endpoint = asyncio.create_task(srv.client.post("/internal/process-notifications"))
            try:
                await asyncio.wait_for(reached.wait(), timeout=5)  # the endpoint owns the event
                worker = await _spawn("run", b_id, booking_id, barrier=False)
                stdout, stderr = await asyncio.wait_for(worker.communicate(), timeout=30)
                assert worker.returncode == 0, stderr.decode()
            finally:
                resume.set()
                await _kill(worker)
            assert (await asyncio.wait_for(endpoint, timeout=10)).status_code == 200
        assert _tagged(stdout.decode().splitlines(), "PROVIDER_INVOCATION") == []
        assert provider.types_for(booking_id) == ["proposal_received"]


async def test_processor_with_an_old_due_list_and_identity_map_skips_a_settled_event() -> None:
    async with app.router.lifespan_context(app), _Server() as srv:
        _, _, _, _, _, booking_id = await _proposal_with_tokens(srv.client, "own-stale")
        event_id = (await _event(booking_id, "proposal_received")).id
        provider = _Provider()
        original_dispatch = notif_service._dispatch
        intercepted = False

        async def settled_meanwhile(db, event, now):
            nonlocal intercepted
            if not intercepted and getattr(event, "id", event) == event_id:
                intercepted = True
                stale = await db.get(NotificationEvent, event_id)  # an unsettled copy in this session
                assert stale.sent_at is None
                async with AsyncSessionLocal() as other:
                    await notif_service.process_pending_notifications(other)  # another processor sends it
            return await original_dispatch(db, event, now)

        with (
            patch.object(notif_service, "_send_expo_push", provider),
            patch.object(notif_service, "_dispatch", settled_meanwhile),
        ):
            async with AsyncSessionLocal() as db:
                await notif_service.process_pending_notifications(db)
        assert intercepted
        assert provider.types_for(booking_id) == ["proposal_received"]
        assert (await _event(booking_id, "proposal_received")).sent_at is not None


# ─── Ownership release and the unconfirmed state ─────────────────────────────


async def test_cancel_while_waiting_for_the_pair_lock_hands_the_event_back() -> None:
    async with app.router.lifespan_context(app), _Server() as srv:
        _, a_id, _, b_id, _, booking_id = await _proposal_with_tokens(srv.client, "own-cancel-wait")
        provider = _Provider()
        with patch.object(notif_service, "_send_expo_push", provider):
            async with _PairLock(a_id, b_id, "FOR NO KEY UPDATE") as lock:
                async with AsyncSessionLocal() as db:
                    job = asyncio.create_task(notif_service.process_pending_notifications(db))
                    await _lock_waiter(CONTACT_WAIT)
                    job.cancel()
                    with pytest.raises(asyncio.CancelledError):
                        await job
                event = await _event(booking_id, "proposal_received")
                assert event.sent_at is None and event.failed_reason is None  # pending again
                await lock.tx.rollback()
            async with AsyncSessionLocal() as db:
                await notif_service.process_pending_notifications(db)
        assert provider.types_for(booking_id) == ["proposal_received"]


async def test_exception_before_the_provider_call_hands_the_event_back_and_releases_the_pair() -> None:
    async with app.router.lifespan_context(app), _Server() as srv:
        _, a_id, _, b_id, _, booking_id = await _proposal_with_tokens(srv.client, "own-raise")
        provider = _Provider()
        original_token = notif_service._get_latest_push_token
        raised: list[str] = []

        async def broken_token(db, user_id):
            if str(user_id) == b_id:
                raised.append(b_id)
                raise RuntimeError("injected failure under the pair lock")
            return await original_token(db, user_id)

        with patch.object(notif_service, "_send_expo_push", provider):
            async with AsyncSessionLocal() as db:
                with patch.object(notif_service, "_get_latest_push_token", broken_token):
                    with pytest.raises(RuntimeError, match="injected"):
                        await notif_service.process_pending_notifications(db)
                assert raised == [b_id]
                await _pair_lock_is_free(a_id, b_id)  # released before the error left the processor
                event = await _event(booking_id, "proposal_received")
                assert event.sent_at is None and event.failed_reason is None
            async with AsyncSessionLocal() as db:
                await notif_service.process_pending_notifications(db)
        assert provider.types_for(booking_id) == ["proposal_received"]


@pytest.mark.parametrize("interruption", ["cancel", "provider-timeout"])
async def test_interrupted_provider_call_stays_unconfirmed_and_is_not_resent(interruption: str, monkeypatch) -> None:
    monkeypatch.setattr(notif_service, "PROVIDER_TIMEOUT_SECONDS", 0.5)
    async with app.router.lifespan_context(app), _Server() as srv:
        _, a_id, _, b_id, _, booking_id = await _proposal_with_tokens(srv.client, f"own-{interruption}")
        calls: list[str] = []
        entered = asyncio.Event()

        async def hanging(token, title, body, data):
            if data["bookingId"] == booking_id:
                calls.append(data["type"])
                entered.set()
                await asyncio.Event().wait()
            return True

        with patch.object(notif_service, "_send_expo_push", hanging):
            async with AsyncSessionLocal() as db:
                job = asyncio.create_task(notif_service.process_pending_notifications(db))
                await asyncio.wait_for(entered.wait(), timeout=10)
                if interruption == "cancel":
                    job.cancel()
                    with pytest.raises(asyncio.CancelledError):
                        await job
                else:
                    await asyncio.wait_for(job, timeout=5)
            await _pair_lock_is_free(a_id, b_id)
            async with AsyncSessionLocal() as db:
                await asyncio.wait_for(notif_service.process_pending_notifications(db), timeout=10)
        assert calls == ["proposal_received"]  # the provider may have accepted it: not called again
        event = await _event(booking_id, "proposal_received")
        assert event.sent_at is None and event.failed_reason == notif_service.UNCONFIRMED


async def test_provider_success_then_failed_commit_stays_unconfirmed_and_is_not_resent() -> None:
    """Observation (review item 5): ambiguous, not exactly-once — the notice may have been delivered.

    The review's probe failed every commit, which now stops the cycle before
    any dispatch; this one fails only the commit that would record the send.
    """
    async with app.router.lifespan_context(app), _Server() as srv:
        _, _, _, _, _, booking_id = await _proposal_with_tokens(srv.client, "own-commit")
        provider = _Provider()
        with patch.object(notif_service, "_send_expo_push", provider):
            async with AsyncSessionLocal() as db:
                original_commit = db.commit
                injected: list[bool] = []

                async def commit() -> None:
                    if provider.types_for(booking_id) and not injected:
                        injected.append(True)
                        raise RuntimeError("injected commit failure after provider success")
                    await original_commit()

                with patch.object(db, "commit", commit):
                    with pytest.raises(RuntimeError, match="injected"):
                        await notif_service.process_pending_notifications(db)
                await db.rollback()
            async with AsyncSessionLocal() as db:
                await notif_service.process_pending_notifications(db)
        assert provider.types_for(booking_id) == ["proposal_received"]
        event = await _event(booking_id, "proposal_received")
        assert event.sent_at is None and event.failed_reason == notif_service.UNCONFIRMED


async def test_event_without_a_push_token_stays_pending_until_one_is_registered() -> None:
    async with app.router.lifespan_context(app), _Server() as srv:
        a, _, _, b, _, _, match_id = await _pair(srv.client, "own-notoken")
        proposal = await srv.client.post("/bookings", json=_proposal(match_id), headers=a)
        assert proposal.status_code == 201, proposal.text
        booking_id = proposal.json()["id"]
        provider = _Provider()
        with patch.object(notif_service, "_send_expo_push", provider):
            async with AsyncSessionLocal() as db:
                await notif_service.process_pending_notifications(db)
            event = await _event(booking_id, "proposal_received")
            assert event.sent_at is None and event.failed_reason is None
            assert provider.types_for(booking_id) == []
            r = await srv.client.post(
                "/notifications/token", json={"token": "ExponentPushToken[own-notoken]", "platform": "ios"}, headers=b
            )
            assert r.status_code in (200, 201), r.text
            async with AsyncSessionLocal() as db:
                await notif_service.process_pending_notifications(db)
        assert provider.types_for(booking_id) == ["proposal_received"]
