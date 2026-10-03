"""Audit timestamps on real PostgreSQL, whatever the server's default zone (review R6).

Run like the other integration tests. To cover a server whose default
TimeZone is not UTC, point POSTGRES_URL at a database created with
``ALTER DATABASE <db> SET timezone TO 'Australia/Sydney'``; optionally also
set DB_NAIVE_TIMEZONE and TZ. The assertions hold in every combination:
contract in docs/run-golf-v2/CONTRACTS.md §9.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings
from app.db.session import engine
from app.main import app

UTC = timezone.utc


@pytest.fixture(autouse=True)
async def _fresh_pool() -> AsyncGenerator[None, None]:
    await engine.dispose(close=False)
    yield


def _peer() -> tuple[str, int]:
    octets = uuid4().bytes
    return f"10.{octets[0]}.{octets[1]}.{octets[2]}", 40000 + octets[3]


async def _register(client: AsyncClient, tag: str) -> tuple[dict[str, str], str]:
    async with AsyncClient(transport=ASGITransport(app=app, client=_peer()), base_url="http://test") as signup:
        r = await signup.post(
            "/auth/register",
            json={"email": f"ai-{tag}-{uuid4().hex[:10]}@example.com", "password": "integration-password-123"},
        )
    assert r.status_code == 201, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return headers, (await client.get("/auth/me", headers=headers)).json()["id"]


def _instant(value: str) -> datetime:
    assert value.endswith("Z"), f"audit timestamps carry an explicit UTC offset: {value}"
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


async def test_sessions_are_pinned_whatever_the_server_default() -> None:
    zone = get_settings().db_naive_timezone
    async with engine.connect() as conn:
        assert (await conn.execute(text("SHOW timezone"))).scalar_one() == zone
    raw = create_async_engine(get_settings().async_postgres_url)  # not pinned: the server/database default
    try:
        async with raw.connect() as conn:
            server_default = (await conn.execute(text("SHOW timezone"))).scalar_one()
    finally:
        await raw.dispose()
    print(f"server default TimeZone={server_default}; API sessions pinned to {zone}")


async def test_new_audit_values_are_true_instants_and_stored_in_the_pinned_zone() -> None:
    zone = ZoneInfo(get_settings().db_naive_timezone)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            a, a_id = await _register(client, "a")
            b, b_id = await _register(client, "b")
            like = {"action": "like", "sport": "running"}
            await client.post("/discovery/actions", json={**like, "target_user_id": b_id}, headers=a)
            second = await client.post("/discovery/actions", json={**like, "target_user_id": a_id}, headers=b)
            match_id = second.json()["match_id"]

            before = datetime.now(UTC)
            msg = (await client.post(f"/matches/{match_id}/messages", json={"body": "first"}, headers=a)).json()
            start = datetime.now(UTC) + timedelta(days=2)
            proposal = {
                "match_id": match_id,
                "sport": "running",
                "starts_at": start.isoformat(),
                "ends_at": (start + timedelta(hours=1)).isoformat(),
            }
            booking = (await client.post("/bookings", json=proposal, headers=b)).json()
            block = (await client.post(f"/blocks/{b_id}", headers=a)).json()
            after = datetime.now(UTC)

            for value in (msg["created_at"], booking["created_at"], booking["updated_at"], block["created_at"]):
                assert before - timedelta(seconds=5) <= _instant(value) <= after + timedelta(seconds=5)
            # Message then proposal: the instants keep that order across tables.
            assert _instant(msg["created_at"]) <= _instant(booking["created_at"])

            async with engine.connect() as conn:
                stored = (
                    await conn.execute(text("SELECT created_at FROM messages WHERE id = :id"), {"id": msg["id"]})
                ).scalar_one()
            assert stored.tzinfo is None
            assert stored.replace(tzinfo=zone).astimezone(UTC) == _instant(msg["created_at"])


async def test_a_legacy_naive_row_is_read_in_the_configured_zone() -> None:
    zone = ZoneInfo(get_settings().db_naive_timezone)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            a, a_id = await _register(client, "legacy-a")
            b, b_id = await _register(client, "legacy-b")
            like = {"action": "like", "sport": "golf"}
            await client.post("/discovery/actions", json={**like, "target_user_id": b_id}, headers=a)
            second = await client.post("/discovery/actions", json={**like, "target_user_id": a_id}, headers=b)
            match_id = second.json()["match_id"]
            async with engine.begin() as conn:
                await conn.execute(
                    text(
                        "INSERT INTO messages (id, match_id, sender_id, body, created_at)"
                        " VALUES (:id, :m, :s, 'legacy', TIMESTAMP '2026-10-02 15:30:00')"
                    ),
                    {"id": str(uuid4()), "m": match_id, "s": b_id},
                )
            items = (await client.get(f"/matches/{match_id}/messages", headers=a)).json()["items"]
            expected = datetime(2026, 10, 2, 15, 30, tzinfo=zone).astimezone(UTC)
            assert _instant(items[0]["created_at"]) == expected
            preview = (await client.get("/matches", headers=a)).json()["items"]
            assert _instant(next(m for m in preview if m["id"] == match_id)["last_message_at"]) == expected
