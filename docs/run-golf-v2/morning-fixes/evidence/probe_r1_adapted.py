"""Overnight review probe_r1.py, adapted to the repaired ordering (Q01–Q03).

Unchanged from the review: `matrix` (71 policy/history/commitment checks) and
`fresh_account` (Q02: actor deactivated while waiting on the pair lock).

Adapted, and why: the review paused an admission, a delivery or a push
between its restriction check and its effect, then committed a block, then
released the effect. After the repair the effect holds the pair lock across
that gap, so the block cannot commit there — it waits. Each adapted case
therefore starts the block as a task, observes it waiting on the lock in
pg_stat_activity, releases the barrier, and asserts what the safety rule
requires: the effect completes before the block commits, and nothing is
admitted, delivered or pushed afterwards. A "block first" variant of each push
case pauses *before* the lock instead and expects no provider invocation.

Run from apps/api with a disposable database (never the human QA stack):
    REVIEW_EVIDENCE=<dir> POSTGRES_URL=... REDIS_URL=... SECRET_KEY=... APP_ENV=local \
        .venv/bin/python <this file>
"""
import asyncio, copy, json, os, pathlib, sys
from uuid import UUID
from unittest.mock import patch

from sqlalchemy import text
from httpx import AsyncClient, ASGITransport

sys.path.insert(0, str(pathlib.Path.cwd()))
from tests_integration.test_contact_restriction import _register, _match, _proposal, _PairLock, _scalar, _free_port
from app.main import app
from app.db.session import engine, AsyncSessionLocal
from app.services import chat, safety, notifications
from app.models.notification import PushToken
import uvicorn
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed

out = []


def record(name, expected, actual):
    out.append(dict(case=name, expected=copy.deepcopy(expected), actual=copy.deepcopy(actual),
                    verdict="PASS" if actual == expected else "FAIL"))
    print(name, out[-1]["verdict"], actual, flush=True)


async def pair(c):
    a, ai, at = await _register(c, "morning-a")
    b, bi, bt = await _register(c, "morning-b")
    m = await _match(c, a, ai, b, bi)
    return a, ai, at, b, bi, bt, m


async def block_waiting(timeout=5.0):
    """True once a backend waits on a lock in the block's FOR NO KEY UPDATE statement."""
    for _ in range(int(timeout / 0.02)):
        async with engine.connect() as conn:
            n = (await conn.execute(text(
                "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() "
                "AND wait_event_type='Lock' AND query ILIKE '%FOR NO KEY UPDATE%'"))).scalar_one()
        if n:
            return True
        await asyncio.sleep(0.02)
    return False


async def matrix(c):  # unchanged from the review
    for direction in [0, 1]:
        a, ai, at, b, bi, bt, m = await pair(c)
        await c.post(f"/matches/{m}/messages", headers=a, json={"body": "retained history"})
        booking = await c.post("/bookings", headers=a, json=_proposal(m)); bid = booking.json()["id"]
        confirmed = await c.post("/bookings", headers=a, json=_proposal(m)); cid = confirmed.json()["id"]; await c.post(f"/bookings/{cid}/confirm", headers=b, json={})
        cancelled = await c.post("/bookings", headers=a, json=_proposal(m)); canid = cancelled.json()["id"]; await c.post(f"/bookings/{canid}/confirm", headers=b, json={})
        no_show = await c.post("/bookings", headers=a, json=_proposal(m)); nid = no_show.json()["id"]; await c.post(f"/bookings/{nid}/confirm", headers=b, json={})
        challenger = await c.post("/challenges", headers=a, json={"opponent_user_id": bi, "sport": "running", "area": "Bondi"}); hid = challenger.json().get("id")
        blocker, target = (a, bi) if direction == 0 else (b, ai)
        record(f"d{direction}:block", 201, (await c.post(f"/blocks/{target}", headers=blocker)).status_code)
        for tag, h, other in [("a", a, bi), ("b", b, ai)]:
            requests = [("get", f"/matches/{m}/messages", None), ("post", f"/matches/{m}/messages", {"body": "refuse"}), ("post", "/bookings", _proposal(m)), ("post", "/challenges", {"opponent_user_id": other, "sport": "running", "area": "Bondi"})] + [("post", "/discovery/actions", {"target_user_id": other, "sport": "golf", "action": action}) for action in ["like", "pass", "save"]]
            for method, path, payload in requests:
                r = await getattr(c, method)(path, headers=h, **({"json": payload} if payload is not None else {}))
                record(f'd{direction}:{tag}:{method}:{path}:{payload.get("action","") if payload else ""}', 403, r.status_code)
            r = await c.get("/matches", headers=h); record(f"d{direction}:{tag}:match-total", 0, r.json()["total"])
            record(f"d{direction}:{tag}:booking-detail", 200, (await c.get(f"/bookings/{bid}", headers=h)).status_code)
            record(f"d{direction}:{tag}:booking-list", 200, (await c.get("/bookings", headers=h)).status_code)
            record(f"d{direction}:{tag}:report", 201, (await c.post("/reports", headers=h, json={"target_type": "user", "reported_user_id": other, "reason": "harassment"})).status_code)
        record(f"d{direction}:confirm", 403, (await c.post(f"/bookings/{bid}/confirm", headers=b, json={})).status_code)
        if hid: record(f"d{direction}:challenge-accept", 403, (await c.post(f"/challenges/{hid}/accept", headers=b, json={})).status_code)
        else: record(f"d{direction}:challenge-fixture", 201, challenger.status_code)
        record(f"d{direction}:decline", 200, (await c.post(f"/bookings/{bid}/decline", headers=b, json={})).status_code)
        record(f"d{direction}:complete", 200, (await c.post(f"/bookings/{cid}/complete", headers=a, json={})).status_code)
        record(f"d{direction}:cancel-confirmed", 200, (await c.post(f"/bookings/{canid}/cancel", headers=b, json={})).status_code)
        record(f"d{direction}:no-show", 200, (await c.post(f"/bookings/{nid}/no-show", headers=b, json={})).status_code)
        record(f"d{direction}:retained-message-row", 1, await _scalar("SELECT count(*) FROM messages WHERE match_id=:m", m=m))
        record(f"d{direction}:unblock", 204, (await c.delete(f"/blocks/{target}", headers=blocker)).status_code)
        r = await c.get(f"/matches/{m}/messages", headers=b); record(f"d{direction}:restored-history", 1, r.json()["total"])
    a, ai, at, b, bi, bt, m = await pair(c)
    await c.post(f"/matches/{m}/messages", headers=b, json={"body": "delete fixture history"}); await c.post(f"/blocks/{bi}", headers=a)
    record("blocked account deletion", 204, (await c.delete("/auth/me", headers=a)).status_code)
    record("deleted token auth", 401, (await c.get("/auth/me", headers=a)).status_code)
    record("deletion cascades retained message", 0, await _scalar("SELECT count(*) FROM messages WHERE match_id=:m", m=m))


