"""Push notification token registration tests."""

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

# Import model modules for SQLAlchemy registration. `booking` is aliased so
# it doesn't shadow local `booking` test-instance variables (ruff F811).
from app.models import match, profile, user, chat  # noqa: F401
from app.models import booking as _booking_model  # noqa: F401
from app.models import google_calendar, notification, safety  # noqa: F401

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


async def _register(client: AsyncClient, email: str) -> tuple[str, str]:
    r = await client.post("/auth/register", json={"email": email, "password": "password123"})
    token = r.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    return token, me.json()["id"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _future_booking_times() -> dict[str, str]:
    """Keep delivery tests valid as the calendar advances."""
    start = datetime.now(timezone.utc) + timedelta(days=2)
    return {"starts_at": start.isoformat(), "ends_at": (start + timedelta(hours=1)).isoformat()}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_register_token_requires_auth(client: AsyncClient) -> None:
    r = await client.post(
        "/notifications/token",
        json={"token": "ExponentPushToken[abc123]", "platform": "ios"},
    )
    assert r.status_code in (401, 403)


async def test_register_token_returns_token_record(client: AsyncClient) -> None:
    token, _ = await _register(client, "notif_reg@example.com")
    r = await client.post(
        "/notifications/token",
        json={"token": "ExponentPushToken[testtoken1]", "platform": "ios"},
        headers=_auth(token),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["token"] == "ExponentPushToken[testtoken1]"
    assert body["platform"] == "ios"
    assert "id" in body


async def test_register_token_idempotent(client: AsyncClient) -> None:
    token, _ = await _register(client, "notif_idem@example.com")
    payload = {"token": "ExponentPushToken[idemptoken]", "platform": "ios"}
    r1 = await client.post("/notifications/token", json=payload, headers=_auth(token))
    r2 = await client.post("/notifications/token", json=payload, headers=_auth(token))
    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["id"] == r2.json()["id"]


async def test_unregister_token_requires_auth(client: AsyncClient) -> None:
    r = await client.delete("/notifications/token/00000000-0000-0000-0000-000000000001")
    assert r.status_code in (401, 403)


async def test_unregister_token(client: AsyncClient) -> None:
    token, _ = await _register(client, "notif_unreg@example.com")
    reg_r = await client.post(
        "/notifications/token",
        json={"token": "ExponentPushToken[unregtoken]", "platform": "android"},
        headers=_auth(token),
    )
    token_id = reg_r.json()["id"]

    r = await client.delete(f"/notifications/token/{token_id}", headers=_auth(token))
    assert r.status_code == 204


async def test_process_notifications_endpoint(client: AsyncClient) -> None:
    r = await client.post("/internal/process-notifications")
    assert r.status_code == 200
    body = r.json()
    assert "processed" in body
    assert "failed" in body


async def test_notification_scheduled_on_booking_proposal(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Creating a booking enqueues a proposal_received notification for the partner."""
    # Stub the Expo delivery so processing never makes a real outbound POST to
    # exp.host — keeps the test hermetic and deterministic in a network-
    # restricted sandbox/CI. Mirrors test_process_marks_sent_on_success.
    import app.services.notifications as notif_svc

    async def _always_ok(token, title, body, data) -> bool:
        return True

    monkeypatch.setattr(notif_svc, "_send_expo_push", _always_ok)

    token_a, uid_a = await _register(client, "notif_book_a@example.com")
    token_b, uid_b = await _register(client, "notif_book_b@example.com")

    # Register push token for partner B
    await client.post(
        "/notifications/token",
        json={"token": "ExponentPushToken[partnerB]", "platform": "ios"},
        headers=_auth(token_b),
    )

    # Create a match
    await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_b, "action": "like", "sport": "gym"},
        headers=_auth(token_a),
    )
    r = await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_a, "action": "like", "sport": "gym"},
        headers=_auth(token_b),
    )
    match_id = r.json()["match_id"]

    # Propose a booking — should schedule a notification for partner B.
    # Use a dynamic future window: the booking service rejects a starts_at in
    # the past, so a hard-coded date turns into a 422 the moment the wall clock
    # passes it (a previously hard-coded 2026-06-01 did exactly that). now()+2d
    # keeps the proposal valid indefinitely.
    from datetime import datetime, timedelta, timezone

    starts_at = (datetime.now(timezone.utc) + timedelta(days=2)).replace(microsecond=0)
    ends_at = starts_at + timedelta(hours=1)
    book_r = await client.post(
        "/bookings",
        json={
            "match_id": match_id,
            "sport": "gym",
            "starts_at": starts_at.isoformat(),
            "ends_at": ends_at.isoformat(),
        },
        headers=_auth(token_a),
    )
    assert book_r.status_code == 201

    # Process pending notifications (delivery will succeed vacuously since expo_push_url
    # is empty in test config, but the event should be found and attempted)
    proc_r = await client.post("/internal/process-notifications")
    assert proc_r.status_code == 200


# ---------------------------------------------------------------------------
# _ensure_utc + naive-datetime hardening path
# ---------------------------------------------------------------------------


def test_ensure_utc_attaches_utc_to_naive() -> None:
    from datetime import datetime, timezone

    from app.services.notifications import _ensure_utc

    naive = datetime(2026, 4, 19, 12, 0, 0)
    out = _ensure_utc(naive)
    assert out.tzinfo is timezone.utc
    assert out.replace(tzinfo=None) == naive


def test_ensure_utc_converts_non_utc_aware() -> None:
    from datetime import datetime, timedelta, timezone

    from app.services.notifications import _ensure_utc

    sydney = timezone(timedelta(hours=10))
    aware = datetime(2026, 4, 19, 22, 0, 0, tzinfo=sydney)
    out = _ensure_utc(aware)
    assert out.tzinfo is timezone.utc
    assert out == datetime(2026, 4, 19, 12, 0, 0, tzinfo=timezone.utc)


async def test_process_pending_notifications_handles_naive_scheduled_at() -> None:
    """Regression: DB returning a naive scheduled_at must not crash processing."""
    from datetime import datetime, timedelta
    from types import SimpleNamespace
    from uuid import uuid4

    from app.services import notifications as notif_svc

    # Naive datetime simulates what SQLite (and some driver combos) return
    # for a DateTime(timezone=True) column.
    naive_scheduled = datetime.utcnow() - timedelta(hours=72)

    event = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        booking_id=None,
        notification_type="proposal_received",
        title="t",
        body="b",
        push_token=None,  # triggers the no-token aging path that subtracts datetimes
        scheduled_at=naive_scheduled,
        sent_at=None,
        failed_reason=None,
    )

    class _Result:
        def scalars(self):
            class _S:
                def all(inner_self):
                    return [event]

            return _S()

        def scalar_one_or_none(self):
            return None

    class _FakeDB:
        async def execute(self, _stmt):
            return _Result()

        async def commit(self):
            return None

    result = await notif_svc.process_pending_notifications(_FakeDB())
    # No TypeError, and >48h-old no-token event is marked failed
    assert result.failed == 1
    assert event.failed_reason == "no_push_token_after_48h"


# ---------------------------------------------------------------------------
# _render unit tests  (pure function, no DB)
# ---------------------------------------------------------------------------


def test_render_capitalises_sport():
    from app.services.notifications import _render

    result = _render("You have a {sport} session", partner="Alex", sport="gym")
    assert "Gym" in result


def test_render_substitutes_partner():
    from app.services.notifications import _render

    result = _render("{partner} wants to book", partner="Jordan", sport="golf")
    assert "Jordan" in result
    assert "{partner}" not in result


# ---------------------------------------------------------------------------
# schedule_booking_notification unit tests  (in-process, no HTTP)
# ---------------------------------------------------------------------------


async def test_schedule_immediate_notification_sets_scheduled_at_to_now():
    """proposal_received notifications are scheduled immediately."""
    from datetime import datetime, timedelta, timezone
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, MagicMock

    from app.services.notifications import schedule_booking_notification

    # db.execute is awaited by production code; db.add is called synchronously.
    # Using MagicMock as the base keeps db.add sync, so the production call
    # does not produce a "coroutine was never awaited" warning.
    db = MagicMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))

    # Duck-typed booking — schedule_booking_notification only reads id, sport,
    # starts_at. Avoids SQLAlchemy declarative instrumentation on Booking.__new__.
    booking = SimpleNamespace(
        id=None,
        sport="gym",
        starts_at=datetime.now(tz=timezone.utc) + timedelta(days=7),
    )

    before = datetime.now(tz=timezone.utc)
    await schedule_booking_notification(db, booking, "proposal_received", None, "Alex")
    after = datetime.now(tz=timezone.utc)

    db.add.assert_called_once()
    event = db.add.call_args[0][0]
    assert before <= event.scheduled_at <= after


async def test_schedule_reminder_is_24h_before_starts_at():
    """Reminder notifications are scheduled 24 h before starts_at."""
    from datetime import datetime, timedelta, timezone
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, MagicMock

    from app.services.notifications import schedule_booking_notification

    db = MagicMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))

    starts = datetime.now(tz=timezone.utc) + timedelta(days=3)
    booking = SimpleNamespace(id=None, sport="tennis", starts_at=starts)

    await schedule_booking_notification(db, booking, "reminder", None, "Sam")

    db.add.assert_called_once()
    event = db.add.call_args[0][0]
    expected = starts - timedelta(hours=24)
    diff = abs((event.scheduled_at - expected).total_seconds())
    assert diff < 1, f"scheduled_at {event.scheduled_at} not close to {expected}"


async def test_schedule_reminder_skipped_when_starts_at_in_past():
    """No NotificationEvent is added when starts_at is already past the 24 h window."""
    from datetime import datetime, timedelta, timezone
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, MagicMock

    from app.services.notifications import schedule_booking_notification

    db = MagicMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))

    booking = SimpleNamespace(
        id=None,
        sport="gym",
        starts_at=datetime.now(tz=timezone.utc) - timedelta(hours=1),
    )

    await schedule_booking_notification(db, booking, "reminder", None, "Lee")
    db.add.assert_not_called()


# ---------------------------------------------------------------------------
# Token reassignment
# ---------------------------------------------------------------------------


async def test_token_reassigned_to_new_user(client: AsyncClient) -> None:
    """Registering a token already held by user A under user B transfers ownership."""
    token_a, uid_a = await _register(client, "notif_reassign_a@example.com")
    token_b, uid_b = await _register(client, "notif_reassign_b@example.com")

    shared_push = "ExponentPushToken[shared-device]"

    r1 = await client.post(
        "/notifications/token",
        json={"token": shared_push, "platform": "ios"},
        headers=_auth(token_a),
    )
    assert r1.status_code == 201
    record_id = r1.json()["id"]

    r2 = await client.post(
        "/notifications/token",
        json={"token": shared_push, "platform": "ios"},
        headers=_auth(token_b),
    )
    assert r2.status_code == 201
    # Same DB row, but now owned by user B
    assert r2.json()["id"] == record_id


# ---------------------------------------------------------------------------
# Transition notifications
# ---------------------------------------------------------------------------


async def _setup_match_and_booking(client: AsyncClient) -> tuple[str, str, str, str, str]:
    """Register two users, mutual-like to create a match, propose a booking.
    Returns (token_a, uid_a, token_b, uid_b, booking_id).
    """
    import uuid

    suffix = uuid.uuid4().hex[:8]
    token_a, uid_a = await _register(client, f"notif_trans_a_{suffix}@example.com")
    token_b, uid_b = await _register(client, f"notif_trans_b_{suffix}@example.com")

    await client.put("/users/me/profile", json={"display_name": "User A"}, headers=_auth(token_a))
    await client.put("/users/me/profile", json={"display_name": "User B"}, headers=_auth(token_b))

    await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_b, "action": "like", "sport": "gym"},
        headers=_auth(token_a),
    )
    r = await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_a, "action": "like", "sport": "gym"},
        headers=_auth(token_b),
    )
    match_id = r.json()["match_id"]

    from datetime import datetime, timedelta, timezone

    starts_at = (datetime.now(timezone.utc) + timedelta(days=2)).replace(microsecond=0)
    ends_at = starts_at + timedelta(hours=1)
    book_r = await client.post(
        "/bookings",
        json={
            "match_id": match_id,
            "sport": "gym",
            "starts_at": starts_at.isoformat().replace("+00:00", "Z"),
            "ends_at": ends_at.isoformat().replace("+00:00", "Z"),
        },
        headers=_auth(token_a),
    )
    assert book_r.status_code == 201
    return token_a, uid_a, token_b, uid_b, book_r.json()["id"]


async def test_confirm_transition_schedules_booking_confirmed_notification(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token_a, uid_a, token_b, uid_b, booking_id = await _setup_match_and_booking(client)

    scheduled: list[tuple] = []

    async def _capture(db, booking, notif_type, recipient_id, partner_name):
        scheduled.append((notif_type, str(recipient_id)))

    import app.services.bookings as bookings_svc

    monkeypatch.setattr(bookings_svc.notif_service, "schedule_booking_notification", _capture)

    r = await client.post(
        f"/bookings/{booking_id}/confirm",
        headers=_auth(token_b),
    )
    assert r.status_code == 200

    notif_types = [t for t, _ in scheduled]
    assert "booking_confirmed" in notif_types
    # Reminders scheduled for both participants
    assert notif_types.count("reminder") == 2


async def test_decline_transition_schedules_booking_declined_notification(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token_a, uid_a, token_b, uid_b, booking_id = await _setup_match_and_booking(client)

    scheduled: list[tuple] = []

    async def _capture(db, booking, notif_type, recipient_id, partner_name):
        scheduled.append((notif_type, str(recipient_id)))

    import app.services.bookings as bookings_svc

    monkeypatch.setattr(bookings_svc.notif_service, "schedule_booking_notification", _capture)

    r = await client.post(
        f"/bookings/{booking_id}/decline",
        headers=_auth(token_b),
    )
    assert r.status_code == 200
    assert any(t == "booking_declined" for t, _ in scheduled)


async def test_cancel_transition_schedules_booking_cancelled_notification(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token_a, uid_a, token_b, uid_b, booking_id = await _setup_match_and_booking(client)

    scheduled: list[tuple] = []

    async def _capture(db, booking, notif_type, recipient_id, partner_name):
        scheduled.append((notif_type, str(recipient_id)))

    import app.services.bookings as bookings_svc

    monkeypatch.setattr(bookings_svc.notif_service, "schedule_booking_notification", _capture)

    r = await client.post(
        f"/bookings/{booking_id}/cancel",
        headers=_auth(token_a),
    )
    assert r.status_code == 200
    assert any(t == "booking_cancelled" for t, _ in scheduled)


# ---------------------------------------------------------------------------
# process_pending_notifications delivery behaviour
# ---------------------------------------------------------------------------


async def test_process_marks_sent_on_success(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Successful Expo delivery increments processed count and marks sent_at."""
    import app.services.notifications as notif_svc

    async def _always_ok(token, title, body, data) -> bool:
        return True

    monkeypatch.setattr(notif_svc, "_send_expo_push", _always_ok)

    token_a, uid_a = await _register(client, "notif_proc_ok_a@example.com")
    token_b, uid_b = await _register(client, "notif_proc_ok_b@example.com")

    await client.post(
        "/notifications/token",
        json={"token": "ExponentPushToken[proc-ok-b]", "platform": "ios"},
        headers=_auth(token_b),
    )

    await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_b, "action": "like", "sport": "gym"},
        headers=_auth(token_a),
    )
    await client.put("/users/me/profile", json={"display_name": "OK A"}, headers=_auth(token_a))
    r = await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_a, "action": "like", "sport": "gym"},
        headers=_auth(token_b),
    )
    match_id = r.json()["match_id"]

    book_r = await client.post(
        "/bookings",
        json={
            "match_id": match_id,
            "sport": "gym",
            **_future_booking_times(),
        },
        headers=_auth(token_a),
    )
    assert book_r.status_code == 201, book_r.text

    proc_r = await client.post("/internal/process-notifications")
    assert proc_r.status_code == 200
    body = proc_r.json()
    assert body["processed"] >= 1
    assert body["failed"] == 0


