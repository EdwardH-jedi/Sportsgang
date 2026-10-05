"""Reviewer probes, no product edits. Run from apps/api against the dedicated DB.

Expected safety assertions deliberately fail on reproduced defects. Provider
calls are recorded fakes; PostgreSQL, HTTP/auth, locks and worker IPC are real.
"""
import asyncio
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import time
from unittest.mock import patch
from uuid import UUID

sys.path.insert(0, str(Path.cwd()))
sys.path.insert(0, str(Path.cwd() / 'tests_integration'))
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from app.main import app
from app.db.session import AsyncSessionLocal, engine
from app.models.notification import PushToken
from app.services import chat, events, notifications
from test_contact_restriction import _register, _match, _proposal, _PairLock
from test_contact_authority import _lock_waiter, BLOCK_WAIT
from test_event_capacity import _run_session

EV = Path(os.environ['REVIEW_EVIDENCE'])
assert ':55781/' in os.environ['POSTGRES_URL'], 'review DB only'


def evidence(name, data):
    (EV / (name + '.json')).write_text(json.dumps(data, indent=2, default=str) + '\n')


@pytest.fixture(autouse=True)
async def isolated():
    await engine.dispose(close=False)
    async with app.router.lifespan_context(app):
        yield
    chat.connections._rooms.clear()


async def pair(c, tag):
    a, ai, _ = await _register(c, tag + '-a')
    b, bi, _ = await _register(c, tag + '-b')
    m = await _match(c, a, ai, b, bi)
    return a, ai, b, bi, m


async def notice(c, tag):
    a, ai, b, bi, m = await pair(c, tag)
    async with AsyncSessionLocal() as db:
        # No other review event is due during this isolated processor probe.
        await db.execute(text("UPDATE notification_events SET failed_reason='review_fixture_suppressed' WHERE sent_at IS NULL AND failed_reason IS NULL"))
        db.add(PushToken(user_id=UUID(bi), token=f'ExponentPushToken[review-{bi}]', platform='ios'))
        await db.commit()
    r = await c.post('/bookings', headers=a, json=_proposal(m))
    assert r.status_code == 201, r.text
    return a, ai, b, bi, r.json()['id']


async def participant(eid, uid):
    async with engine.connect() as conn:
        return dict((await conn.execute(text('SELECT id,status,joined_at,left_at FROM event_participants WHERE event_id=:e AND user_id=:u'), {'e':eid,'u':uid})).mappings().one())


@pytest.mark.parametrize('skew', [-120, 120])
async def test_event_times_follow_one_clock(skew):
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as c:
        h, hi, _ = await _register(c, 'clock-host')
        u, ui, _ = await _register(c, 'clock-member')
        third, ti, _ = await _register(c, 'clock-third')
        created = await c.post('/events', headers=h, json=_run_session(capacity=2))
        assert created.status_code == 201, created.text
        eid = created.json()['id']
        assert (await c.post(f'/events/{eid}/join', headers=u)).status_code == 200
        first = await participant(eid, ui)
        class Skewed(datetime):
            @classmethod
            def now(cls, tz=None):
                return datetime.now(tz) + timedelta(seconds=skew)
        with patch.object(events, 'datetime', Skewed):
            assert (await c.post(f'/events/{eid}/leave', headers=u)).status_code == 200
            left = await participant(eid, ui)
            assert (await c.post(f'/events/{eid}/join', headers=u)).status_code == 200
            rejoined = await participant(eid, ui)
        async with engine.connect() as conn:
            dbnow = (await conn.execute(text('SELECT clock_timestamp()'))).scalar_one()
        # Capacity and row identity remain correct even when audit time is wrong.
        full = await c.post(f'/events/{eid}/join', headers=third)
        preserved = await participant(eid, ui)
        controls = first['id'] == left['id'] == rejoined['id'] == preserved['id'] and full.status_code == 422 and rejoined['status']=='joined' and rejoined['left_at'] is None
        evidence(f'event-clock-{skew}', dict(skew_seconds=skew, first=first, left=left, rejoined=rejoined, db_now=dbnow, row_reuse_and_capacity=controls, rejoin_minus_db_seconds=(rejoined['joined_at']-dbnow).total_seconds()))
        assert controls
        assert left['left_at'] >= first['joined_at'], 'leave must not precede first join'
        assert abs((rejoined['joined_at']-dbnow).total_seconds()) < 2, 'rejoin must use the same DB time provenance as first join'


