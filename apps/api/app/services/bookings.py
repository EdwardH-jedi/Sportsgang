from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.match import Match
from app.models.venue import Venue
from app.schemas.bookings import BookingListResponse, BookingResponse, CreateBookingRequest
from app.services import notifications as notif_service
from app.services import rank as rank_service
from app.services.matches import _build_partner_card
from app.services.venues import _to_response as _venue_to_response

# ---------------------------------------------------------------------------
# Status machine
# ---------------------------------------------------------------------------

# Maps (current_status, transition) → (allowed_by: "proposer" | "partner" | "either")
_TRANSITIONS: dict[tuple[str, str], str] = {
    ("proposed", "confirmed"): "partner",
    ("proposed", "declined"): "partner",
    ("proposed", "cancelled"): "proposer",
    ("confirmed", "cancelled"): "either",
    ("confirmed", "completed"): "either",
    ("confirmed", "no_show"): "either",
}


def _check_transition(
    booking: Booking,
    new_status: str,
    acting_user_id: UUID,
) -> None:
    key = (booking.status, new_status)
    allowed_by = _TRANSITIONS.get(key)
    if allowed_by is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot transition from '{booking.status}' to '{new_status}'",
        )
    if allowed_by == "partner" and acting_user_id != booking.partner_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the partner can perform this transition",
        )
    if allowed_by == "proposer" and acting_user_id != booking.proposer_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the proposer can perform this transition",
        )


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------


async def _get_booking_or_404(db: AsyncSession, booking_id: UUID) -> Booking:
    stmt = select(Booking).where(Booking.id == booking_id)
    b = (await db.execute(stmt)).scalar_one_or_none()
    if b is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return b


async def _assert_booking_participant(booking: Booking, user_id: UUID) -> None:
    if booking.proposer_id != user_id and booking.partner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")


async def _to_response(db: AsyncSession, booking: Booking, current_user_id: UUID) -> BookingResponse:
    other_id = booking.partner_id if booking.proposer_id == current_user_id else booking.proposer_id
    partner = await _build_partner_card(db, other_id, booking.sport)
    venue_payload = None
    if booking.venue_id is not None:
        venue = (await db.execute(select(Venue).where(Venue.id == booking.venue_id))).scalar_one_or_none()
        if venue is not None:
            venue_payload = _venue_to_response(venue, distance_km=None)
    return BookingResponse(
        id=booking.id,
        match_id=booking.match_id,
        proposer_id=booking.proposer_id,
        partner_id=booking.partner_id,
        sport=booking.sport,
        starts_at=booking.starts_at,
        ends_at=booking.ends_at,
        location=booking.location,
        notes=booking.notes,
        status=booking.status,
        created_at=booking.created_at,
        updated_at=booking.updated_at,
        partner=partner,
        venue=venue_payload,
    )


async def create_booking(
    db: AsyncSession,
    current_user_id: UUID,
    req: CreateBookingRequest,
) -> BookingResponse:
    # Validate the match exists and user is a participant
    m = (await db.execute(select(Match).where(Match.id == req.match_id))).scalar_one_or_none()
    if m is None or (m.user1_id != current_user_id and m.user2_id != current_user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    if m.status != "active":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot book on an inactive match",
        )

    partner_id = m.user2_id if m.user1_id == current_user_id else m.user1_id

    if req.starts_at >= req.ends_at:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="ends_at must be after starts_at",
        )

    # starts_at / ends_at arrive as aware UTC instants (CreateBookingRequest
    # normalizes them), so these comparisons and the stored values never
    # depend on the API process time zone.
    now = datetime.now(tz=timezone.utc)
    if req.starts_at < now - timedelta(hours=1):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="starts_at cannot be more than 1 hour in the past",
        )

    venue_id_to_persist = None
    if req.venue_id is not None:
        venue = (await db.execute(select(Venue).where(Venue.id == req.venue_id))).scalar_one_or_none()
        if venue is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Venue not found")
        if req.sport not in (venue.sport_tags or []):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Selected venue does not support this sport",
            )
        venue_id_to_persist = venue.id

    booking = Booking(
        match_id=req.match_id,
        proposer_id=current_user_id,
        partner_id=partner_id,
        sport=req.sport,
        starts_at=req.starts_at,
        ends_at=req.ends_at,
        location=req.location,
        venue_id=venue_id_to_persist,
        notes=req.notes,
        status="proposed",
    )
    db.add(booking)
    await db.flush()

    # Notify the partner that a booking has been proposed
    partner_card = await _build_partner_card(db, current_user_id, req.sport)
    await notif_service.schedule_booking_notification(
        db, booking, "proposal_received", partner_id, partner_card.display_name
    )

    await db.commit()
    await db.refresh(booking)
    return await _to_response(db, booking, current_user_id)


