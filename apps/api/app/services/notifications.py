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

from datetime import datetime, timedelta, timezone
from uuid import UUID

import httpx
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.booking import Booking
from app.models.notification import NotificationEvent, PushToken
from app.schemas.notifications import (
    ProcessNotificationsResult,
    PushTokenResponse,
    RegisterPushTokenRequest,
)

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
    title_tpl, body_tpl = _NOTIFICATION_COPY.get(notification_type, ("SportsGang update", "You have a new update."))
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


async def process_pending_notifications(
    db: AsyncSession,
) -> ProcessNotificationsResult:
    """
    Send all due (scheduled_at <= now, sent_at = NULL) notification events.
    Intended to be called by a cron job or an internal worker endpoint.
    """
    now = datetime.now(tz=timezone.utc)
    stmt = select(NotificationEvent).where(
        and_(
            NotificationEvent.scheduled_at <= now,
            NotificationEvent.sent_at.is_(None),
            NotificationEvent.failed_reason.is_(None),
        )
    )
    events = list((await db.execute(stmt)).scalars().all())

    processed = 0
    failed = 0

    for event in events:
        # Re-resolve push token in case user re-registered since scheduling
        fresh_token = await _get_latest_push_token(db, event.user_id)
        token = fresh_token or event.push_token

        if not token:
            age_hours = (now - _ensure_utc(event.scheduled_at)).total_seconds() / 3600
            if age_hours > 48:
                event.failed_reason = "no_push_token_after_48h"
                failed += 1
            # else: skip silently, retry on next cycle
            continue

        success = await _send_expo_push(
            token,
            event.title,
            event.body,
            {
                "type": event.notification_type,
                "bookingId": str(event.booking_id) if event.booking_id else None,
            },
        )

        if success:
            event.sent_at = datetime.now(tz=timezone.utc)
            processed += 1
        else:
            event.failed_reason = "delivery_failed"
            failed += 1

    await db.commit()
    return ProcessNotificationsResult(processed=processed, failed=failed)
