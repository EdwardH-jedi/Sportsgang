"""Group-session capacity and concurrency on real PostgreSQL + Redis.

Run after `alembic upgrade head` against disposable services, like
test_booking_journey.py. No dependency overrides: requests go through the
real app, real asyncpg sessions and PostgreSQL row locks.

Concurrency is real, not simulated: requests are issued with
asyncio.gather / create_task on the in-process ASGI app, and every request
opens its own database session, so their transactions overlap inside
PostgreSQL. `test_join_waits_on_the_event_row_lock` proves it directly: a
join issued while another connection holds `SELECT … FOR UPDATE` on the
event row stays blocked until that lock is released.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone
from random import randrange
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings
from app.db.session import engine
from app.main import app


@pytest.fixture(autouse=True)
async def _fresh_pool() -> AsyncGenerator[None, None]:
    # pytest-asyncio gives each test its own event loop; drop pooled
    # connections opened on a previous test's loop (without closing them
    # on the wrong loop) so a failure elsewhere cannot cascade here.
    await engine.dispose(close=False)
    yield


def _future(days: int = 5) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


async def _register(client: AsyncClient, tag: str) -> dict[str, str]:
    """Register a real account through /auth/register.

    The endpoint is rate-limited per client address (3/minute) and these
    scenarios need dozens of accounts, so each registration goes through a
    throwaway ASGI client with its own unique peer address — the limiter
    stays enabled and every token comes from the real auth flow.
    """
    peer = (f"10.{randrange(256)}.{randrange(256)}.{randrange(1, 255)}", randrange(1024, 65535))
    async with AsyncClient(transport=ASGITransport(app=app, client=peer), base_url="http://test") as signup:
        r = await signup.post(
            "/auth/register",
            json={"email": f"capacity-{tag}-{uuid4().hex}@example.com", "password": "integration-password-123"},
        )
    assert r.status_code == 201, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    me = await client.get("/auth/me", headers=headers)
    assert me.status_code == 200, me.text
    return headers


def _golf_round(capacity: int = 4) -> dict:
    return {
        "title": "Integration round",
        "sport": "golf",
        "mode": "casual",
        "starts_at": _future(),
        "location_text": "Moore Park Golf",
        "capacity": capacity,
        "golf_details": {"holes": 9, "tee_time_status": "planning", "beginners_welcome": True},
    }


def _run_session(capacity: int = 6) -> dict:
    return {
        "title": "Integration 5k",
        "sport": "running",
        "mode": "casual",
        "starts_at": _future(),
        "location_text": "Centennial Park",
        "capacity": capacity,
        "run_details": {
            "distance_km": 5,
            "pace_mode": "target_pace",
            "pace_min_sec_per_km": 330,
            "pace_max_sec_per_km": 360,
            "group_style": "stay_together",
        },
    }


async def test_two_users_racing_for_the_last_place_never_oversubscribe() -> None:
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            host = await _register(client, "host")
            for attempt in range(5):
                created = await client.post("/events", json=_golf_round(capacity=4), headers=host)
                assert created.status_code == 201, created.text
                event_id = created.json()["id"]
                # Fill to one remaining place (host + 2 = 3 of 4).
                for i in range(2):
                    r = await client.post(f"/events/{event_id}/join", headers=await _register(client, f"f{attempt}{i}"))
                    assert r.status_code == 200, r.text

                racers = [await _register(client, f"r{attempt}{i}") for i in range(3)]
                results = await asyncio.gather(*(client.post(f"/events/{event_id}/join", headers=h) for h in racers))
                codes = sorted(r.status_code for r in results)
                assert codes == [200, 422, 422], [r.text for r in results]
                assert all(r.json()["detail"] == "Event is full" for r in results if r.status_code == 422)

                final = (await client.get(f"/events/{event_id}", headers=host)).json()
                assert final["participant_count"] == 4
                assert final["spots_left"] == 0
                assert final["status"] == "full"
                assert len(final["participants"]) == 4


async def test_duplicate_concurrent_join_by_one_user_counts_once() -> None:
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            host = await _register(client, "host")
            joiner = await _register(client, "dup")
            event_id = (await client.post("/events", json=_run_session(), headers=host)).json()["id"]
            results = await asyncio.gather(*(client.post(f"/events/{event_id}/join", headers=joiner) for _ in range(3)))
            codes = sorted(r.status_code for r in results)
            assert codes == [200, 409, 409], [r.text for r in results]
            final = (await client.get(f"/events/{event_id}", headers=host)).json()
            assert final["participant_count"] == 2


async def test_host_cancel_racing_a_join_leaves_a_consistent_state() -> None:
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            outcomes = set()
            for attempt in range(6):
                host = await _register(client, f"ch{attempt}")
                joiner = await _register(client, f"cj{attempt}")
                event_id = (await client.post("/events", json=_golf_round(), headers=host)).json()["id"]
                cancel, join = await asyncio.gather(
                    client.post(f"/events/{event_id}/cancel", headers=host),
                    client.post(f"/events/{event_id}/join", headers=joiner),
                )
                assert cancel.status_code == 200, cancel.text
                final = (await client.get(f"/events/{event_id}", headers=host)).json()
                assert final["status"] == "cancelled"
                if join.status_code == 200:
                    outcomes.add("join-then-cancel")
                    assert final["participant_count"] == 2
                else:
                    outcomes.add("cancel-then-join-rejected")
                    assert join.status_code == 422, join.text
                    assert join.json()["detail"] == "Cannot join a cancelled event"
                    assert final["participant_count"] == 1
            # Either ordering is acceptable; both must be internally consistent.
            assert outcomes


async def test_join_waits_on_the_event_row_lock() -> None:
    """Proves the join path takes PostgreSQL's row lock (and that requests
    from this harness really run concurrently with other transactions)."""
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            host = await _register(client, "lock-host")
            joiner = await _register(client, "lock-joiner")
            event_id = (await client.post("/events", json=_run_session(), headers=host)).json()["id"]

            lock_engine = create_async_engine(get_settings().async_postgres_url)
            try:
                async with lock_engine.connect() as conn:
                    tx = await conn.begin()
                    await conn.execute(text("SELECT id FROM events WHERE id = :id FOR UPDATE"), {"id": event_id})
                    join_task = asyncio.create_task(client.post(f"/events/{event_id}/join", headers=joiner))
                    await asyncio.sleep(1.0)
                    assert not join_task.done(), "join must block while another transaction holds the row lock"
                    await tx.rollback()
                result = await asyncio.wait_for(join_task, timeout=10)
                assert result.status_code == 200, result.text
                assert result.json()["participant_count"] == 2
            finally:
                await lock_engine.dispose()


async def test_running_session_journey_reaches_both_users_plans() -> None:
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            host = await _register(client, "run-host")
            runner = await _register(client, "runner")
            created = await client.post("/events", json=_run_session(), headers=host)
            assert created.status_code == 201, created.text
            event_id = created.json()["id"]
            assert created.json()["run_details"]["pace_min_sec_per_km"] == 330

            upcoming = await client.get("/events?sport=running&upcoming=true&limit=50", headers=runner)
            assert event_id in {e["id"] for e in upcoming.json()["items"]}

            joined = await client.post(f"/events/{event_id}/join", headers=runner)
            assert joined.status_code == 200, joined.text
            for headers in (host, runner):
                mine = await client.get("/events?mine=true&limit=50", headers=headers)
                assert event_id in {e["id"] for e in mine.json()["items"]}

            left = await client.post(f"/events/{event_id}/leave", headers=runner)
            assert left.status_code == 200, left.text
            runner_mine = await client.get("/events?mine=true&limit=50", headers=runner)
            assert event_id not in {e["id"] for e in runner_mine.json()["items"]}
            host_mine = {
                e["id"]: e for e in (await client.get("/events?mine=true&limit=50", headers=host)).json()["items"]
            }
            assert host_mine[event_id]["participant_count"] == 1
