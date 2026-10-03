"""Audit timestamps are aware UTC instants on the wire (review R6).

Contract: docs/run-golf-v2/CONTRACTS.md §9. Real PostgreSQL session-zone
checks (UTC and Australia/Sydney server defaults) live in
tests_integration/test_audit_instants.py.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator
from unittest.mock import AsyncMock
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core import time as audit_time
from app.core.config import Settings
from app.db.base import Base
from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app
from app.schemas.chat import MessageResponse
from app.schemas.safety import BlockResponse

UTC = timezone.utc


@pytest.fixture
def legacy_zone(monkeypatch):
    """Interpret naive values in another zone, as DB_NAIVE_TIMEZONE would."""

    def use(name: str) -> None:
        monkeypatch.setattr(audit_time, "naive_zone", lambda: ZoneInfo(name))

    return use


def test_naive_values_are_read_in_the_configured_zone_default_utc() -> None:
    assert audit_time.utc_instant(datetime(2026, 10, 2, 15, 30)) == datetime(2026, 10, 2, 15, 30, tzinfo=UTC)


def test_aware_values_keep_their_instant() -> None:
    sydney = datetime(2026, 10, 3, 1, 30, tzinfo=ZoneInfo("Australia/Sydney"))
    assert audit_time.utc_instant(sydney) == datetime(2026, 10, 2, 15, 30, tzinfo=UTC)
    plus = datetime(2026, 10, 3, 2, 30, tzinfo=timezone(timedelta(hours=11)))
    assert audit_time.utc_instant(plus) == datetime(2026, 10, 2, 15, 30, tzinfo=UTC)


def test_sydney_legacy_zone_including_midnight_and_dst(legacy_zone) -> None:
    legacy_zone("Australia/Sydney")
    # AEST (+10): 01:30 on Oct 3 in Sydney is 15:30Z on Oct 2.
    assert audit_time.utc_instant(datetime(2026, 10, 3, 1, 30)) == datetime(2026, 10, 2, 15, 30, tzinfo=UTC)
    # Just after Sydney midnight is still the previous UTC day.
    assert audit_time.utc_instant(datetime(2026, 10, 3, 0, 5)) == datetime(2026, 10, 2, 14, 5, tzinfo=UTC)
    # Spring forward (4 Oct 2026, 02:00 → 03:00): a skipped wall time uses
    # the offset before the transition.
    assert audit_time.utc_instant(datetime(2026, 10, 4, 2, 30)) == datetime(2026, 10, 3, 16, 30, tzinfo=UTC)
    assert audit_time.utc_instant(datetime(2026, 10, 4, 3, 30)) == datetime(2026, 10, 3, 16, 30, tzinfo=UTC)
    # Fall back (5 Apr 2026, 03:00 → 02:00): a repeated wall time is the
    # earlier occurrence (AEDT, +11).
    assert audit_time.utc_instant(datetime(2026, 4, 5, 2, 30)) == datetime(2026, 4, 4, 15, 30, tzinfo=UTC)


def test_serialized_with_an_explicit_utc_offset() -> None:
    msg = MessageResponse(
        id=uuid4(), match_id=uuid4(), sender_id=uuid4(), body="hi", created_at=datetime(2026, 10, 2, 15, 30)
    )
    assert msg.model_dump(mode="json")["created_at"] == "2026-10-02T15:30:00Z"
    block = BlockResponse(
        id=uuid4(), blocker_id=uuid4(), blocked_id=uuid4(), created_at=datetime(2026, 10, 2, 15, 30, 1)
    )
    assert '"created_at":"2026-10-02T15:30:01Z"' in block.model_dump_json()


def test_unknown_zone_is_refused_at_startup() -> None:
    with pytest.raises(ValidationError):
        Settings(db_naive_timezone="Mars/Olympus_Mons")
    assert Settings(db_naive_timezone="Australia/Sydney").db_connect_args == {
        "server_settings": {"timezone": "Australia/Sydney"}
    }


# ─── HTTP surface (SQLite; CURRENT_TIMESTAMP is UTC) ─────────────────────────

_engine = create_async_engine("sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False})
_Session = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)


@pytest.fixture(scope="module", autouse=True)
async def create_tables():
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    async def _db() -> AsyncGenerator[AsyncSession, None]:
        async with _Session() as session:
            yield session

    async def _redis() -> AsyncGenerator:
        yield AsyncMock()

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_redis] = _redis
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


def _is_utc_instant_near_now(value: str) -> bool:
    assert value.endswith("Z"), value
    instant = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return abs(instant - datetime.now(UTC)) < timedelta(minutes=2)


async def test_every_audit_field_on_the_wire_is_an_aware_instant(client: AsyncClient) -> None:
    async def register(tag: str) -> tuple[dict, str]:
        r = await client.post("/auth/register", json={"email": f"ai-{tag}@example.com", "password": "password123"})
        headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
        return headers, (await client.get("/auth/me", headers=headers)).json()["id"]

    a, a_id = await register("a")
    b, b_id = await register("b")
    like = {"action": "like", "sport": "gym"}
    await client.post("/discovery/actions", json={**like, "target_user_id": b_id}, headers=a)
    second = await client.post("/discovery/actions", json={**like, "target_user_id": a_id}, headers=b)
    match_id = second.json()["match_id"]

    msg = (await client.post(f"/matches/{match_id}/messages", json={"body": "hello"}, headers=a)).json()
    assert _is_utc_instant_near_now(msg["created_at"])
    listed = (await client.get(f"/matches/{match_id}/messages", headers=b)).json()["items"][0]
    assert listed["created_at"] == msg["created_at"]
    preview = (await client.get("/matches", headers=b)).json()["items"][0]
    assert preview["last_message_at"] == msg["created_at"]
    assert preview["created_at"].endswith("Z")

    start = datetime.now(UTC) + timedelta(days=2)
    body = {
        "match_id": match_id,
        "sport": "gym",
        "starts_at": start.isoformat(),
        "ends_at": (start + timedelta(hours=1)).isoformat(),
    }
    booking = (await client.post("/bookings", json=body, headers=a)).json()
    assert _is_utc_instant_near_now(booking["created_at"])
    assert _is_utc_instant_near_now(booking["updated_at"])

    report = (await client.post("/reports", json={"reported_user_id": b_id, "reason": "spam"}, headers=a)).json()
    assert _is_utc_instant_near_now(report["created_at"])
    block = (await client.post(f"/blocks/{b_id}", headers=a)).json()
    assert _is_utc_instant_near_now(block["created_at"])
    assert (await client.get("/blocks", headers=a)).json()["items"][0]["created_at"] == block["created_at"]