async def serve():
    port = _free_port()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, lifespan="off", log_level="warning"))
    task = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.02)
    return port, server, task


async def admission(c):  # ADAPTED: block waits for the admission holding its check
    a, ai, at, b, bi, bt, m = await pair(c)
    reached = asyncio.Event(); resume = asyncio.Event(); orig = chat.connections.connect

    async def delayed(room, ws):
        if room == m: reached.set(); await resume.wait()
        await orig(room, ws)

    port, server, serving = await serve()
    try:
        async def open_socket(): return await connect(f"ws://127.0.0.1:{port}/matches/{m}/ws?token={at}")
        with patch.object(chat.connections, "connect", delayed):
            opening = asyncio.create_task(open_socket()); await asyncio.wait_for(reached.wait(), 5)
            block = asyncio.create_task(c.post(f"/blocks/{bi}", headers=a))
            waited = await block_waiting(); record("admission held after check -> block waits on pair lock", True, waited and not block.done())
            resume.set(); ws = await asyncio.wait_for(opening, 5)
            record("block after admission completes", 201, (await asyncio.wait_for(block, 10)).status_code)
            try:
                await asyncio.wait_for(ws.recv(), 3); actual = "unexpected frame"
            except asyncio.TimeoutError: actual = "remains connected after block"
            except ConnectionClosed as e: actual = f"closed {e.rcvd.code}"
            record("admission-check -> (block waits) -> registration -> closure", "closed 4003", actual); await ws.close()
    finally:
        server.should_exit = True; await asyncio.wait_for(serving, 10)