async def test_process_marks_failed_on_delivery_error(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Failed Expo delivery increments failed count."""
    import app.services.notifications as notif_svc

    async def _always_fail(token, title, body, data) -> bool:
        return False

    monkeypatch.setattr(notif_svc, "_send_expo_push", _always_fail)

    token_a, uid_a = await _register(client, "notif_proc_fail_a@example.com")
    token_b, uid_b = await _register(client, "notif_proc_fail_b@example.com")

    await client.post(
        "/notifications/token",
        json={"token": "ExponentPushToken[proc-fail-b]", "platform": "ios"},
        headers=_auth(token_b),
    )
    await client.put("/users/me/profile", json={"display_name": "Fail A"}, headers=_auth(token_a))

    await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_b, "action": "like", "sport": "gym"},
        headers=_auth(token_a),
    )
    r = await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_a, "action": "like", "sport": "gym"},
        headers=_auth(token_b),
    )
    match_id = r.json()["match_id"]

    book_r = await client.post(
        "/bookings",
        json={
            "match_id": match_id,
            "sport": "gym",
            **_future_booking_times(),
        },
        headers=_auth(token_a),
    )
    assert book_r.status_code == 201, book_r.text

    proc_r = await client.post("/internal/process-notifications")
    assert proc_r.status_code == 200
    body = proc_r.json()
    assert body["failed"] >= 1


async def test_process_skips_already_sent_events(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Running process-notifications twice must not re-send already-sent events."""
    import app.services.notifications as notif_svc

    call_count = 0

    async def _count_calls(token, title, body, data) -> bool:
        nonlocal call_count
        call_count += 1
        return True

    monkeypatch.setattr(notif_svc, "_send_expo_push", _count_calls)

    token_a, uid_a = await _register(client, "notif_dedup_a@example.com")
    token_b, uid_b = await _register(client, "notif_dedup_b@example.com")

    await client.post(
        "/notifications/token",
        json={"token": "ExponentPushToken[dedup-b]", "platform": "ios"},
        headers=_auth(token_b),
    )
    await client.put("/users/me/profile", json={"display_name": "Dedup A"}, headers=_auth(token_a))

    await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_b, "action": "like", "sport": "gym"},
        headers=_auth(token_a),
    )
    r = await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_a, "action": "like", "sport": "gym"},
        headers=_auth(token_b),
    )
    match_id = r.json()["match_id"]

    book_r = await client.post(
        "/bookings",
        json={
            "match_id": match_id,
            "sport": "gym",
            **_future_booking_times(),
        },
        headers=_auth(token_a),
    )
    assert book_r.status_code == 201, book_r.text

    await client.post("/internal/process-notifications")
    first_count = call_count

    await client.post("/internal/process-notifications")
    # No new calls on second run
    assert call_count == first_count


