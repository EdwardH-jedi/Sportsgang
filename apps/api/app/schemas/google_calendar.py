from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.core.time import AuditInstant


class GoogleCalendarConnectRequest(BaseModel):
    """Exchange code returned by Google OAuth for stored tokens."""

    code: str
    redirect_uri: str


class GoogleCalendarStatus(BaseModel):
    connected: bool
    calendar_id: str | None = None
    connected_at: AuditInstant | None = None
    # ``configured`` reports whether the server has Google OAuth credentials
    # set in the environment. Mobile uses it to hide the Connect button when
    # the integration is unavailable in a given build, so tapping does not
    # produce a 503 from /auth-url.
    configured: bool = False


class CalendarBookingSyncStatus(BaseModel):
    booking_id: UUID
    user_id: UUID
    google_event_id: str
    sync_status: str
    last_synced_at: datetime | None

    model_config = {"from_attributes": True}


class SyncBookingResponse(BaseModel):
    booking_id: UUID
    google_event_id: str
    sync_status: str
