"""My Plans segments on real PostgreSQL (review F2).

The unfixed client fetched the first 50 rows of each source in starts_at
order and segmented that, so 51+ past items pushed every future commitment
out of My Plans. With `segment` + `as_of` the API returns each lifecycle
segment on its own, ordered by (starts_at, id), and Past pages to the end.
History rows are inserted with SQL because the API never creates sessions
or bookings in the past.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone
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


def _peer() -> tuple[str, int]:
    octets = uuid4().bytes
    return f"10.{octets[0]}.{octets[1]}.{octets[2]}", 40000 + octets[3]


async def _register(client: AsyncClient, tag: str) -> tuple[dict[str, str], str]:
    async with AsyncClient(transport=ASGITransport(app=app, client=_peer()), base_url="http://test") as signup:
        r = await signup.post(
            "/auth/register",
            json={"email": f"plans-{tag}-{uuid4().hex[:10]}@example.com", "password": "integration-password-123"},
        )
    assert r.status_code == 201, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return headers, (await client.get("/auth/me", headers=headers)).json()["id"]


async def _sql(statement: str, rows: list[dict]) -> None:
    writer = create_async_engine(get_settings().async_postgres_url)
    try:
        async with writer.begin() as conn:
            await conn.execute(text(statement), rows)
    finally:
        await writer.dispose()


async def _all_pages(client: AsyncClient, headers: dict, path: str, page: int = 20) -> tuple[list[str], set[int]]:
    ids: list[str] = []
    totals: set[int] = set()
    offset = 0
    while True:
        r = await client.get(f"{path}&limit={page}&offset={offset}", headers=headers)
        assert r.status_code == 200, r.text
        body = r.json()
        totals.add(body["total"])
        ids += [item["id"] for item in body["items"]]
        offset += page
        if offset >= body["total"]:
            return ids, totals


async def test_history_never_hides_future_plans_on_postgres() -> None:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    as_of = now.isoformat().replace("+00:00", "Z")
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            me, me_id = await _register(client, "me")
            partner, partner_id = await _register(client, "partner")
            for headers, target in ((me, partner_id), (partner, me_id)):
                liked = await client.post(
                    "/discovery/actions",
                    json={"target_user_id": target, "action": "like", "sport": "running"},
                    headers=headers,
                )
            match_id = liked.json()["match_id"]

            # 55 completed past sessions and 55 completed past bookings; three
            # of each share a start time to exercise the id tie-break.
            history_at = [now - timedelta(days=200 - i) for i in range(52)] + [now - timedelta(days=10)] * 3
            event_rows = [{"id": str(uuid4()), "host": me_id, "at": at} for at in history_at]
            await _sql(
                "INSERT INTO events (id, host_user_id, title, sport, mode, starts_at, location_text, capacity,"
                " visibility, status, created_at, updated_at) VALUES (:id, :host, 'Old run', 'running', 'casual',"
                " :at, 'Centennial Park', 4, 'public', 'completed', now(), now())",
                event_rows,
            )
            await _sql(
                "INSERT INTO event_participants (id, event_id, user_id, status, joined_at)"
                " VALUES (:pid, :id, :host, 'joined', now())",
                [{**row, "pid": str(uuid4())} for row in event_rows],
            )
            booking_rows = [
                {
                    "id": str(uuid4()),
                    "m": match_id,
                    "p": me_id,
                    "q": partner_id,
                    "at": at,
                    "end": at + timedelta(hours=1),
                }
                for at in history_at
            ]
            await _sql(
                "INSERT INTO bookings (id, match_id, proposer_id, partner_id, sport, starts_at, ends_at, status,"
                " created_at, updated_at) VALUES (:id, :m, :p, :q, 'running', :at, :end, 'completed', now(), now())",
                booking_rows,
            )

            # Future commitments through the API.
            future_run = await client.post(
                "/events",
                json={
                    "title": "Saturday 10k",
                    "sport": "running",
                    "mode": "casual",
                    "starts_at": (now + timedelta(days=5)).isoformat(),
                    "location_text": "Centennial Park",
                    "capacity": 6,
                    "run_details": {"distance_km": 10, "pace_mode": "social", "group_style": "stay_together"},
                },
                headers=me,
            )
            assert future_run.status_code == 201, future_run.text
            cancelled_future = await client.post(
                "/events",
                json={
                    "title": "Called off",
                    "sport": "running",
                    "mode": "casual",
                    "starts_at": (now + timedelta(days=6)).isoformat(),
                    "location_text": "Bondi",
                    "capacity": 6,
                },
                headers=me,
            )
            assert (await client.post(f"/events/{cancelled_future.json()['id']}/cancel", headers=me)).status_code == 200
            start = now + timedelta(days=3)
            confirmed = await client.post(
                "/bookings",
                json={
                    "match_id": match_id,
                    "sport": "running",
                    "starts_at": start.isoformat(),
                    "ends_at": (start + timedelta(hours=1)).isoformat(),
                },
                headers=me,
            )
            assert (
                await client.post(f"/bookings/{confirmed.json()['id']}/confirm", headers=partner)
            ).status_code == 200
            proposed = await client.post(
                "/bookings",
                json={
                    "match_id": match_id,
                    "sport": "running",
                    "starts_at": (start + timedelta(days=1)).isoformat(),
                    "ends_at": (start + timedelta(days=1, hours=1)).isoformat(),
                },
                headers=partner,
            )
            assert proposed.status_code == 201, proposed.text

            # The unfixed client's view: none of the future plans in the first 50.
            legacy_events = (await client.get("/events?mine=true&limit=50", headers=me)).json()
            assert future_run.json()["id"] not in {e["id"] for e in legacy_events["items"]}
            legacy_bookings = (await client.get("/bookings?limit=50", headers=me)).json()
            assert confirmed.json()["id"] not in {b["id"] for b in legacy_bookings["items"]}

            # Segments: Upcoming / Pending independent of history.
            up_events, up_totals = await _all_pages(client, me, f"/events?mine=true&segment=upcoming&as_of={as_of}")
            assert (up_events, up_totals) == ([future_run.json()["id"]], {1})
            up_bookings, _ = await _all_pages(client, me, f"/bookings?segment=upcoming&as_of={as_of}")
            assert up_bookings == [confirmed.json()["id"]]
            pending, _ = await _all_pages(client, me, f"/bookings?segment=pending&as_of={as_of}")
            assert pending == [proposed.json()["id"]]
            # The partner sees the same booking as pending too (they must answer it).
            partner_pending, _ = await _all_pages(client, partner, f"/bookings?segment=pending&as_of={as_of}")
            assert partner_pending == [proposed.json()["id"]]

            # Past pages through all 56 sessions / 55 bookings, newest first,
            # ties broken by id exactly as PostgreSQL orders uuids.
            past_events, past_totals = await _all_pages(client, me, f"/events?mine=true&segment=past&as_of={as_of}")
            assert past_totals == {56}
            assert len(past_events) == len(set(past_events)) == 56
            assert past_events[0] == cancelled_future.json()["id"]  # future-dated but cancelled
            expected_history = [r["id"] for r in sorted(event_rows, key=lambda r: (r["at"], r["id"]), reverse=True)]
            assert past_events[1:] == expected_history
            past_bookings, _ = await _all_pages(client, me, f"/bookings?segment=past&as_of={as_of}")
            expected_bookings = [r["id"] for r in sorted(booking_rows, key=lambda r: (r["at"], r["id"]), reverse=True)]
            assert past_bookings == expected_bookings