async def worker(bi, bid):
    p = await asyncio.create_subprocess_exec(sys.executable, 'tests_integration/notification_worker_barrier.py', 'after-lock', bi, bid, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    first = await asyncio.wait_for(p.stdout.readline(), 10)
    assert first.strip() == b'BARRIER', first
    return p


async def finish_worker(p):
    p.stdin.write(b'resume\n')
    await p.stdin.drain()
    stdout, stderr = await asyncio.wait_for(p.communicate(), 10)
    assert p.returncode == 0, stderr.decode()
    return stdout.decode().splitlines()


@pytest.mark.parametrize('topology', ['two-workers', 'worker-internal-endpoint'])
async def test_concurrent_processors_claim_event_once(topology):
    procs = []
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as c:
        a, ai, b, bi, bid = await notice(c, topology)
        procs.append(await worker(bi, bid))
        api_calls = []
        try:
            if topology == 'two-workers':
                procs.append(await worker(bi, bid))
            else:
                async def provider(token, title, body, data):
                    if data['bookingId'] == bid:
                        api_calls.append(data['type'])
                    return True
                with patch.object(notifications, '_send_expo_push', provider):
                    r = await c.post('/internal/process-notifications')
                    assert r.status_code == 200, r.text
            outputs = [await finish_worker(p) for p in procs]
            invocations = len(api_calls) + sum(sum(s.startswith('PROVIDER_INVOCATION') for s in lines) for lines in outputs)
            async with engine.connect() as conn:
                row = dict((await conn.execute(text('SELECT sent_at,failed_reason FROM notification_events WHERE booking_id=:b'), {'b':bid})).mappings().one())
            evidence('notification-' + topology, dict(invocations=invocations, api_calls=api_calls, worker_outputs=outputs, row=row))
            assert invocations == 1, 'processors must claim one pending event before invoking the provider'
        finally:
            for p in procs:
                if p.returncode is None:
                    p.kill()
                    await p.wait()


async def test_provider_success_commit_failure_is_ambiguous():
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as c:
        a, ai, b, bi, bid = await notice(c, 'commit-failure')
        calls = []
        async def provider(token, title, body, data):
            calls.append(data['bookingId'])
            return True
        async def broken_commit():
            raise RuntimeError('reviewer injected database commit failure after provider success')
        with patch.object(notifications, '_send_expo_push', provider):
            async with AsyncSessionLocal() as db:
                with patch.object(db, 'commit', broken_commit):
                    with pytest.raises(RuntimeError):
                        await notifications.process_pending_notifications(db)
                await db.rollback()
            async with AsyncSessionLocal() as db:
                result = await notifications.process_pending_notifications(db)
        evidence('provider-success-commit-failure', dict(calls=calls, retry_processed=result.processed, ambiguity=True))
        assert calls == [bid, bid]  # observation, not an exactly-once acceptance claim


class Socket:
    def __init__(self, *, slow=False, hang_close=False, fail_close=False):
        self.slow, self.hang_close, self.fail_close = slow, hang_close, fail_close
        self.send_entered = asyncio.Event()
        self.close_entered = asyncio.Event()
        self.closed = False
    async def send_json(self, data):
        self.send_entered.set()
        if self.slow:
            await asyncio.Event().wait()
    async def close(self, code):
        self.close_entered.set()
        if self.fail_close:
            raise RuntimeError('recorded closure failure')
        if self.hang_close:
            await asyncio.Event().wait()
        self.closed = True


async def test_broadcast_total_bound_does_not_scale_per_socket():
    trials = []
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as c:
        for n in [1,3]:
            a, ai, b, bi, m = await pair(c, 'slow')
            async with AsyncSessionLocal() as db:
                msg = await chat.send_message(db, UUID(m), UUID(ai), 'slow sockets')
                sockets = [Socket(slow=True, fail_close=(i==0)) for i in range(n)]
                chat.connections._rooms[m] = sockets
                t = time.monotonic()
                delivery = asyncio.create_task(chat.deliver_message(db, msg))
                await sockets[0].send_entered.wait()
                block = asyncio.create_task(c.post(f'/blocks/{bi}', headers=a))
                await _lock_waiter(BLOCK_WAIT)
                assert await delivery
                r = await block
                trials.append(dict(connections=n, seconds=time.monotonic()-t, block_status=r.status_code, registry_count=len(chat.connections._rooms.get(m, []))))
        evidence('broadcast-total-time', dict(timeout_seconds=chat.WS_SEND_TIMEOUT_SECONDS, trials=trials, transport='synthetic backpressure at send_json boundary; real PostgreSQL locks and HTTP block'))
        assert all(t['block_status']==201 and t['registry_count']==0 for t in trials)
        assert trials[1]['seconds'] <= chat.WS_SEND_TIMEOUT_SECONDS + 2, 'three sockets must share one total delivery deadline'


async def test_stuck_close_does_not_prevent_other_socket_closure():
    manager = chat.ConnectionManager()
    stuck, other = Socket(hang_close=True), Socket()
    manager._rooms['review'] = [stuck, other]
    task = asyncio.create_task(manager.close_room('review', 4003))
    await stuck.close_entered.wait()
    try:
        await asyncio.wait_for(asyncio.shield(task), .3)
        timed_out = False
    except TimeoutError:
        timed_out = True
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    evidence('socket-close-stuck', dict(first_close_hung=timed_out, second_closed=other.closed, registry=manager._rooms))
    assert other.closed, 'a stuck close must not strand later registered sockets'


@pytest.mark.parametrize('failure', ['cancel', 'exception'])
async def test_delivery_lock_cleanup(failure):
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as c:
        a, ai, b, bi, m = await pair(c, 'cleanup')
        entered = asyncio.Event()
        async def held(room, data):
            entered.set()
            if failure == 'exception':
                raise RuntimeError('review broadcast exception')
            await asyncio.Event().wait()
        async with AsyncSessionLocal() as db:
            msg = await chat.send_message(db, UUID(m), UUID(ai), 'cleanup')
            with patch.object(chat.connections, 'broadcast', held):
                task = asyncio.create_task(chat.deliver_message(db, msg))
                await entered.wait()
                if failure == 'cancel':
                    task.cancel()
                    with pytest.raises(asyncio.CancelledError):
                        await task
                else:
                    with pytest.raises(RuntimeError):
                        await task
            # Same live session: rollback must have released its pair lock.
            r = await asyncio.wait_for(c.post(f'/blocks/{bi}', headers=a), 1)
            assert r.status_code == 201


@pytest.mark.parametrize('failure', ['cancel', 'exception', 'provider-timeout'])
async def test_notification_lock_cleanup(failure):
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as c:
        a, ai, b, bi, bid = await notice(c, 'notice-cleanup')
        entered = asyncio.Event()
        async def provider(*args):
            entered.set()
            if failure == 'exception':
                raise RuntimeError('review provider exception')
            await asyncio.Event().wait()
        with patch.object(notifications, '_send_expo_push', provider), patch.object(notifications, 'PROVIDER_TIMEOUT_SECONDS', .1):
            async def job():
                async with AsyncSessionLocal() as db:
                    return await notifications.process_pending_notifications(db)
            task = asyncio.create_task(job())
            await entered.wait()
            if failure == 'cancel':
                task.cancel()
                with pytest.raises(asyncio.CancelledError):
                    await task
            elif failure == 'exception':
                with pytest.raises(RuntimeError):
                    await task
            else:
                result = await task
                assert result.failed == 1
        r = await asyncio.wait_for(c.post(f'/blocks/{bi}', headers=a), 1)
        assert r.status_code == 201
