"""
Push notification service using the Expo push notification API.

Immediate notifications are sent on booking state transitions.
Reminders are scheduled 24 h before confirmed bookings and processed
by the POST /internal/process-notifications worker endpoint.

Production notes:
  - Replace Expo push with direct APNs/FCM for production volume
  - Add exponential back-off on delivery failures
  - Add deduplication to prevent double-sends on retries
"""

from __future__ import annotations

import asyncio
import contextlib
from datetime import datetime, timedelta, timezone
from uuid import UUID

import httpx
from sqlalchemy import and_, select, text, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.booking import Booking
from app.models.notification import NotificationEvent, PushToken
from app.schemas.notifications import (
    ProcessNotificationsResult,
    PushTokenResponse,
    RegisterPushTokenRequest,
)
from app.services import safety

# Map booking status transition → (title, body template)
_NOTIFICATION_COPY: dict[str, tuple[str, str]] = {
    "proposal_received": ("New session proposal", "{partner} wants to book a {sport} session with you."),
    "booking_confirmed": ("Session confirmed!", "Your {sport} session with {partner} is confirmed."),
    "booking_declined": ("Session declined", "{partner} declined your {sport} session proposal."),
    "booking_cancelled": ("Session cancelled", "Your {sport} session with {partner} has been cancelled."),
    "reminder": ("Session tomorrow", "Don't forget your {sport} session with {partner} tomorrow."),
}


# ---------------------------------------------------------------------------
# Token registration
# ---------------------------------------------------------------------------


async def register_push_token(
    db: AsyncSession,
    user_id: UUID,
    req: RegisterPushTokenRequest,
) -> PushTokenResponse:
    # Upsert: if token already exists for any user, reassign to this user
    stmt = select(PushToken).where(PushToken.token == req.token)
    existing = (await db.execute(stmt)).scalar_one_or_none()

    if existing:
        existing.user_id = user_id
        existing.platform = req.platform
        await db.commit()
        await db.refresh(existing)
        return PushTokenResponse.model_validate(existing)

    token = PushToken(user_id=user_id, token=req.token, platform=req.platform)
    db.add(token)
    await db.commit()
    await db.refresh(token)
    return PushTokenResponse.model_validate(token)


async def unregister_push_token(
    db: AsyncSession,
    user_id: UUID,
    token_id: UUID,
) -> None:
    stmt = select(PushToken).where(and_(PushToken.id == token_id, PushToken.user_id == user_id))
    token = (await db.execute(stmt)).scalar_one_or_none()
    if token:
        await db.delete(token)
        await db.commit()


# ---------------------------------------------------------------------------
# Scheduling
# ---------------------------------------------------------------------------


async def _get_latest_push_token(db: AsyncSession, user_id: UUID) -> str | None:
    stmt = select(PushToken).where(PushToken.user_id == user_id).order_by(PushToken.created_at.desc()).limit(1)
    token = (await db.execute(stmt)).scalar_one_or_none()
    return token.token if token else None


def _ensure_utc(dt: datetime) -> datetime:
    # SQLite (and some driver/dialect combos) can hand back naive datetimes
    # even for timezone=True columns. Treat naive values as UTC — notification
    # timestamps are always persisted as UTC by this service.
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _render(template: str, *, partner: str, sport: str) -> str:
    return template.format(partner=partner, sport=sport.capitalize())


async def schedule_booking_notification(
    db: AsyncSession,
    booking: Booking,
    notification_type: str,
    recipient_id: UUID,
    partner_name: str,
) -> None:
    """Enqueue a notification event for immediate or future delivery."""
    title_tpl, body_tpl = _NOTIFICATION_COPY.get(notification_type, ("Protin update", "You have a new update."))
    title = _render(title_tpl, partner=partner_name, sport=booking.sport)
    body = _render(body_tpl, partner=partner_name, sport=booking.sport)
    push_token = await _get_latest_push_token(db, recipient_id)

    now = datetime.now(tz=timezone.utc)
    if notification_type == "reminder":
        # Send 24 h before starts_at
        starts = booking.starts_at
        if starts.tzinfo is None:
            starts = starts.replace(tzinfo=timezone.utc)
        scheduled_at = starts - timedelta(hours=24)
        if scheduled_at <= now:
            return  # Too late to schedule a useful reminder
    else:
        scheduled_at = now

    db.add(
        NotificationEvent(
            user_id=recipient_id,
            booking_id=booking.id,
            notification_type=notification_type,
            title=title,
            body=body,
            push_token=push_token,
            scheduled_at=scheduled_at,
        )
    )
    # Caller must commit