async def delivery(c):  # ADAPTED: review's two-barrier run; frame precedes the block commit
    a, ai, at, b, bi, bt, m = await pair(c)
    async with AsyncSessionLocal() as db: msg = await chat.send_message(db, UUID(m), UUID(bi), "stored before block")
    admitted = asyncio.Event(); register = asyncio.Event(); checked = asyncio.Event(); broadcast = asyncio.Event(); order = []
    original_connect = chat.connections.connect; original_broadcast = chat.connections.broadcast; original_close = chat.close_pair_rooms

    async def delayed_connect(room, ws): admitted.set(); await register.wait(); await original_connect(room, ws); order.append("registered")
    async def delayed_broadcast(room, data): checked.set(); await broadcast.wait(); await original_broadcast(room, data); order.append("frame sent")
    async def closing(db, x, y): order.append("block closure"); await original_close(db, x, y)

    port, server, serving = await serve()
    try:
        async def open_socket(): return await connect(f"ws://127.0.0.1:{port}/matches/{m}/ws?token={at}")
        with patch.object(chat.connections, "connect", delayed_connect), patch.object(chat.connections, "broadcast", delayed_broadcast), patch.object(chat, "close_pair_rooms", closing):
            opening = asyncio.create_task(open_socket()); await asyncio.wait_for(admitted.wait(), 5)
            async with AsyncSessionLocal() as db:
                pushing = asyncio.create_task(chat.deliver_message(db, msg)); await asyncio.wait_for(checked.wait(), 5)
                block = asyncio.create_task(c.post(f"/blocks/{bi}", headers=a))
                record("admission + delivery held -> block waits on pair lock", True, await block_waiting() and not block.done())
                register.set(); ws = await asyncio.wait_for(opening, 5); broadcast.set(); await pushing
            frames = []
            try:
                while True: frames.append(json.loads(await asyncio.wait_for(ws.recv(), 3))["body"])
            except ConnectionClosed as e: frames.append(f"closed {e.rcvd.code}")
            except asyncio.TimeoutError: frames.append("remains connected")
            record("block after delivery completes", 201, (await asyncio.wait_for(block, 10)).status_code)
            record("wire: pre-commit frame, then closure", ["stored before block", "closed 4003"], frames)
            record("order: registration, frame, then block closure", ["registered", "frame sent", "block closure"], order)
            await ws.close()
    finally:
        server.should_exit = True; await asyncio.wait_for(serving, 10)


async def push_case(c, before_lock):
    a, ai, at, b, bi, bt, m = await pair(c)
    async with AsyncSessionLocal() as db:
        db.add(PushToken(user_id=UUID(bi), token=f"ExponentPushToken[morning-{bi}]", platform="ios")); await db.commit()
    bid = (await c.post("/bookings", headers=a, json=_proposal(m))).json()["id"]
    reached = asyncio.Event(); resume = asyncio.Event(); delivered = []
    original_token = notifications._get_latest_push_token; original_lock = safety.lock_contact

    async def delayed_token(db, recipient):
        if not before_lock and str(recipient) == bi: reached.set(); await resume.wait()
        return await original_token(db, recipient)

    async def delayed_lock(db, x, y):
        if before_lock and {str(x), str(y)} == {ai, bi}: reached.set(); await resume.wait()
        return await original_lock(db, x, y)

    async def transport(token, title, body, data):
        if data["bookingId"] == bid: delivered.append(data["type"])
        return True

    with patch.object(notifications, "_send_expo_push", transport), patch.object(notifications, "_get_latest_push_token", delayed_token), patch.object(safety, "lock_contact", delayed_lock):
        async with AsyncSessionLocal() as db:
            job = asyncio.create_task(notifications.process_pending_notifications(db)); await asyncio.wait_for(reached.wait(), 5)
            block = asyncio.create_task(c.post(f"/blocks/{bi}", headers=a))
            if before_lock:
                record("block first: block commits while dispatcher waits before the lock", 201, (await asyncio.wait_for(block, 10)).status_code)
                resume.set(); await job
                record("block first: proposal push invocations", [], delivered)
            else:
                record("dispatch first: block waits on pair lock during token lookup", True, await block_waiting() and not block.done())
                resume.set(); await job
                record("dispatch first: proposal pushed before the block commits", ["proposal_received"], delivered)
                record("dispatch first: block then completes (no deadlock)", 201, (await asyncio.wait_for(block, 10)).status_code)
    if before_lock:
        await c.post(f"/bookings/{bid}/cancel", headers=a, json={}); delivered.clear()
        with patch.object(notifications, "_send_expo_push", transport):
            async with AsyncSessionLocal() as db: await notifications.process_pending_notifications(db)
        record("existing commitment cancellation notification", ["booking_cancelled"], delivered)


async def queued_push(c):  # ADAPTED: both orderings
    await push_case(c, before_lock=True)
    await push_case(c, before_lock=False)


