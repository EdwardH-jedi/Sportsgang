"""Booking endpoint tests using an in-memory SQLite async database."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app

from app.models import match, profile, user, chat, booking  # noqa: F401

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

_engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
_TestSession = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)


@pytest.fixture(scope="module", autouse=True)
async def create_tables():
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with _TestSession() as session:
        yield session


async def _override_get_redis() -> AsyncGenerator:
    mock = AsyncMock()
    mock.ping = AsyncMock(return_value=True)
    mock.aclose = AsyncMock()
    yield mock


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_redis] = _override_get_redis
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _register(client: AsyncClient, email: str) -> tuple[str, str]:
    r = await client.post("/auth/register", json={"email": email, "password": "password123"})
    token = r.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = me.json()["id"]
    return token, user_id


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _mutual_like_and_get_match_id(
    client: AsyncClient,
    token_a: str,
    uid_a: str,
    token_b: str,
    uid_b: str,
    sport: str = "gym",
) -> str:
    await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_b, "action": "like", "sport": sport},
        headers=_auth(token_a),
    )
    r = await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_a, "action": "like", "sport": sport},
        headers=_auth(token_b),
    )
    return r.json()["match_id"]


# NOTE: starts_at must stay in the future. The service rejects bookings that
# begin more than 1 hour in the past, so a hardcoded past date would break
# every booking-creation test as the calendar rolls over.
_BOOKING_PAYLOAD = {
    "sport": "gym",
    "starts_at": "2030-04-01T09:00:00Z",
    "ends_at": "2030-04-01T10:00:00Z",
    "location": "Bondi gym",
}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_bookings_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/bookings")
    assert r.status_code in (401, 403)


async def test_create_booking_requires_auth(client: AsyncClient) -> None:
    r = await client.post("/bookings", json={**_BOOKING_PAYLOAD, "match_id": "00000000-0000-0000-0000-000000000001"})
    assert r.status_code in (401, 403)


async def test_create_booking_on_nonexistent_match_returns_404(client: AsyncClient) -> None:
    token, _ = await _register(client, "book_noexist@example.com")
    r = await client.post(
        "/bookings",
        json={**_BOOKING_PAYLOAD, "match_id": "00000000-0000-0000-0000-000000000001"},
        headers=_auth(token),
    )
    assert r.status_code == 404


async def test_create_booking_returns_proposed_status(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "book_create_a@example.com")
    token_b, uid_b = await _register(client, "book_create_b@example.com")
    match_id = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)

    r = await client.post(
        "/bookings",
        json={**_BOOKING_PAYLOAD, "match_id": match_id},
        headers=_auth(token_a),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "proposed"
    assert body["match_id"] == match_id
    assert body["sport"] == "gym"
    assert "partner" in body


async def test_bookings_empty_for_new_user(client: AsyncClient) -> None:
    token, _ = await _register(client, "book_empty@example.com")
    r = await client.get("/bookings", headers=_auth(token))
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


async def test_booking_visible_to_both_participants(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "book_vis_a@example.com")
    token_b, uid_b = await _register(client, "book_vis_b@example.com")
    match_id = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)

    await client.post(
        "/bookings",
        json={**_BOOKING_PAYLOAD, "match_id": match_id},
        headers=_auth(token_a),
    )

    r_a = await client.get("/bookings", headers=_auth(token_a))
    r_b = await client.get("/bookings", headers=_auth(token_b))
    assert r_a.json()["total"] == 1
    assert r_b.json()["total"] == 1
    assert r_a.json()["items"][0]["id"] == r_b.json()["items"][0]["id"]


async def test_partner_can_confirm_booking(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "book_conf_a@example.com")
    token_b, uid_b = await _register(client, "book_conf_b@example.com")
    match_id = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)

    create_r = await client.post(
        "/bookings",
        json={**_BOOKING_PAYLOAD, "match_id": match_id},
        headers=_auth(token_a),
    )
    booking_id = create_r.json()["id"]

    r = await client.post(f"/bookings/{booking_id}/confirm", headers=_auth(token_b))
    assert r.status_code == 200
    assert r.json()["status"] == "confirmed"


async def test_proposer_cannot_confirm_own_booking(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "book_selfconf_a@example.com")
    token_b, uid_b = await _register(client, "book_selfconf_b@example.com")
    match_id = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)

    create_r = await client.post(
        "/bookings",
        json={**_BOOKING_PAYLOAD, "match_id": match_id},
        headers=_auth(token_a),
    )
    booking_id = create_r.json()["id"]

    r = await client.post(f"/bookings/{booking_id}/confirm", headers=_auth(token_a))
    assert r.status_code == 403


async def test_partner_can_decline_booking(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "book_decl_a@example.com")
    token_b, uid_b = await _register(client, "book_decl_b@example.com")
    match_id = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)

    create_r = await client.post(
        "/bookings",
        json={**_BOOKING_PAYLOAD, "match_id": match_id},
        headers=_auth(token_a),
    )
    booking_id = create_r.json()["id"]

    r = await client.post(f"/bookings/{booking_id}/decline", headers=_auth(token_b))
    assert r.status_code == 200
    assert r.json()["status"] == "declined"


async def test_proposer_can_cancel_proposed_booking(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "book_canc_a@example.com")
    token_b, uid_b = await _register(client, "book_canc_b@example.com")
    match_id = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)

    create_r = await client.post(
        "/bookings",
        json={**_BOOKING_PAYLOAD, "match_id": match_id},
        headers=_auth(token_a),
    )
    booking_id = create_r.json()["id"]

    r = await client.post(f"/bookings/{booking_id}/cancel", headers=_auth(token_a))
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"


async def test_invalid_transition_returns_422(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "book_inv_a@example.com")
    token_b, uid_b = await _register(client, "book_inv_b@example.com")
    match_id = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)

    create_r = await client.post(
        "/bookings",
        json={**_BOOKING_PAYLOAD, "match_id": match_id},
        headers=_auth(token_a),
    )
    booking_id = create_r.json()["id"]

    # Can't complete a proposed booking
    r = await client.post(f"/bookings/{booking_id}/complete", headers=_auth(token_a))
    assert r.status_code == 422


async def test_non_participant_cannot_access_booking(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "book_3p_a@example.com")
    token_b, uid_b = await _register(client, "book_3p_b@example.com")
    token_c, _ = await _register(client, "book_3p_c@example.com")
    match_id = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)

    create_r = await client.post(
        "/bookings",
        json={**_BOOKING_PAYLOAD, "match_id": match_id},
        headers=_auth(token_a),
    )
    booking_id = create_r.json()["id"]

    r = await client.get(f"/bookings/{booking_id}", headers=_auth(token_c))
    assert r.status_code == 404


async def test_ends_at_before_starts_at_returns_422(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "book_time_a@example.com")
    token_b, uid_b = await _register(client, "book_time_b@example.com")
    match_id = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)

    r = await client.post(
        "/bookings",
        json={
            "match_id": match_id,
            "sport": "gym",
            "starts_at": "2026-04-01T10:00:00Z",
            "ends_at": "2026-04-01T09:00:00Z",
        },
        headers=_auth(token_a),
    )
    assert r.status_code == 422


async def test_list_with_status_filter(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "book_filter_a@example.com")
    token_b, uid_b = await _register(client, "book_filter_b@example.com")
    match_id = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)

    create_r = await client.post(
        "/bookings",
        json={**_BOOKING_PAYLOAD, "match_id": match_id},
        headers=_auth(token_a),
    )
    assert create_r.status_code == 201
    booking_id = create_r.json()["id"]

    # Booking in "proposed" status should appear under ?status=proposed
    r_proposed = await client.get("/bookings?status=proposed", headers=_auth(token_a))
    assert r_proposed.status_code == 200
    ids_proposed = [item["id"] for item in r_proposed.json()["items"]]
    assert booking_id in ids_proposed

    # Booking in "proposed" status should NOT appear under ?status=confirmed
    r_confirmed = await client.get("/bookings?status=confirmed", headers=_auth(token_a))
    assert r_confirmed.status_code == 200
    ids_confirmed = [item["id"] for item in r_confirmed.json()["items"]]
    assert booking_id not in ids_confirmed


async def test_past_booking_rejected(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "book_past_a@example.com")
    token_b, uid_b = await _register(client, "book_past_b@example.com")
    match_id = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)

    r = await client.post(
        "/bookings",
        json={
            "match_id": match_id,
            "sport": "gym",
            "starts_at": "2020-01-01T00:00:00Z",
            "ends_at": "2020-01-01T01:00:00Z",
        },
        headers=_auth(token_a),
    )
    assert r.status_code == 422


async def test_complete_transition(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "book_complete_a@example.com")
    token_b, uid_b = await _register(client, "book_complete_b@example.com")
    match_id = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)

    create_r = await client.post(
        "/bookings",
        json={**_BOOKING_PAYLOAD, "match_id": match_id},
        headers=_auth(token_a),
    )
    assert create_r.status_code == 201
    booking_id = create_r.json()["id"]

    # Partner confirms first (proposed -> confirmed)
    conf_r = await client.post(f"/bookings/{booking_id}/confirm", headers=_auth(token_b))
    assert conf_r.status_code == 200
    assert conf_r.json()["status"] == "confirmed"

    # Either participant can mark complete (confirmed -> completed)
    complete_r = await client.post(f"/bookings/{booking_id}/complete", headers=_auth(token_a))
    assert complete_r.status_code == 200
    assert complete_r.json()["status"] == "completed"


async def test_no_show_transition(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "book_noshow_a@example.com")
    token_b, uid_b = await _register(client, "book_noshow_b@example.com")
    match_id = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)

    create_r = await client.post(
        "/bookings",
        json={**_BOOKING_PAYLOAD, "match_id": match_id},
        headers=_auth(token_a),
    )
    assert create_r.status_code == 201
    booking_id = create_r.json()["id"]

    # Partner confirms first (proposed -> confirmed)
    conf_r = await client.post(f"/bookings/{booking_id}/confirm", headers=_auth(token_b))
    assert conf_r.status_code == 200
    assert conf_r.json()["status"] == "confirmed"

    # Either participant can mark no-show (confirmed -> no_show)
    noshow_r = await client.post(f"/bookings/{booking_id}/no-show", headers=_auth(token_b))
    assert noshow_r.status_code == 200
    assert noshow_r.json()["status"] == "no_show"


# ---------------------------------------------------------------------------
# FSM edge cases — illegal transitions
#
# The allowed transitions are (see app/services/bookings.py::_TRANSITIONS):
#   proposed   -> confirmed | declined | cancelled
#   confirmed  -> cancelled | completed | no_show
# All other transitions MUST be rejected with 422. Terminal states
# (declined, cancelled, completed, no_show) cannot transition further.
# ---------------------------------------------------------------------------


async def _proposed_booking(client: AsyncClient, suffix: str) -> tuple[str, str, str, str, str]:
    """Register two users, open a match, and create a proposed booking.

    Returns (token_proposer, uid_proposer, token_partner, uid_partner, booking_id).
    """
    token_a, uid_a = await _register(client, f"book_fsm_{suffix}_a@example.com")
    token_b, uid_b = await _register(client, f"book_fsm_{suffix}_b@example.com")
    match_id = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)
    create_r = await client.post(
        "/bookings",
        json={**_BOOKING_PAYLOAD, "match_id": match_id},
        headers=_auth(token_a),
    )
    assert create_r.status_code == 201
    return token_a, uid_a, token_b, uid_b, create_r.json()["id"]


async def test_declined_is_terminal(client: AsyncClient) -> None:
    """Once declined, no transitions are accepted."""
    token_a, _, token_b, _, booking_id = await _proposed_booking(client, "declined_terminal")

    decline_r = await client.post(f"/bookings/{booking_id}/decline", headers=_auth(token_b))
    assert decline_r.status_code == 200
    assert decline_r.json()["status"] == "declined"

    # Every onward transition must be rejected.
    for ep in ("confirm", "cancel", "complete", "no-show"):
        r = await client.post(f"/bookings/{booking_id}/{ep}", headers=_auth(token_b))
        assert r.status_code == 422, f"declined->{ep} should be 422, got {r.status_code}"


async def test_cancelled_is_terminal(client: AsyncClient) -> None:
    """Once cancelled from `proposed`, no transitions are accepted."""
    token_a, _, token_b, _, booking_id = await _proposed_booking(client, "cancelled_terminal")

    cancel_r = await client.post(f"/bookings/{booking_id}/cancel", headers=_auth(token_a))
    assert cancel_r.status_code == 200
    assert cancel_r.json()["status"] == "cancelled"

    for ep in ("confirm", "decline", "complete", "no-show"):
        r = await client.post(f"/bookings/{booking_id}/{ep}", headers=_auth(token_a))
        assert r.status_code == 422, f"cancelled->{ep} should be 422, got {r.status_code}"


async def test_completed_is_terminal(client: AsyncClient) -> None:
    """Once completed, no transitions are accepted."""
    token_a, _, token_b, _, booking_id = await _proposed_booking(client, "completed_terminal")

    # proposed -> confirmed -> completed
    await client.post(f"/bookings/{booking_id}/confirm", headers=_auth(token_b))
    complete_r = await client.post(f"/bookings/{booking_id}/complete", headers=_auth(token_a))
    assert complete_r.status_code == 200
    assert complete_r.json()["status"] == "completed"

    for ep in ("confirm", "decline", "cancel", "no-show"):
        r = await client.post(f"/bookings/{booking_id}/{ep}", headers=_auth(token_a))
        assert r.status_code == 422, f"completed->{ep} should be 422, got {r.status_code}"


async def test_no_show_is_terminal(client: AsyncClient) -> None:
    """Once marked no_show, no transitions are accepted."""
    token_a, _, token_b, _, booking_id = await _proposed_booking(client, "noshow_terminal")

    await client.post(f"/bookings/{booking_id}/confirm", headers=_auth(token_b))
    noshow_r = await client.post(f"/bookings/{booking_id}/no-show", headers=_auth(token_a))
    assert noshow_r.status_code == 200
    assert noshow_r.json()["status"] == "no_show"

    for ep in ("confirm", "decline", "cancel", "complete"):
        r = await client.post(f"/bookings/{booking_id}/{ep}", headers=_auth(token_a))
        assert r.status_code == 422, f"no_show->{ep} should be 422, got {r.status_code}"


async def test_confirmed_cannot_go_backwards(client: AsyncClient) -> None:
    """confirmed -> decline is not a legal transition."""
    token_a, _, token_b, _, booking_id = await _proposed_booking(client, "confirmed_backward")

    conf_r = await client.post(f"/bookings/{booking_id}/confirm", headers=_auth(token_b))
    assert conf_r.status_code == 200

    # Cannot un-confirm via decline.
    r = await client.post(f"/bookings/{booking_id}/decline", headers=_auth(token_b))
    assert r.status_code == 422


async def test_partner_cannot_cancel_proposed_booking(client: AsyncClient) -> None:
    """From `proposed`, only the proposer can cancel — the partner must decline."""
    token_a, _, token_b, _, booking_id = await _proposed_booking(client, "partner_cancel")

    # Partner attempts to cancel a still-proposed booking: only proposer may.
    r = await client.post(f"/bookings/{booking_id}/cancel", headers=_auth(token_b))
    assert r.status_code == 403


async def test_proposer_cannot_decline_own_booking(client: AsyncClient) -> None:
    """Only the partner may decline — the proposer must cancel."""
    token_a, _, token_b, _, booking_id = await _proposed_booking(client, "proposer_decline")

    r = await client.post(f"/bookings/{booking_id}/decline", headers=_auth(token_a))
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# match_id query filter — drives the chat-side "session proposal in this
# match" surface in mobile. Adding a filter beats client-side filtering by
# bandwidth and keeps the participant gate enforced at the SQL layer.
# ---------------------------------------------------------------------------


async def test_list_bookings_filters_by_match_id(client: AsyncClient) -> None:
    """Two matches owned by the same user; ?match_id= scopes to one match only."""
    token_a, uid_a = await _register(client, "book_mfilter_a@example.com")
    token_b, uid_b = await _register(client, "book_mfilter_b@example.com")
    token_c, uid_c = await _register(client, "book_mfilter_c@example.com")

    match_ab = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)
    match_ac = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_c, uid_c)

    create_ab = await client.post(
        "/bookings",
        json={**_BOOKING_PAYLOAD, "match_id": match_ab},
        headers=_auth(token_a),
    )
    booking_ab = create_ab.json()["id"]
    await client.post(
        "/bookings",
        json={**_BOOKING_PAYLOAD, "match_id": match_ac},
        headers=_auth(token_a),
    )

    # Without the filter, A sees both bookings.
    r_all = await client.get("/bookings", headers=_auth(token_a))
    assert r_all.json()["total"] == 2

    # Filtered to match_ab, A sees exactly the AB booking.
    r_ab = await client.get(f"/bookings?match_id={match_ab}", headers=_auth(token_a))
    assert r_ab.status_code == 200
    body = r_ab.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == booking_ab
    assert body["items"][0]["match_id"] == match_ab


async def test_list_bookings_match_filter_does_not_leak_to_non_participant(
    client: AsyncClient,
) -> None:
    """A non-participant filtering by an arbitrary match_id sees 0 bookings.

    Pins the participant gate at the SQL layer so a curious caller can't
    discover bookings on a match they have no role in.
    """
    token_a, uid_a = await _register(client, "book_mleak_a@example.com")
    token_b, uid_b = await _register(client, "book_mleak_b@example.com")
    token_c, _ = await _register(client, "book_mleak_c@example.com")

    match_ab = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)
    await client.post(
        "/bookings",
        json={**_BOOKING_PAYLOAD, "match_id": match_ab},
        headers=_auth(token_a),
    )

    r = await client.get(f"/bookings?match_id={match_ab}", headers=_auth(token_c))
    assert r.status_code == 200
    assert r.json()["total"] == 0


async def test_list_bookings_match_filter_combines_with_status(
    client: AsyncClient,
) -> None:
    """match_id + status compose: only proposed bookings in this match."""
    token_a, uid_a = await _register(client, "book_mstatus_a@example.com")
    token_b, uid_b = await _register(client, "book_mstatus_b@example.com")
    match_ab = await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)

    # Two bookings on the same match: one stays proposed, one gets confirmed.
    r1 = await client.post(
        "/bookings",
        json={
            **_BOOKING_PAYLOAD,
            "match_id": match_ab,
            "starts_at": "2030-04-01T09:00:00Z",
            "ends_at": "2030-04-01T10:00:00Z",
        },
        headers=_auth(token_a),
    )
    proposed_id = r1.json()["id"]
    r2 = await client.post(
        "/bookings",
        json={
            **_BOOKING_PAYLOAD,
            "match_id": match_ab,
            "starts_at": "2030-04-02T09:00:00Z",
            "ends_at": "2030-04-02T10:00:00Z",
        },
        headers=_auth(token_a),
    )
    confirmed_id = r2.json()["id"]
    await client.post(f"/bookings/{confirmed_id}/confirm", headers=_auth(token_b))

    r = await client.get(f"/bookings?match_id={match_ab}&status=proposed", headers=_auth(token_a))
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == proposed_id


# ---------------------------------------------------------------------------
# Time normalization (review F5). Every request bound is one absolute UTC
# instant before comparison, validation and storage. Offset-free values are
# legacy-client payloads and are read as UTC. Dates are relative to now so
# these never expire.
# ---------------------------------------------------------------------------


def _instant(value: str) -> datetime:
    """Parse a response timestamp. SQLite drops tzinfo on storage; the API
    stores UTC, so a naive value read back from SQLite is a UTC wall clock."""
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _future_day(days: int = 30) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).date().isoformat()


async def _booking_match(client: AsyncClient, tag: str) -> tuple[str, str]:
    token_a, uid_a = await _register(client, f"book_tz_{tag}_a@example.com")
    token_b, uid_b = await _register(client, f"book_tz_{tag}_b@example.com")
    return token_a, await _mutual_like_and_get_match_id(client, token_a, uid_a, token_b, uid_b)


async def _propose(client: AsyncClient, token: str, match_id: str, starts_at: str, ends_at: str):
    return await client.post(
        "/bookings",
        json={"match_id": match_id, "sport": "running", "starts_at": starts_at, "ends_at": ends_at},
        headers=_auth(token),
    )


async def test_equivalent_offsets_store_the_same_instant(client: AsyncClient) -> None:
    token, match_id = await _booking_match(client, "equiv")
    day = _future_day()
    utc = await _propose(client, token, match_id, f"{day}T09:00:00Z", f"{day}T10:00:00Z")
    sydney = await _propose(client, token, match_id, f"{day}T20:00:00+11:00", f"{day}T21:00:00+11:00")
    western = await _propose(client, token, match_id, f"{day}T04:00:00-05:00", f"{day}T05:00:00-05:00")
    assert {r.status_code for r in (utc, sydney, western)} == {201}
    expected = datetime.fromisoformat(f"{day}T09:00:00+00:00")
    for r in (utc, sydney, western):
        assert _instant(r.json()["starts_at"]) == expected
        assert _instant(r.json()["ends_at"]) == expected + timedelta(hours=1)
        # Read back through GET as well, not just the create response.
        stored = await client.get(f"/bookings/{r.json()['id']}", headers=_auth(token))
        assert _instant(stored.json()["starts_at"]) == expected


async def test_offset_free_legacy_payload_is_read_as_utc(client: AsyncClient) -> None:
    token, match_id = await _booking_match(client, "legacy")
    day = _future_day()
    r = await _propose(client, token, match_id, f"{day}T09:00:00", f"{day}T10:00:00")
    assert r.status_code == 201, r.text
    assert _instant(r.json()["starts_at"]) == datetime.fromisoformat(f"{day}T09:00:00+00:00")
    assert _instant(r.json()["ends_at"]) == datetime.fromisoformat(f"{day}T10:00:00+00:00")


async def test_mixed_naive_and_aware_bounds_compare_as_instants(client: AsyncClient) -> None:
    token, match_id = await _booking_match(client, "mixed")
    day = _future_day()
    # naive start (UTC) + aware end: valid one-hour session, not a 500.
    ok = await _propose(client, token, match_id, f"{day}T09:00:00", f"{day}T21:00:00+11:00")
    assert ok.status_code == 201, ok.text
    assert _instant(ok.json()["ends_at"]) - _instant(ok.json()["starts_at"]) == timedelta(hours=1)
    # aware start + naive end that is earlier as an instant.
    bad = await _propose(client, token, match_id, f"{day}T10:00:00Z", f"{day}T09:30:00")
    assert bad.status_code == 422
    assert bad.json()["detail"] == "ends_at must be after starts_at"


async def test_range_is_validated_on_instants_not_wall_clocks(client: AsyncClient) -> None:
    token, match_id = await _booking_match(client, "range")
    day = _future_day()
    # Wall clocks look backwards (20:00 → 09:30) but the instants are 09:00Z → 09:30Z.
    forward = await _propose(client, token, match_id, f"{day}T20:00:00+11:00", f"{day}T09:30:00Z")
    assert forward.status_code == 201, forward.text
    # Wall clocks look forwards (09:00 → 19:30) but 19:30+11:00 is 08:30Z, before 09:00Z.
    backward = await _propose(client, token, match_id, f"{day}T09:00:00Z", f"{day}T19:30:00+11:00")
    assert backward.status_code == 422
    equal = await _propose(client, token, match_id, f"{day}T09:00:00Z", f"{day}T20:00:00+11:00")
    assert equal.status_code == 422


async def test_sydney_midnight_crosses_the_utc_date(client: AsyncClient) -> None:
    token, match_id = await _booking_match(client, "midnight")
    day = datetime.fromisoformat(_future_day(40))
    next_day = (day + timedelta(days=1)).date().isoformat()
    # 00:30 Sydney (AEDT or AEST) on `next_day` is the previous UTC calendar day.
    r = await _propose(client, token, match_id, f"{next_day}T00:30:00+11:00", f"{next_day}T01:30:00+11:00")
    assert r.status_code == 201, r.text
    starts = _instant(r.json()["starts_at"])
    assert starts == datetime.fromisoformat(f"{next_day}T00:30:00+11:00")
    assert starts.date().isoformat() == day.date().isoformat()


async def test_past_check_uses_the_instant_for_every_form(client: AsyncClient) -> None:
    token, match_id = await _booking_match(client, "past")
    now = datetime.now(timezone.utc)

    def iso(instant: datetime, offset_hours: int) -> str:
        return instant.astimezone(timezone(timedelta(hours=offset_hours))).isoformat()

    two_hours_ago = now - timedelta(hours=2)
    # +14:00 makes the wall clock look 12 hours in the future; the instant is past.
    for start in (iso(two_hours_ago, 0), iso(two_hours_ago, 14), two_hours_ago.replace(tzinfo=None).isoformat()):
        r = await _propose(client, token, match_id, start, iso(now + timedelta(hours=1), 0))
        assert r.status_code == 422, (start, r.text)
        assert r.json()["detail"] == "starts_at cannot be more than 1 hour in the past"
    # Within the documented one-hour tolerance, expressed with a negative offset.
    recent = await _propose(
        client, token, match_id, iso(now - timedelta(minutes=30), -10), iso(now + timedelta(hours=1), 0)
    )
    assert recent.status_code == 201, recent.text