# ---------------------------------------------------------------------------
# Delivery
# ---------------------------------------------------------------------------


async def _send_expo_push(token: str, title: str, body: str, data: dict) -> bool:
    settings = get_settings()
    if not settings.expo_push_url:
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                settings.expo_push_url,
                json={"to": token, "title": title, "body": body, "data": data},
                headers={"Accept": "application/json", "Content-Type": "application/json"},
            )
        return resp.status_code == 200
    except Exception:
        return False


# A proposal push is contact (CONTRACTS.md §8). Its dispatch holds the pair's
# contact lock from the restriction check through the provider call, in the
# API's /internal endpoint and in the separate worker process alike (the lock
# lives in PostgreSQL), so a block either commits first — the notice is never
# sent — or waits until the call returns. These bounds keep that wait short:
PROVIDER_TIMEOUT_SECONDS = 10.0  # the whole provider call, not one HTTP phase
CONTACT_LOCK_TIMEOUT = "5s"  # PostgreSQL lock_timeout for taking the pair lock


def _is_lock_timeout(exc: DBAPIError) -> bool:
    orig = exc.orig
    codes = {getattr(orig, "sqlstate", None), getattr(orig, "pgcode", None)}
    codes.add(getattr(getattr(orig, "__cause__", None), "sqlstate", None))
    return "55P03" in codes  # lock_not_available


# Event states (review MA-C). `failed_reason` doubles as the ownership marker,
# so no column is added:
#   pending      sent_at NULL, failed_reason NULL — due events are picked from these
#   unconfirmed  failed_reason = UNCONFIRMED — owned by one dispatch, committed
#                before the provider is called
#   then         sent (sent_at set, failed_reason NULL) | contact_restricted |
#                delivery_failed | no_push_token_after_48h | pending again (no
#                token yet, or the dispatch stopped before the provider call)
# A dispatch interrupted once the provider call has started — timeout,
# cancellation, a crash, or a failed commit after the provider accepted —
# stays unconfirmed. It is not retried, because the provider may already have
# delivered it; an operator can requeue it by clearing failed_reason.
UNCONFIRMED = "delivery_unconfirmed"


def _pending(event_id: UUID):
    return and_(
        NotificationEvent.id == event_id,
        NotificationEvent.sent_at.is_(None),
        NotificationEvent.failed_reason.is_(None),
    )


async def _claim(db: AsyncSession, event_id: UUID) -> bool:
    """Own one still-pending event: mark it unconfirmed and commit (review MA-C).

    The conditional UPDATE is evaluated on the current row, so of two
    processors (worker, internal endpoint) only one claims it; the other waits
    for that commit, re-reads the row and gets nothing. An owned event drops
    out of every processor's due query.
    """
    stmt = (
        update(NotificationEvent)
        .where(_pending(event_id))
        .values(failed_reason=UNCONFIRMED)
        .execution_options(synchronize_session=False)
    )
    claimed = (await db.execute(stmt)).rowcount == 1
    await db.commit()
    return claimed


async def _settle(db: AsyncSession, event_id: UUID, **values) -> None:
    """Move an owned event to its next state; the caller commits."""
    stmt = (
        update(NotificationEvent)
        .where(NotificationEvent.id == event_id, NotificationEvent.failed_reason == UNCONFIRMED)
        .values(**values)
        .execution_options(synchronize_session=False)
    )
    await db.execute(stmt)


async def _release(db: AsyncSession, event_id: UUID) -> None:
    """Return an owned event to pending after a failure before the provider call."""
    await db.rollback()
    await _settle(db, event_id, failed_reason=None)
    await db.commit()


