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


# ---------------------------------------------------------------------------
# Leave → rejoin lifecycle (review F1). `joined_at` is TIMESTAMPTZ in the
# migrated schema, but the ORM declared it naive, so a rejoin's aware UTC value
# was bound as TIMESTAMP WITHOUT TIME ZONE and asyncpg raised DataError → 500.
# SQLite never showed it, so these run only against PostgreSQL.
# ---------------------------------------------------------------------------


async def _participant_rows(event_id: str) -> list[dict]:
    """Every participant row of the event, read straight from PostgreSQL."""
    reader = create_async_engine(get_settings().async_postgres_url)
    try:
        async with reader.connect() as conn:
            rows = await conn.execute(
                text(
                    "SELECT p.id, p.user_id, p.status, p.joined_at, p.left_at, u.email "
                    "FROM event_participants p JOIN users u ON u.id = p.user_id "
                    "WHERE p.event_id = :id ORDER BY u.email"
                ),
                {"id": event_id},
            )
            return [dict(r._mapping) for r in rows]
    finally:
        await reader.dispose()


async def _me(client: AsyncClient, headers: dict[str, str]) -> str:
    return (await client.get("/auth/me", headers=headers)).json()["id"]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@pytest.mark.parametrize("make_session", [_run_session, _golf_round], ids=["running", "golf"])
async def test_leave_then_rejoin_reuses_the_participant_row(make_session) -> None:
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            host = await _register(client, "rejoin-host")
            guest = await _register(client, "rejoin-guest")
            guest_id = await _me(client, guest)
            event_id = (await client.post("/events", json=make_session(capacity=4), headers=host)).json()["id"]

            # Inserted by the column default: an absolute instant (timestamptz).
            host_row = next(r for r in await _participant_rows(event_id) if str(r["user_id"]) != guest_id)
            assert host_row["joined_at"].tzinfo is not None
            assert abs(host_row["joined_at"] - _utc_now()) < timedelta(minutes=2)

            assert (await client.post(f"/events/{event_id}/join", headers=guest)).status_code == 200
            first = next(r for r in await _participant_rows(event_id) if str(r["user_id"]) == guest_id)
            left = await client.post(f"/events/{event_id}/leave", headers=guest)
            assert left.status_code == 200, left.text
            assert left.json()["participant_count"] == 1

            rejoin = await client.post(f"/events/{event_id}/join", headers=guest)
            assert rejoin.status_code == 200, rejoin.text
            body = rejoin.json()
            assert body["participant_count"] == 2
            assert body["has_joined"] is True
            assert guest_id in {p["user_id"] for p in body["participants"]}
            # Serialized as an explicit UTC instant.
            assert all(p["joined_at"].endswith("Z") for p in body["participants"])

            guest_rows = [r for r in await _participant_rows(event_id) if str(r["user_id"]) == guest_id]
            assert len(guest_rows) == 1, "rejoin must reactivate, not duplicate"
            row = guest_rows[0]
            assert row["id"] == first["id"]
            assert row["status"] == "joined"
            assert row["left_at"] is None
            assert row["joined_at"] >= first["joined_at"]
            assert abs(row["joined_at"] - _utc_now()) < timedelta(minutes=2)

            # A second join is still a duplicate and does not take a place.
            again = await client.post(f"/events/{event_id}/join", headers=guest)
            assert again.status_code == 409, again.text
            final = (await client.get(f"/events/{event_id}", headers=host)).json()
            assert final["participant_count"] == 2
            assert final["spots_left"] == 2


async def test_full_round_leave_reopens_and_rejoin_fills_it_again() -> None:
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            host = await _register(client, "cycle-host")
            guest = await _register(client, "cycle-guest")
            outsider = await _register(client, "cycle-outsider")
            event_id = (await client.post("/events", json=_golf_round(capacity=2), headers=host)).json()["id"]

            joined = await client.post(f"/events/{event_id}/join", headers=guest)
            assert joined.json()["status"] == "full"
            blocked = await client.post(f"/events/{event_id}/join", headers=outsider)
            assert blocked.status_code == 422 and blocked.json()["detail"] == "Event is full"

            for cycle in range(3):
                left = await client.post(f"/events/{event_id}/leave", headers=guest)
                assert left.status_code == 200, (cycle, left.text)
                assert (left.json()["status"], left.json()["spots_left"]) == ("open", 1)
                back = await client.post(f"/events/{event_id}/join", headers=guest)
                assert back.status_code == 200, (cycle, back.text)
                assert (back.json()["status"], back.json()["spots_left"]) == ("full", 0)

            rows = await _participant_rows(event_id)
            assert sorted(r["status"] for r in rows) == ["joined", "joined"]
            assert len(rows) == 2