async def fresh_account(c):  # unchanged from the review
    for operation in ["send", "like", "proposal"]:
        a, ai, at, b, bi, bt, m = await pair(c); reached = asyncio.Event(); pidbox = []; orig = safety._lock_pair

        async def observed(db, x, y, **kw):
            pidbox.append((await db.execute(text("SELECT pg_backend_pid()"))).scalar_one()); reached.set(); return await orig(db, x, y, **kw)

        async with _PairLock(ai, bi, "FOR NO KEY UPDATE") as lock:
            await lock.conn.execute(text("UPDATE users SET is_active=false WHERE id=:id"), {"id": ai})
            with patch.object(safety, "_lock_pair", observed):
                path, payload = (f"/matches/{m}/messages", {"body": "inactive after lock"}) if operation == "send" else ("/discovery/actions", {"target_user_id": bi, "sport": "golf", "action": "like"}) if operation == "like" else ("/bookings", _proposal(m))
                task = asyncio.create_task(c.post(path, headers=a, json=payload)); await asyncio.wait_for(reached.wait(), 5)
                for _ in range(100):
                    async with engine.connect() as conn: waiting = (await conn.execute(text("SELECT wait_event_type='Lock' FROM pg_stat_activity WHERE pid=:pid"), {"pid": pidbox[0]})).scalar()
                    if waiting: break
                    await asyncio.sleep(.02)
                assert waiting, "must observe real PostgreSQL lock wait"; await lock.tx.commit(); r = await asyncio.wait_for(task, 8)
                record(f"fresh actor state after pair lock:{operation}", 403, r.status_code)
                sql = {"send": "SELECT count(*) FROM messages WHERE match_id=:m", "like": "SELECT count(*) FROM discovery_actions WHERE actor_id=:m AND sport='golf'", "proposal": "SELECT count(*) FROM bookings WHERE match_id=:m"}[operation]
                record(f"inactive actor prohibited persisted rows:{operation}", 0, await _scalar(sql, m=ai if operation == "like" else m))
                record(f"deactivated actor next HTTP auth:{operation}", 401, (await c.get("/auth/me", headers=a)).status_code)


async def notification_worker(mode, user_id, booking_id):
    original_token = notifications._get_latest_push_token; original_lock = safety.lock_contact

    async def pause():
        print("BARRIER", flush=True); await asyncio.to_thread(sys.stdin.readline)

    async def lookup(db, user):
        if mode == "after-lock" and str(user) == user_id: await pause()
        return await original_token(db, user)

    async def lock(db, x, y):
        if mode == "before-lock" and user_id in (str(x), str(y)): await pause()
        return await original_lock(db, x, y)

    async def transport(token, title, body, data):
        if data["bookingId"] == booking_id: print("PROVIDER_INVOCATION " + data["type"], flush=True)
        return True

    with patch.object(notifications, "_get_latest_push_token", lookup), patch.object(safety, "lock_contact", lock), patch.object(notifications, "_send_expo_push", transport):
        async with AsyncSessionLocal() as db: await notifications.process_pending_notifications(db)
    await engine.dispose()


async def cross_process_push(c):  # ADAPTED: separate worker process, both orderings
    for mode in ["before-lock", "after-lock"]:
        a, ai, at, b, bi, bt, m = await pair(c)
        async with AsyncSessionLocal() as db:
            db.add(PushToken(user_id=UUID(bi), token=f"ExponentPushToken[worker-{mode}-{bi}]", platform="ios")); await db.commit()
        bid = (await c.post("/bookings", headers=a, json=_proposal(m))).json()["id"]
        process = await asyncio.create_subprocess_exec(sys.executable, __file__, "worker", mode, bi, bid, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            line = await asyncio.wait_for(process.stdout.readline(), 15); assert line.decode().strip() == "BARRIER", line
            block = asyncio.create_task(c.post(f"/blocks/{bi}", headers=a))
            if mode == "before-lock":
                record("worker before lock: API block commits", 201, (await asyncio.wait_for(block, 10)).status_code)
            else:
                record("worker after lock: API block waits on pair lock", True, await block_waiting() and not block.done())
            process.stdin.write(b"resume\n"); await process.stdin.drain(); stdout, stderr = await asyncio.wait_for(process.communicate(), 15)
            assert process.returncode == 0, stderr.decode()
            actual = [l.split(" ", 1)[1] for l in stdout.decode().splitlines() if l.startswith("PROVIDER_INVOCATION ")]
            if mode == "before-lock":
                record("separate worker, block first: provider invocations", [], actual)
            else:
                record("separate worker, dispatch first: provider invoked before block commit", ["proposal_received"], actual)
                record("separate worker, dispatch first: block completes (no deadlock)", 201, (await asyncio.wait_for(block, 10)).status_code)
        finally:
            if process.returncode is None: process.kill(); await process.wait()


async def main():
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            for name, fn in [("matrix", matrix), ("admission", admission), ("delivery", delivery), ("queued-push", queued_push), ("fresh-account", fresh_account), ("cross-process-push", cross_process_push)]:
                try: await fn(c)
                except Exception as e: out.append(dict(case=name, verdict="HARNESS_ERROR", error=repr(e))); print(name, repr(e), flush=True)
    path = pathlib.Path(os.environ["REVIEW_EVIDENCE"]) / "r1-adapted-results.json"; path.write_text(json.dumps(out, indent=2))
    print("RESULTS", {v: sum(x["verdict"] == v for x in out) for v in ["PASS", "FAIL", "HARNESS_ERROR"]}, flush=True)


if len(sys.argv) > 1 and sys.argv[1] == "worker": asyncio.run(notification_worker(sys.argv[2], sys.argv[3], sys.argv[4]))
else: asyncio.run(main())
