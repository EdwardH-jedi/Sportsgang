"""1:1 booking instants on real PostgreSQL are independent of the API process
time zone (review F5).

Before the fix an offset-free `starts_at` was handed to asyncpg as a naive
datetime and stored relative to the *process* time zone: the same payload
became 09:00Z under TZ=UTC and 22:00Z the previous day under
TZ=Australia/Sydney. The process time zone is switched in-process with
`time.tzset()` (restored afterwards), which is what asyncpg consults.
"""

from __future__ import annotations

import os
import time
from collections.abc import AsyncGenerator, Iterator
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
    await engine.dispose(close=False)
    yield


@pytest.fixture
def process_tz(request: pytest.FixtureRequest) -> Iterator[str]:
    previous = os.environ.get("TZ")
    os.environ["TZ"] = request.param
    time.tzset()
    try:
        yield request.param
    finally:
        if previous is None:
            os.environ.pop("TZ", None)
        else:
            os.environ["TZ"] = previous
        time.tzset()


async def _register(client: AsyncClient, tag: str) -> tuple[dict[str, str], str]:
    peer = (f"10.{randrange(256)}.{randrange(256)}.{randrange(1, 255)}", randrange(1024, 65535))
    async with AsyncClient(transport=ASGITransport(app=app, client=peer), base_url="http://test") as signup:
        r = await signup.post(
            "/auth/register",
            json={"email": f"booking-tz-{tag}-{uuid4().hex}@example.com", "password": "integration-password-123"},
        )
    assert r.status_code == 201, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return headers, (await client.get("/auth/me", headers=headers)).json()["id"]


async def _match(client: AsyncClient) -> tuple[dict[str, str], dict[str, str], str]:
    proposer, proposer_id = await _register(client, "proposer")
    partner, partner_id = await _register(client, "partner")
    for headers, target in ((proposer, partner_id), (partner, proposer_id)):
        liked = await client.post(
            "/discovery/actions",
            json={"target_user_id": target, "action": "like", "sport": "running"},
            headers=headers,
        )
        assert liked.status_code == 200, liked.text
    return proposer, partner, liked.json()["match_id"]


async def _stored_utc(booking_id: str) -> tuple[datetime, datetime]:
    reader = create_async_engine(get_settings().async_postgres_url)
    try:
        async with reader.connect() as conn:
            row = (
                await conn.execute(text("SELECT starts_at, ends_at FROM bookings WHERE id = :id"), {"id": booking_id})
            ).one()
            return row.starts_at.astimezone(timezone.utc), row.ends_at.astimezone(timezone.utc)
    finally:
        await reader.dispose()


def _instant(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@pytest.mark.parametrize("process_tz", ["UTC", "Australia/Sydney", "America/Los_Angeles"], indirect=True)
async def test_legacy_naive_payload_stores_one_instant_under_any_api_timezone(process_tz: str) -> None:
    day = (datetime.now(timezone.utc) + timedelta(days=20)).date().isoformat()
    expected = datetime.fromisoformat(f"{day}T09:00:00+00:00")
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            proposer, _, match_id = await _match(client)
            created = await client.post(
                "/bookings",
                json={
                    "match_id": match_id,
                    "sport": "running",
                    "starts_at": f"{day}T09:00:00",
                    "ends_at": f"{day}T10:00:00",
                },
                headers=proposer,
            )
            assert created.status_code == 201, created.text
            assert _instant(created.json()["starts_at"]) == expected
            assert await _stored_utc(created.json()["id"]) == (expected, expected + timedelta(hours=1))


@pytest.mark.parametrize("process_tz", ["UTC", "Australia/Sydney"], indirect=True)
async def test_sydney_proposal_keeps_its_instant_through_confirmation_and_plans(process_tz: str) -> None:
    # What the corrected composer sends: a Sydney wall time converted to UTC.
    day = (datetime.now(timezone.utc) + timedelta(days=25)).date().isoformat()
    starts = datetime.fromisoformat(f"{day}T18:30:00+11:00").astimezone(timezone.utc)
    ends = starts + timedelta(minutes=90)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            proposer, partner, match_id = await _match(client)
            created = await client.post(
                "/bookings",
                json={
                    "match_id": match_id,
                    "sport": "running",
                    "starts_at": starts.isoformat().replace("+00:00", "Z"),
                    "ends_at": ends.isoformat().replace("+00:00", "Z"),
                },
                headers=proposer,
            )
            assert created.status_code == 201, created.text
            booking_id = created.json()["id"]
            confirmed = await client.post(f"/bookings/{booking_id}/confirm", headers=partner)
            assert confirmed.status_code == 200, confirmed.text
            assert _instant(confirmed.json()["starts_at"]) == starts

            for headers in (proposer, partner):
                listed = await client.get(
                    "/bookings?status=proposed,confirmed,completed,cancelled,declined,no_show&limit=50",
                    headers=headers,
                )
                item = next(b for b in listed.json()["items"] if b["id"] == booking_id)
                assert item["status"] == "confirmed"
                assert (_instant(item["starts_at"]), _instant(item["ends_at"])) == (starts, ends)
            assert await _stored_utc(booking_id) == (starts, ends)
