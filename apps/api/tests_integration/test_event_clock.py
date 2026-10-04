"""One clock for group-session membership on real PostgreSQL (review MA-A).

The first join used the database's `now()` default while leave and rejoin
used the API host's clock, so a skewed host could record a leave before its
join, or a rejoin minutes away from the database's time. Every transition
now reads the database clock (`clock_timestamp()`) after the event row lock:
`now()` would be the transaction start, which can predate a long lock wait.

Only `event_participants.joined_at`/`left_at` (TIMESTAMPTZ) are concerned;
the legacy naive audit columns (R6) are out of scope.

Run against disposable services only (see test_run_golf_v2_journey.py).
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from test_contact_authority import _lock_waiter
from test_event_capacity import _me, _register, _run_session

from app.core.config import get_settings
from app.db.session import engine
from app.main import app
from app.services import events as events_service

EVENT_LOCK_WAIT = "%FROM events%FOR UPDATE%"


@pytest.fixture(autouse=True)
async def _fresh_pool() -> AsyncGenerator[None, None]:
    await engine.dispose(close=False)
    async with app.router.lifespan_context(app):
        yield


async def _row(conn, event_id: str, user_id: str) -> dict:
    result = await conn.execute(
        text("SELECT id, status, joined_at, left_at FROM event_participants WHERE event_id = :e AND user_id = :u"),
        {"e": event_id, "u": user_id},
    )
    return dict(result.mappings().one())


async def _participant(event_id: str, user_id: str) -> dict:
    async with engine.connect() as conn:
        return await _row(conn, event_id, user_id)


async def _participant_count(event_id: str) -> int:
    async with engine.connect() as conn:
        result = await conn.execute(
            text("SELECT count(*) FROM event_participants WHERE event_id = :e"), {"e": event_id}
        )
        return result.scalar_one()


async def _db_now() -> datetime:
    async with engine.connect() as conn:
        return (await conn.execute(text("SELECT clock_timestamp()"))).scalar_one()


@pytest.mark.parametrize("skew", [-120, 120], ids=["host-behind", "host-ahead"])
async def test_membership_times_follow_the_database_clock_under_host_skew(skew: int) -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        host = await _register(client, "clock-host")
        guest = await _register(client, "clock-guest")
        third = await _register(client, "clock-third")
        guest_id = await _me(client, guest)
        created = await client.post("/events", json=_run_session(capacity=2), headers=host)
        assert created.status_code == 201, created.text
        event_id = created.json()["id"]
        assert (await client.post(f"/events/{event_id}/join", headers=guest)).status_code == 200
        first = await _participant(event_id, guest_id)

        class Skewed(datetime):
            @classmethod
            def now(cls, tz=None):
                return datetime.now(tz) + timedelta(seconds=skew)

        with patch.object(events_service, "datetime", Skewed):  # the API host's clock only
            assert (await client.post(f"/events/{event_id}/leave", headers=guest)).status_code == 200
            left = await _participant(event_id, guest_id)
            assert (await client.post(f"/events/{event_id}/join", headers=guest)).status_code == 200
            rejoined = await _participant(event_id, guest_id)
            db_now = await _db_now()
            full = await client.post(f"/events/{event_id}/join", headers=third)

        assert first["joined_at"] <= left["left_at"] <= rejoined["joined_at"] <= db_now
        assert db_now - rejoined["joined_at"] < timedelta(seconds=2)  # database time, not the host's
        # Row reuse and capacity are unchanged.
        assert first["id"] == left["id"] == rejoined["id"]
        assert rejoined["status"] == "joined" and rejoined["left_at"] is None
        assert full.status_code == 422, full.text
        assert await _participant_count(event_id) == 2  # host and guest; the refused join added nothing


@pytest.mark.parametrize("transition", ["rejoin", "leave"])
async def test_transition_that_waited_for_the_event_lock_is_stamped_after_the_wait(transition: str) -> None:
    """A transition stamped with transaction-start time would precede the one it waited behind."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        host = await _register(client, f"wait-{transition}-host")
        guest = await _register(client, f"wait-{transition}-guest")
        guest_id = await _me(client, guest)
        event_id = (await client.post("/events", json=_run_session(capacity=4), headers=host)).json()["id"]
        assert (await client.post(f"/events/{event_id}/join", headers=guest)).status_code == 200
        if transition == "rejoin":
            assert (await client.post(f"/events/{event_id}/leave", headers=guest)).status_code == 200
        # The transition the request waits behind, committed by the lock holder.
        column = "left_at" if transition == "rejoin" else "joined_at"
        path = f"/events/{event_id}/join" if transition == "rejoin" else f"/events/{event_id}/leave"

        holder_engine = create_async_engine(get_settings().async_postgres_url)
        try:
            async with holder_engine.connect() as holder:
                tx = await holder.begin()
                await holder.execute(text("SELECT id FROM events WHERE id = :e FOR UPDATE"), {"e": event_id})
                waiting = asyncio.create_task(client.post(path, headers=guest))
                await _lock_waiter(EVENT_LOCK_WAIT)  # its transaction has started and is waiting
                await asyncio.sleep(0.2)
                await holder.execute(
                    text(
                        f"UPDATE event_participants SET {column} = clock_timestamp() "
                        "WHERE event_id = :e AND user_id = :u"
                    ),
                    {"e": event_id, "u": guest_id},
                )
                prior = (await _row(holder, event_id, guest_id))[column]
                await tx.commit()
            r = await asyncio.wait_for(waiting, timeout=10)
        finally:
            await holder_engine.dispose()
        assert r.status_code == 200, r.text
        after = await _participant(event_id, guest_id)
        stamped = after["joined_at"] if transition == "rejoin" else after["left_at"]
        assert stamped >= prior, f"{transition} stamped {stamped}, before the transition it waited behind ({prior})"
