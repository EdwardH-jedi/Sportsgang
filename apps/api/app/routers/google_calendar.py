from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.routers.auth import get_current_user
from app.schemas.google_calendar import (
    GoogleCalendarStatus,
    SyncBookingResponse,
)
from app.services import google_calendar as gcal_service

router = APIRouter(prefix="/users/me/google-calendar", tags=["google-calendar"])


@router.get("/auth-url")
async def get_auth_url(
    current_user=Depends(get_current_user),
) -> dict[str, str]:
    """Returns the Google OAuth URL. Mobile opens this in expo-web-browser."""
    url = gcal_service.build_auth_url(current_user.id)
    return {"url": url}


@router.get("/callback", response_class=HTMLResponse, include_in_schema=False)
async def oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    """
    Google redirects here after the user grants consent.
    Stores the tokens and returns a minimal HTML success page.
    This endpoint is not authenticated — user identity comes from the state parameter.
    """
    await gcal_service.handle_oauth_callback(db, code, state)
    html = """
    <html>
      <body style="font-family:sans-serif;text-align:center;padding-top:80px">
        <h2>Google Calendar connected.</h2>
        <p>You can close this window and return to SportsGang.</p>
      </body>
    </html>
    """
    return HTMLResponse(content=html)


@router.get("/status", response_model=GoogleCalendarStatus)
async def get_status(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GoogleCalendarStatus:
    return await gcal_service.get_status(db, current_user.id)


@router.delete("/disconnect", status_code=204)
async def disconnect(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await gcal_service.disconnect(db, current_user.id)


# ── Booking sync ─────────────────────────────────────────────────────────────
# Placed here (under google-calendar prefix conceptually) but routes via bookings
# for resource clarity. The router is registered without a prefix so these
# sit at /bookings/{booking_id}/sync-google-calendar.

booking_sync_router = APIRouter(tags=["google-calendar"])


@booking_sync_router.post(
    "/bookings/{booking_id}/sync-google-calendar",
    response_model=SyncBookingResponse,
)
async def sync_booking_to_calendar(
    booking_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SyncBookingResponse:
    """Sync a confirmed booking to the current user's Google Calendar."""
    return await gcal_service.sync_booking(db, booking_id, current_user.id)
