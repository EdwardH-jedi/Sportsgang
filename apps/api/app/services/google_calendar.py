"""
Google Calendar integration service.

OAuth flow (mobile-initiated):
  1. GET /users/me/google-calendar/auth-url  → returns {url} with a signed state
  2. Mobile opens URL in browser (expo-web-browser)
  3. Google redirects to GET /users/me/google-calendar/callback?code=...&state=...
  4. API verifies the state, exchanges code for tokens, stores them, returns an HTML success page
  5. GET /users/me/google-calendar/status confirms connection

OAuth state:
  The callback is unauthenticated (it is reached via a browser redirect from
  Google), so the user identity comes from ``state``. The state is a short-lived
  HS256 JWT signed with SECRET_KEY that carries the user id, a random nonce and
  an expiry, plus a dedicated audience so an ordinary access token cannot be
  replayed as a state. Tampered, expired or malformed states are rejected with
  400 before any token exchange happens.

Sync:
  - Only confirmed bookings are synced
  - POST /bookings/{id}/sync-google-calendar syncs for the calling user
  - update/cancel propagation via the same sync endpoint (idempotent by sync record)

Security notes:
  - access_token + refresh_token are encrypted at rest via ``EncryptedString``
    (see app/core/encryption.py and app/models/google_calendar.py)
  - Rotate the OAuth client secret regularly
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

import httpx
import jwt
from fastapi import HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import get_settings
from app.models.booking import Booking
from app.models.google_calendar import CalendarBookingSync, GoogleCalendarToken
from app.schemas.google_calendar import (
    GoogleCalendarStatus,
    SyncBookingResponse,
)

_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"
_SCOPES = "https://www.googleapis.com/auth/calendar.events"

# OAuth state: signed, expiring, audience-scoped JWT (see module docstring).
STATE_TTL = timedelta(minutes=10)
_STATE_AUDIENCE = "google-calendar-oauth-state"


# ---------------------------------------------------------------------------
# Auth URL
# ---------------------------------------------------------------------------


def build_auth_url(user_id: UUID) -> str:
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Calendar integration is not configured on this server.",
        )
    state = create_oauth_state(user_id)
    params = (
        f"client_id={settings.google_client_id}"
        f"&redirect_uri={settings.google_redirect_uri}"
        f"&response_type=code"
        f"&scope={_SCOPES}"
        f"&access_type=offline"
        f"&prompt=consent"
        f"&state={state}"
    )
    return f"{_GOOGLE_AUTH_URL}?{params}"


def create_oauth_state(user_id: UUID, *, ttl: timedelta = STATE_TTL) -> str:
    """Return a signed, expiring OAuth state bound to ``user_id``."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "aud": _STATE_AUDIENCE,
        "nonce": secrets.token_urlsafe(16),
        "iat": now,
        "exp": now + ttl,
    }
    return jwt.encode(payload, security.SECRET_KEY, algorithm=security.JWT_ALGORITHM)


def verify_oauth_state(state: str) -> UUID:
    """Verify signature, audience and expiry of an OAuth state; return the user id.

    Signature comparison is constant-time (PyJWT uses ``hmac.compare_digest``).
    Any failure raises 400 without revealing which check failed.
    """
    try:
        payload = jwt.decode(
            state,
            security.SECRET_KEY,
            algorithms=[security.JWT_ALGORITHM],
            audience=_STATE_AUDIENCE,
            options={"require": ["sub", "aud", "exp", "nonce"]},
        )
        return UUID(payload["sub"])
    except (jwt.PyJWTError, ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid state parameter")


# ---------------------------------------------------------------------------
# Token exchange + storage
# ---------------------------------------------------------------------------


async def handle_oauth_callback(
    db: AsyncSession,
    code: str,
    state: str,
) -> GoogleCalendarStatus:
    user_id = verify_oauth_state(state)
    settings = get_settings()

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to exchange code with Google.",
        )

    token_data = resp.json()
    access_token = token_data["access_token"]
    refresh_token = token_data.get("refresh_token", "")
    expires_in: int = token_data.get("expires_in", 3600)
    expiry = datetime.fromtimestamp(datetime.now(tz=timezone.utc).timestamp() + expires_in, tz=timezone.utc)

    # Upsert token record
    stmt = select(GoogleCalendarToken).where(GoogleCalendarToken.user_id == user_id)
    existing = (await db.execute(stmt)).scalar_one_or_none()

    if existing:
        existing.access_token = access_token
        if refresh_token:
            existing.refresh_token = refresh_token
        existing.token_expiry = expiry
    else:
        db.add(
            GoogleCalendarToken(
                user_id=user_id,
                access_token=access_token,
                refresh_token=refresh_token,
                token_expiry=expiry,
            )
        )

    await db.commit()
    return GoogleCalendarStatus(connected=True, calendar_id="primary")