async def test_rejected_rejoin_leaves_the_left_row_untouched() -> None:
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            host = await _register(client, "reject-host")
            guest = await _register(client, "reject-guest")
            filler = await _register(client, "reject-filler")
            guest_id = await _me(client, guest)
            event_id = (await client.post("/events", json=_golf_round(capacity=2), headers=host)).json()["id"]
            assert (await client.post(f"/events/{event_id}/join", headers=guest)).status_code == 200
            assert (await client.post(f"/events/{event_id}/leave", headers=guest)).status_code == 200
            before = next(r for r in await _participant_rows(event_id) if str(r["user_id"]) == guest_id)

            # Someone else takes the place; the rejoin fails with nothing written.
            assert (await client.post(f"/events/{event_id}/join", headers=filler)).status_code == 200
            full = await client.post(f"/events/{event_id}/join", headers=guest)
            assert full.status_code == 422 and full.json()["detail"] == "Event is full"
            after = next(r for r in await _participant_rows(event_id) if str(r["user_id"]) == guest_id)
            assert after == before

            # Same for a cancelled event.
            assert (await client.post(f"/events/{event_id}/cancel", headers=host)).status_code == 200
            cancelled = await client.post(f"/events/{event_id}/join", headers=guest)
            assert cancelled.status_code == 422 and cancelled.json()["detail"] == "Cannot join a cancelled event"
            assert next(r for r in await _participant_rows(event_id) if str(r["user_id"]) == guest_id) == before
            final = (await client.get(f"/events/{event_id}", headers=host)).json()
            assert (final["status"], final["participant_count"]) == ("cancelled", 2)


async def test_concurrent_rejoins_by_one_user_count_once() -> None:
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            host = await _register(client, "crj-host")
            guest = await _register(client, "crj-guest")
            guest_id = await _me(client, guest)
            event_id = (await client.post("/events", json=_run_session(capacity=3), headers=host)).json()["id"]
            assert (await client.post(f"/events/{event_id}/join", headers=guest)).status_code == 200
            assert (await client.post(f"/events/{event_id}/leave", headers=guest)).status_code == 200

            results = await asyncio.gather(*(client.post(f"/events/{event_id}/join", headers=guest) for _ in range(3)))
            assert sorted(r.status_code for r in results) == [200, 409, 409], [r.text for r in results]
            guest_rows = [r for r in await _participant_rows(event_id) if str(r["user_id"]) == guest_id]
            assert [r["status"] for r in guest_rows] == ["joined"]
            assert (await client.get(f"/events/{event_id}", headers=host)).json()["participant_count"] == 2


async def test_last_place_race_after_a_leave_never_oversubscribes() -> None:
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            host = await _register(client, "lr-host")
            leaver = await _register(client, "lr-leaver")
            event_id = (await client.post("/events", json=_golf_round(capacity=3), headers=host)).json()["id"]
            assert (await client.post(f"/events/{event_id}/join", headers=leaver)).status_code == 200
            third = await client.post(f"/events/{event_id}/join", headers=await _register(client, "lr-x"))
            assert third.json()["status"] == "full"
            assert (await client.post(f"/events/{event_id}/leave", headers=leaver)).status_code == 200

            # The leaver's rejoin races two newcomers for the single place.
            newcomers = [await _register(client, f"lr-n{i}") for i in range(2)]
            results = await asyncio.gather(
                *(client.post(f"/events/{event_id}/join", headers=h) for h in [leaver, *newcomers])
            )
            assert sorted(r.status_code for r in results) == [200, 422, 422], [r.text for r in results]
            final = (await client.get(f"/events/{event_id}", headers=host)).json()
            assert (final["participant_count"], final["status"]) == (3, "full")
            assert sum(r["status"] == "joined" for r in await _participant_rows(event_id)) == 3