async def _dispatch(db: AsyncSession, event_id: UUID, now: datetime) -> str:
    """Try one due event; returns "sent", "failed", "pending" or "skipped". The caller commits.

    The claim is its own transaction and holds no lock afterwards. The
    dispatch transaction then takes, for a proposal, the pair's contact lock
    (users rows) and writes the event row last — the order account deletion
    uses (user row, then cascaded event rows) — so the two cannot deadlock.
    """
    if not await _claim(db, event_id):
        return "skipped"  # another processor owns it, or it is already settled
    try:
        stmt = select(NotificationEvent).where(NotificationEvent.id == event_id)
        event = (await db.execute(stmt.execution_options(populate_existing=True))).scalar_one_or_none()
        if event is None:
            return "skipped"  # deleted with its account

        # A proposal notice is not pushed once the pair is restricted (the
        # proposal itself stays readable in My Plans). Status notices about an
        # existing booking — confirmed, declined, cancelled, reminder — still go.
        if event.notification_type == "proposal_received" and event.booking_id is not None:
            pair = (
                await db.execute(select(Booking.proposer_id, Booking.partner_id).where(Booking.id == event.booking_id))
            ).one_or_none()
            if pair is not None:
                if db.get_bind().dialect.name == "postgresql":
                    await db.execute(text("SELECT set_config('lock_timeout', :t, true)"), {"t": CONTACT_LOCK_TIMEOUT})
                if not await safety.lock_contact(db, pair.proposer_id, pair.partner_id):
                    await _settle(db, event_id, failed_reason="contact_restricted")
                    return "failed"

        # Re-resolve push token in case user re-registered since scheduling
        fresh_token = await _get_latest_push_token(db, event.user_id)
        token = fresh_token or event.push_token

        if not token:
            age_hours = (now - _ensure_utc(event.scheduled_at)).total_seconds() / 3600
            if age_hours > 48:
                await _settle(db, event_id, failed_reason="no_push_token_after_48h")
                return "failed"
            await _settle(db, event_id, failed_reason=None)
            return "pending"  # retry on next cycle

        data = {"type": event.notification_type, "bookingId": str(event.booking_id) if event.booking_id else None}
        title, body = event.title, event.body
    except BaseException:
        # Nothing was sent: hand the event back. If this fails too, it stays
        # unconfirmed (not retried) and the original error propagates.
        with contextlib.suppress(Exception):
            await _release(db, event_id)
        raise

    try:
        success = await asyncio.wait_for(_send_expo_push(token, title, body, data), timeout=PROVIDER_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        return "failed"  # stays unconfirmed: the provider may have accepted it

    if success:
        await _settle(db, event_id, sent_at=datetime.now(tz=timezone.utc), failed_reason=None)
        return "sent"
    await _settle(db, event_id, failed_reason="delivery_failed")
    return "failed"


async def process_pending_notifications(
    db: AsyncSession,
) -> ProcessNotificationsResult:
    """
    Send all due (scheduled_at <= now, sent_at = NULL) notification events.
    Intended to be called by a cron job or an internal worker endpoint; both
    may run at once.

    Each event is claimed (see UNCONFIRMED) and dispatched in its own
    transactions, committed before the next event, so overlapping processors
    invoke the provider at most once per event and a proposal's contact lock
    is held for that one dispatch only. If the pair lock is not free within
    CONTACT_LOCK_TIMEOUT, the cycle stops: that event and the rest stay
    pending for the next run, unsent.

    Not exactly-once: a provider call whose outcome is not recorded leaves
    the event unconfirmed rather than sending it again, so an interrupted
    notice may be lost but is never blindly repeated. Stronger guarantees
    need an idempotency key the provider honours.
    """
    now = datetime.now(tz=timezone.utc)
    stmt = (
        select(NotificationEvent.id)
        .where(
            and_(
                NotificationEvent.scheduled_at <= now,
                NotificationEvent.sent_at.is_(None),
                NotificationEvent.failed_reason.is_(None),
            )
        )
        .order_by(NotificationEvent.scheduled_at, NotificationEvent.id)
    )
    event_ids = list((await db.execute(stmt)).scalars().all())
    await db.commit()  # end the read; each event below gets its own transaction

    processed = 0
    failed = 0

    for event_id in event_ids:
        try:
            outcome = await _dispatch(db, event_id, now)
        except DBAPIError as exc:
            if not _is_lock_timeout(exc):
                raise
            await db.rollback()
            break
        await db.commit()
        if outcome == "sent":
            processed += 1
        elif outcome == "failed":
            failed += 1

    return ProcessNotificationsResult(processed=processed, failed=failed)
