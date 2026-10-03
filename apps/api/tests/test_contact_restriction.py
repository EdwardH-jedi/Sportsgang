"""Blocking restricts contact on every server boundary, in both directions.

Contract: docs/run-golf-v2/CONTRACTS.md §8. A block (either direction) or an
inactive account makes new contact between the pair fail with 403 and the
single direction-neutral message; nothing is written. Existing bookings stay
readable and withdrawable; chat history is kept but hidden from both until an
unblock. Real-PostgreSQL lock/race and live WebSocket checks live in
tests_integration/test_contact_restriction.py.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app
from app.models.booking import Booking
from app.models.chat import Message
from app.models.match import DiscoveryAction, Match
from app.models.notification import NotificationEvent
from app.models.user import User
from app.schemas.chat import MessageResponse
from app.services import chat as chat_service
from app.services import notifications as notif_service
from app.services.safety import CONTACT_UNAVAILABLE

_engine = create_async_engine("sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False})
_Session = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)


@pytest.fixture(scope="module", autouse=True)
async def create_tables():
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with _Session() as session:
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


_counter = 0


async def _register(client: AsyncClient, tag: str) -> tuple[dict[str, str], str]:
    global _counter
    _counter += 1
    r = await client.post(
        "/auth/register", json={"email": f"cr-{tag}-{_counter}@example.com", "password": "password123"}
    )
    assert r.status_code == 201, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    me = await client.get("/auth/me", headers=headers)
    return headers, me.json()["id"]


async def _matched_pair(client: AsyncClient) -> tuple[dict, str, dict, str, str]:
    a, a_id = await _register(client, "a")
    b, b_id = await _register(client, "b")
    await client.post("/discovery/actions", json={"target_user_id": b_id, "action": "like", "sport": "gym"}, headers=a)
    r = await client.post(
        "/discovery/actions", json={"target_user_id": a_id, "action": "like", "sport": "gym"}, headers=b
    )
    assert r.json()["match_created"] is True
    return a, a_id, b, b_id, r.json()["match_id"]


def _proposal(match_id: str) -> dict:
    start = datetime.now(timezone.utc) + timedelta(days=2)
    return {
        "match_id": match_id,
        "sport": "gym",
        "starts_at": start.isoformat(),
        "ends_at": (start + timedelta(hours=1)).isoformat(),
    }


async def _count(model, *where) -> int:
    async with _Session() as s:
        return (await s.execute(select(func.count()).select_from(model).where(*where))).scalar_one()


def _assert_restricted(r) -> None:
    assert r.status_code == 403, r.text
    assert r.json()["detail"] == CONTACT_UNAVAILABLE


@pytest.mark.parametrize("blocker", ["a", "b"])
async def test_block_either_way_denies_messages_both_ways_and_keeps_history(client: AsyncClient, blocker: str) -> None:
    a, a_id, b, b_id, match_id = await _matched_pair(client)
    r = await client.post(f"/matches/{match_id}/messages", json={"body": "before the block"}, headers=a)
    assert r.status_code == 201
    first_id = r.json()["id"]

    if blocker == "a":
        assert (await client.post(f"/blocks/{b_id}", headers=a)).status_code == 201
    else:
        assert (await client.post(f"/blocks/{a_id}", headers=b)).status_code == 201

    for headers in (a, b):
        _assert_restricted(await client.post(f"/matches/{match_id}/messages", json={"body": "after"}, headers=headers))
        _assert_restricted(await client.get(f"/matches/{match_id}/messages", headers=headers))
        listed = (await client.get("/matches", headers=headers)).json()
        assert match_id not in [m["id"] for m in listed["items"]]
        assert listed["total"] == 0
    # History is retained, not deleted; the denied sends wrote nothing.
    assert await _count(Message, Message.match_id == UUID(match_id)) == 1

    unblocker, target = (a, b_id) if blocker == "a" else (b, a_id)
    assert (await client.delete(f"/blocks/{target}", headers=unblocker)).status_code == 204
    history = await client.get(f"/matches/{match_id}/messages", headers=b)
    assert history.status_code == 200
    assert [m["id"] for m in history.json()["items"]] == [first_id]
    assert (await client.post(f"/matches/{match_id}/messages", json={"body": "again"}, headers=b)).status_code == 201
    assert match_id in [m["id"] for m in (await client.get("/matches", headers=a)).json()["items"]]


@pytest.mark.parametrize("blocker", ["a", "b"])
async def test_block_denies_new_proposals_and_confirmation_but_keeps_commitments(
    client: AsyncClient, blocker: str
) -> None:
    a, a_id, b, b_id, match_id = await _matched_pair(client)
    pending = await client.post("/bookings", json=_proposal(match_id), headers=a)
    confirmed = await client.post("/bookings", json=_proposal(match_id), headers=a)
    assert pending.status_code == confirmed.status_code == 201
    assert (await client.post(f"/bookings/{confirmed.json()['id']}/confirm", headers=b)).status_code == 200
    bookings_before = await _count(Booking, Booking.match_id == UUID(match_id))
    notifications_before = await _count(NotificationEvent)

    blocker_headers, blocked_id = (a, b_id) if blocker == "a" else (b, a_id)
    assert (await client.post(f"/blocks/{blocked_id}", headers=blocker_headers)).status_code == 201

    for headers in (a, b):
        _assert_restricted(await client.post("/bookings", json=_proposal(match_id), headers=headers))
    # The partner can no longer accept the pending proposal...
    _assert_restricted(await client.post(f"/bookings/{pending.json()['id']}/confirm", headers=b))
    assert await _count(Booking, Booking.match_id == UUID(match_id)) == bookings_before
    assert await _count(NotificationEvent) == notifications_before

    # ...but both still see their commitments and can withdraw from them.
    for headers in (a, b):
        r = await client.get(f"/bookings?match_id={match_id}", headers=headers)
        assert r.status_code == 200 and r.json()["total"] == bookings_before
        assert (await client.get(f"/bookings/{confirmed.json()['id']}", headers=headers)).status_code == 200
    assert (await client.post(f"/bookings/{pending.json()['id']}/decline", headers=b)).json()["status"] == "declined"
    assert (await client.post(f"/bookings/{confirmed.json()['id']}/cancel", headers=a)).json()["status"] == "cancelled"


@pytest.mark.parametrize("action", ["like", "pass", "save"])
async def test_discovery_actions_toward_a_restricted_person_are_refused(client: AsyncClient, action: str) -> None:
    a, a_id = await _register(client, "act-a")
    b, b_id = await _register(client, "act-b")
    assert (await client.post(f"/blocks/{a_id}", headers=b)).status_code == 201

    for actor, target in ((a, b_id), (b, a_id)):
        _assert_restricted(
            await client.post(
                "/discovery/actions", json={"target_user_id": target, "action": action, "sport": "gym"}, headers=actor
            )
        )
    assert await _count(DiscoveryAction, DiscoveryAction.actor_id.in_([UUID(a_id), UUID(b_id)])) == 0


async def test_mutual_like_after_block_creates_no_match(client: AsyncClient) -> None:
    a, a_id = await _register(client, "ml-a")
    b, b_id = await _register(client, "ml-b")
    r = await client.post(
        "/discovery/actions", json={"target_user_id": b_id, "action": "like", "sport": "gym"}, headers=a
    )
    assert r.status_code == 200
    assert (await client.post(f"/blocks/{b_id}", headers=a)).status_code == 201
    _assert_restricted(
        await client.post(
            "/discovery/actions", json={"target_user_id": a_id, "action": "like", "sport": "gym"}, headers=b
        )
    )
    assert await _count(Match, Match.user1_id.in_([UUID(a_id), UUID(b_id)])) == 0


async def test_discovery_action_on_unknown_user_is_404(client: AsyncClient) -> None:
    a, _ = await _register(client, "unknown")
    r = await client.post(
        "/discovery/actions",
        json={"target_user_id": "00000000-0000-0000-0000-0000000000ff", "action": "like", "sport": "gym"},
        headers=a,
    )
    assert r.status_code == 404


async def test_inactive_partner_is_not_contactable(client: AsyncClient) -> None:
    a, _, _, b_id, match_id = await _matched_pair(client)
    async with _Session() as s:
        await s.execute(update(User).where(User.id == UUID(b_id)).values(is_active=False))
        await s.commit()
    _assert_restricted(await client.post(f"/matches/{match_id}/messages", json={"body": "hi"}, headers=a))
    _assert_restricted(await client.post("/bookings", json=_proposal(match_id), headers=a))
    assert (await client.get("/matches", headers=a)).json()["total"] == 0


async def test_challenges_respect_the_block(client: AsyncClient) -> None:
    a, a_id = await _register(client, "ch-a")
    b, b_id = await _register(client, "ch-b")
    pending = await client.post(
        "/challenges", json={"opponent_user_id": a_id, "sport": "tennis", "area": "Newtown"}, headers=b
    )
    assert pending.status_code == 201, pending.text
    assert (await client.post(f"/blocks/{b_id}", headers=a)).status_code == 201

    _assert_restricted(
        await client.post(
            "/challenges", json={"opponent_user_id": b_id, "sport": "tennis", "area": "Newtown"}, headers=a
        )
    )
    _assert_restricted(await client.post(f"/challenges/{pending.json()['id']}/accept", headers=a))
    assert (await client.post(f"/challenges/{pending.json()['id']}/decline", headers=a)).status_code == 200


async def test_reporting_a_blocked_person_still_works(client: AsyncClient) -> None:
    a, _ = await _register(client, "rep-a")
    _, b_id = await _register(client, "rep-b")
    assert (await client.post(f"/blocks/{b_id}", headers=a)).status_code == 201
    r = await client.post("/reports", json={"reported_user_id": b_id, "reason": "harassment"}, headers=a)
    assert r.status_code == 201, r.text


async def test_message_is_not_pushed_once_the_pair_is_restricted(client: AsyncClient, monkeypatch) -> None:
    a, _, _, b_id, match_id = await _matched_pair(client)
    sent = await client.post(f"/matches/{match_id}/messages", json={"body": "pre-block"}, headers=a)
    pushed: list[dict] = []
    closed: list[str] = []

    async def _broadcast(room: str, data: dict) -> None:
        pushed.append(data)

    async def _close(room: str, code: int) -> None:
        closed.append(room)

    monkeypatch.setattr(chat_service.connections, "broadcast", _broadcast)
    monkeypatch.setattr(chat_service.connections, "close_room", _close)
    # The block commits between the message's commit and its push.
    assert (await client.post(f"/blocks/{b_id}", headers=a)).status_code == 201
    async with _Session() as s:
        assert await chat_service.deliver_message(s, MessageResponse.model_validate(sent.json())) is False
    assert pushed == []
    assert match_id in closed


async def test_queued_proposal_notice_is_not_pushed_after_a_block(client: AsyncClient, monkeypatch) -> None:
    a, _, _, b_id, match_id = await _matched_pair(client)
    proposal = await client.post("/bookings", json=_proposal(match_id), headers=a)
    assert proposal.status_code == 201
    assert (await client.post(f"/blocks/{b_id}", headers=a)).status_code == 201

    pushes: list[str] = []

    async def _send(token: str, title: str, body: str, data: dict) -> bool:
        pushes.append(data["type"])
        return True

    monkeypatch.setattr(notif_service, "_send_expo_push", _send)
    monkeypatch.setattr(notif_service, "_get_latest_push_token", AsyncMock(return_value="ExponentPushToken[test]"))
    async with _Session() as s:
        await notif_service.process_pending_notifications(s)
        row = (
            await s.execute(
                select(NotificationEvent).where(
                    NotificationEvent.booking_id == UUID(proposal.json()["id"]),
                    NotificationEvent.notification_type == "proposal_received",
                )
            )
        ).scalar_one()
    assert "proposal_received" not in pushes
    assert row.sent_at is None and row.failed_reason == "contact_restricted"