# ---------------------------------------------------------------------------
# Status + disconnect
# ---------------------------------------------------------------------------


async def get_status(db: AsyncSession, user_id: UUID) -> GoogleCalendarStatus:
    configured = bool(get_settings().google_client_id)
    stmt = select(GoogleCalendarToken).where(GoogleCalendarToken.user_id == user_id)
    token = (await db.execute(stmt)).scalar_one_or_none()
    if token is None:
        return GoogleCalendarStatus(connected=False, configured=configured)
    return GoogleCalendarStatus(
        connected=True,
        calendar_id=token.calendar_id,
        connected_at=token.connected_at,
        configured=configured,
    )


async def disconnect(db: AsyncSession, user_id: UUID) -> None:
    stmt = select(GoogleCalendarToken).where(GoogleCalendarToken.user_id == user_id)
    token = (await db.execute(stmt)).scalar_one_or_none()
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Google Calendar is not connected.",
        )
    await db.delete(token)
    await db.commit()


# ---------------------------------------------------------------------------
# Token refresh
# ---------------------------------------------------------------------------


async def _ensure_fresh_token(token: GoogleCalendarToken) -> str:
    """Return a valid access token, refreshing if it has expired.

    Tokens are stored encrypted by the ``EncryptedString`` column type,
    so attribute access here yields plaintext directly.
    """
    now = datetime.now(tz=timezone.utc)
    expiry = token.token_expiry
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)

    if expiry > now:
        return token.access_token

    settings = get_settings()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _GOOGLE_TOKEN_URL,
            data={
                "refresh_token": token.refresh_token,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "grant_type": "refresh_token",
            },
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to refresh Google access token.",
        )

    data = resp.json()
    raw_access_token = data["access_token"]
    token.access_token = raw_access_token
    expires_in: int = data.get("expires_in", 3600)
    token.token_expiry = datetime.fromtimestamp(now.timestamp() + expires_in, tz=timezone.utc)
    return raw_access_token


# ---------------------------------------------------------------------------
# Booking → Google Calendar event
# ---------------------------------------------------------------------------


def _resolve_event_location(booking: Booking, venue: object | None) -> str:
    """
    Apply the location fallback chain Codex flagged:
      1. typed location on the booking (wins over venue)
      2. venue.name — venue.address|venue.area
      3. just venue.name
      4. ""
    Mirrors apps/mobile/src/lib/venueLocation.ts so calendar events render
    consistently whether the location was set by the composer or filled
    in here defensively.
    """
    typed = (booking.location or "").strip()
    if typed:
        return typed
    if venue is None:
        return ""
    detail = (getattr(venue, "address", None) or getattr(venue, "area", None) or "").strip()
    name = getattr(venue, "name", "")
    if not name:
        return ""
    return f"{name} — {detail}" if detail else name


def _booking_to_event(booking: Booking, partner_name: str, venue: object | None = None) -> dict:
    sport_label = "Gym" if booking.sport == "gym" else "Golf"
    summary = f"{sport_label} session with {partner_name}"
    description = booking.notes or ""
    return {
        "summary": summary,
        "location": _resolve_event_location(booking, venue),
        "description": description,
        "start": {
            "dateTime": booking.starts_at.isoformat(),
            "timeZone": "Australia/Sydney",
        },
        "end": {
            "dateTime": booking.ends_at.isoformat(),
            "timeZone": "Australia/Sydney",
        },
    }