# ---------------------------------------------------------------------------
# INTERNAL_API_TOKEN hardening for /internal/*
# ---------------------------------------------------------------------------


def _fake_settings(*, app_env: str, internal_api_token: str):
    from types import SimpleNamespace

    return SimpleNamespace(app_env=app_env, internal_api_token=internal_api_token)


def test_validate_internal_api_token_config_raises_in_staging_when_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Boot validator: staging/prod must refuse to start without a configured secret."""
    from app.routers import notifications as notif_router

    monkeypatch.setattr(
        notif_router,
        "get_settings",
        lambda: _fake_settings(app_env="staging", internal_api_token="   "),
    )
    with pytest.raises(RuntimeError, match="INTERNAL_API_TOKEN must be set"):
        notif_router.validate_internal_api_token_config()


def test_validate_internal_api_token_config_passes_in_local_when_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Boot validator: local env is allowed to run without the shared secret."""
    from app.routers import notifications as notif_router

    monkeypatch.setattr(
        notif_router,
        "get_settings",
        lambda: _fake_settings(app_env="local", internal_api_token=""),
    )
    # Should not raise.
    notif_router.validate_internal_api_token_config()


async def test_process_notifications_rejects_wrong_internal_token_in_staging(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Staging + secret configured + wrong X-Internal-Token header -> 401."""
    from app.routers import notifications as notif_router

    monkeypatch.setattr(
        notif_router,
        "get_settings",
        lambda: _fake_settings(app_env="staging", internal_api_token="correct-secret"),
    )

    r = await client.post(
        "/internal/process-notifications",
        headers={"X-Internal-Token": "wrong-secret"},
    )
    assert r.status_code == 401
    assert "Invalid internal API token" in r.json()["detail"]


async def test_process_notifications_accepts_correct_internal_token_in_staging(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Staging + secret configured + correct X-Internal-Token header -> 200."""
    from app.routers import notifications as notif_router

    monkeypatch.setattr(
        notif_router,
        "get_settings",
        lambda: _fake_settings(app_env="staging", internal_api_token="correct-secret"),
    )

    r = await client.post(
        "/internal/process-notifications",
        headers={"X-Internal-Token": "correct-secret"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "processed" in body
    assert "failed" in body


async def test_process_notifications_rejects_missing_header_when_secret_unset_in_staging(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Staging + secret NOT configured -> 503 rather than silently allowing traffic."""
    from app.routers import notifications as notif_router

    monkeypatch.setattr(
        notif_router,
        "get_settings",
        lambda: _fake_settings(app_env="staging", internal_api_token=""),
    )

    r = await client.post("/internal/process-notifications")
    assert r.status_code == 503
    assert "Internal API token is not configured" in r.json()["detail"]