async def list_bookings(
    db: AsyncSession,
    current_user_id: UUID,
    limit: int = 20,
    offset: int = 0,
    statuses: list[str] | None = None,
    match_id: UUID | None = None,
) -> BookingListResponse:
    # Participant gate stays at the SQL layer so a non-participant filtering
    # by match_id can never see another match's bookings — the backend
    # remains source-of-truth for visibility regardless of mobile filters.
    participant_filter = or_(
        Booking.proposer_id == current_user_id,
        Booking.partner_id == current_user_id,
    )
    where_clauses = [participant_filter]
    if statuses is not None:
        where_clauses.append(Booking.status.in_(statuses))
    if match_id is not None:
        where_clauses.append(Booking.match_id == match_id)
    base_where = and_(*where_clauses)
    stmt = select(Booking).where(base_where).order_by(Booking.starts_at.asc()).offset(offset).limit(limit)
    bookings = list((await db.execute(stmt)).scalars().all())

    count_stmt = select(func.count()).select_from(Booking).where(base_where)
    total: int = (await db.execute(count_stmt)).scalar_one()

    items = [await _to_response(db, b, current_user_id) for b in bookings]
    return BookingListResponse(items=items, total=total, limit=limit, offset=offset)


async def get_booking(
    db: AsyncSession,
    booking_id: UUID,
    current_user_id: UUID,
) -> BookingResponse:
    b = await _get_booking_or_404(db, booking_id)
    await _assert_booking_participant(b, current_user_id)
    return await _to_response(db, b, current_user_id)


async def transition_booking(
    db: AsyncSession,
    booking_id: UUID,
    new_status: str,
    current_user_id: UUID,
) -> BookingResponse:
    b = await _get_booking_or_404(db, booking_id)
    await _assert_booking_participant(b, current_user_id)
    _check_transition(b, new_status, current_user_id)
    previous_status = b.status
    b.status = new_status

    # Sports Reputation hook: emit rank/honor events. Same DB session, no
    # commit here — the booking commit at the bottom of the function flushes
    # both the booking mutation and the new ledger rows atomically.
    await rank_service.record_booking_transition(db, b, previous_status, new_status, current_user_id)

    # Determine who to notify and what type of notification to send
    other_id = b.partner_id if b.proposer_id == current_user_id else b.proposer_id
    actor_card = await _build_partner_card(db, current_user_id, b.sport)

    notif_type_map = {
        "confirmed": "booking_confirmed",
        "declined": "booking_declined",
        "cancelled": "booking_cancelled",
    }
    notif_type = notif_type_map.get(new_status)
    if notif_type:
        await notif_service.schedule_booking_notification(db, b, notif_type, other_id, actor_card.display_name)

    # Schedule reminder when booking is confirmed
    if new_status == "confirmed":
        other_card = await _build_partner_card(db, other_id, b.sport)
        for recipient_id in (b.proposer_id, b.partner_id):
            # Each participant's reminder names the *other* participant
            partner_for_recipient = other_card if recipient_id == current_user_id else actor_card
            await notif_service.schedule_booking_notification(
                db, b, "reminder", recipient_id, partner_for_recipient.display_name
            )

    await db.commit()
    await db.refresh(b)
    return await _to_response(db, b, current_user_id)