async def sync_booking(
    db: AsyncSession,
    booking_id: UUID,
    user_id: UUID,
) -> SyncBookingResponse:
    """
    Create or update a Google Calendar event for a confirmed booking.
    Only the requesting user's calendar is touched.
    """
    # Fetch booking
    booking = (await db.execute(select(Booking).where(Booking.id == booking_id))).scalar_one_or_none()

    if booking is None or (booking.proposer_id != user_id and booking.partner_id != user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    if booking.status != "confirmed":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only confirmed bookings can be synced to Google Calendar.",
        )

    # Fetch token
    token_rec = (
        await db.execute(select(GoogleCalendarToken).where(GoogleCalendarToken.user_id == user_id))
    ).scalar_one_or_none()

    if token_rec is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Google Calendar is not connected. Connect first.",
        )

    access_token = await _ensure_fresh_token(token_rec)
    await db.commit()  # persist refreshed token

    # Resolve partner name (best-effort)
    from app.models.profile import UserProfile

    other_id = booking.partner_id if booking.proposer_id == user_id else booking.proposer_id
    partner_profile = (
        await db.execute(select(UserProfile).where(UserProfile.user_id == other_id))
    ).scalar_one_or_none()
    partner_name = partner_profile.display_name if partner_profile else "your partner"

    # Resolve the venue (if any) so a venue-only booking still ships a
    # meaningful location field to Google Calendar. Cheap one-row read.
    venue = None
    if booking.venue_id is not None:
        from app.models.venue import Venue

        venue = (await db.execute(select(Venue).where(Venue.id == booking.venue_id))).scalar_one_or_none()

    event_body = _booking_to_event(booking, partner_name, venue=venue)
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    calendar_id = token_rec.calendar_id

    # Check for existing sync record
    sync_stmt = select(CalendarBookingSync).where(
        and_(
            CalendarBookingSync.booking_id == booking_id,
            CalendarBookingSync.user_id == user_id,
        )
    )
    sync_rec = (await db.execute(sync_stmt)).scalar_one_or_none()

    async with httpx.AsyncClient() as client:
        if sync_rec and sync_rec.google_event_id:
            # Update existing event
            resp = await client.put(
                f"{_GOOGLE_CALENDAR_API}/calendars/{calendar_id}/events/{sync_rec.google_event_id}",
                json=event_body,
                headers=headers,
            )
            if resp.status_code == 404:
                # Event was deleted externally — create a new one
                resp = await client.post(
                    f"{_GOOGLE_CALENDAR_API}/calendars/{calendar_id}/events",
                    json=event_body,
                    headers=headers,
                )
        else:
            resp = await client.post(
                f"{_GOOGLE_CALENDAR_API}/calendars/{calendar_id}/events",
                json=event_body,
                headers=headers,
            )

    if resp.status_code not in (200, 201):
        if sync_rec:
            sync_rec.sync_status = "failed"
            await db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to write event to Google Calendar.",
        )

    google_event_id = resp.json()["id"]
    now = datetime.now(tz=timezone.utc)

    if sync_rec:
        sync_rec.google_event_id = google_event_id
        sync_rec.sync_status = "synced"
        sync_rec.last_synced_at = now
    else:
        db.add(
            CalendarBookingSync(
                booking_id=booking_id,
                user_id=user_id,
                google_event_id=google_event_id,
                sync_status="synced",
                last_synced_at=now,
            )
        )

    await db.commit()
    return SyncBookingResponse(
        booking_id=booking_id,
        google_event_id=google_event_id,
        sync_status="synced",
    )


async def cancel_calendar_event(
    db: AsyncSession,
    booking_id: UUID,
    user_id: UUID,
) -> None:
    """
    Delete the Google Calendar event when a booking is cancelled.
    Fails silently if no sync record exists or the event is already gone.
    """
    sync_stmt = select(CalendarBookingSync).where(
        and_(
            CalendarBookingSync.booking_id == booking_id,
            CalendarBookingSync.user_id == user_id,
        )
    )
    sync_rec = (await db.execute(sync_stmt)).scalar_one_or_none()
    if sync_rec is None:
        return

    token_rec = (
        await db.execute(select(GoogleCalendarToken).where(GoogleCalendarToken.user_id == user_id))
    ).scalar_one_or_none()
    if token_rec is None:
        return

    try:
        access_token = await _ensure_fresh_token(token_rec)
        await db.commit()
        async with httpx.AsyncClient() as client:
            await client.delete(
                f"{_GOOGLE_CALENDAR_API}/calendars/{token_rec.calendar_id}/events/{sync_rec.google_event_id}",
                headers={"Authorization": f"Bearer {access_token}"},
            )
    except Exception:
        pass  # best-effort; log in production

    sync_rec.sync_status = "cancelled"
    await db.commit()
