from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.routers.auth import get_current_user
from app.schemas.bookings import BookingListResponse, BookingResponse, CreateBookingRequest
from app.services import bookings as bookings_service

router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.get("", response_model=BookingListResponse)
async def list_bookings(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: str | None = Query(None),
    match_id: UUID | None = Query(None),
    segment: Literal["upcoming", "pending", "past"] | None = Query(
        None, description="My Plans segment. Past is newest first."
    ),
    as_of: datetime | None = Query(None, description="Instant the segment is computed at (default: now)"),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookingListResponse:
    statuses = [s.strip() for s in status.split(",") if s.strip()] if status else None
    return await bookings_service.list_bookings(
        db, current_user.id, limit, offset, statuses, match_id, segment=segment, as_of=as_of
    )


@router.post("", response_model=BookingResponse, status_code=201)
async def create_booking(
    req: CreateBookingRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookingResponse:
    return await bookings_service.create_booking(db, current_user.id, req)


@router.get("/{booking_id}", response_model=BookingResponse)
async def get_booking(
    booking_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookingResponse:
    return await bookings_service.get_booking(db, booking_id, current_user.id)


@router.post("/{booking_id}/confirm", response_model=BookingResponse)
async def confirm_booking(
    booking_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookingResponse:
    return await bookings_service.transition_booking(db, booking_id, "confirmed", current_user.id)


@router.post("/{booking_id}/decline", response_model=BookingResponse)
async def decline_booking(
    booking_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookingResponse:
    return await bookings_service.transition_booking(db, booking_id, "declined", current_user.id)


@router.post("/{booking_id}/cancel", response_model=BookingResponse)
async def cancel_booking(
    booking_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookingResponse:
    return await bookings_service.transition_booking(db, booking_id, "cancelled", current_user.id)


@router.post("/{booking_id}/complete", response_model=BookingResponse)
async def complete_booking(
    booking_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookingResponse:
    return await bookings_service.transition_booking(db, booking_id, "completed", current_user.id)


@router.post("/{booking_id}/no-show", response_model=BookingResponse)
async def no_show_booking(
    booking_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookingResponse:
    return await bookings_service.transition_booking(db, booking_id, "no_show", current_user.id)
