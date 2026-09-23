from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.geo import DEFAULT_RADIUS_KM, MAX_RADIUS_KM, MIN_RADIUS_KM, require_lat_lng_pair
from app.db.session import get_db
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.events import (
    AttendanceEntry,
    AttendanceListResponse,
    CreateEventRequest,
    EventDetail,
    EventListResponse,
    HostAttendanceUpdateRequest,
    SelfAttendanceRequest,
    UpdateEventRequest,
)
from app.services import events as events_service

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", response_model=EventDetail, status_code=status.HTTP_201_CREATED)
async def create_event(
    body: CreateEventRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventDetail:
    return await events_service.create_event(db, current_user.id, body)


@router.get("", response_model=EventListResponse)
async def list_events(
    mine: bool = Query(False, description="Only events the caller hosts or has joined"),
    sport: str | None = Query(None),
    mode: str | None = Query(None, description="casual or ranked"),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    # --- Group-run filters (all optional, additive) --------------------
    crew_id: UUID | None = Query(None, description="Only runs attached to this crew"),
    lat: float | None = Query(None, ge=-90.0, le=90.0),
    lng: float | None = Query(None, ge=-180.0, le=180.0),
    radius_km: float = Query(DEFAULT_RADIUS_KM, ge=MIN_RADIUS_KM, le=MAX_RADIUS_KM),
    starts_from: datetime | None = Query(None, alias="from", description="Only events starting at or after this time"),
    starts_to: datetime | None = Query(None, alias="to", description="Only events starting before this time"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventListResponse:
    require_lat_lng_pair(lat, lng)
    return await events_service.list_events(
        db=db,
        current_user_id=current_user.id,
        mine=mine,
        sport=sport,
        mode=mode,
        limit=limit,
        offset=offset,
        crew_id=crew_id,
        lat=lat,
        lng=lng,
        radius_km=radius_km,
        starts_from=starts_from,
        starts_to=starts_to,
    )


@router.get("/{event_id}", response_model=EventDetail)
async def get_event(
    event_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventDetail:
    return await events_service.get_event(db, event_id, current_user.id)


@router.patch("/{event_id}", response_model=EventDetail)
async def update_event(
    event_id: UUID,
    body: UpdateEventRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventDetail:
    return await events_service.update_event(db, event_id, current_user.id, body)


@router.post("/{event_id}/join", response_model=EventDetail)
async def join_event(
    event_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventDetail:
    return await events_service.join_event(db, event_id, current_user.id)


@router.post("/{event_id}/leave", response_model=EventDetail)
async def leave_event(
    event_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventDetail:
    return await events_service.leave_event(db, event_id, current_user.id)


@router.post("/{event_id}/cancel", response_model=EventDetail)
async def cancel_event(
    event_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventDetail:
    return await events_service.cancel_event(db, event_id, current_user.id)


@router.post("/{event_id}/complete", response_model=EventDetail)
async def complete_event(
    event_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventDetail:
    return await events_service.complete_event(db, event_id, current_user.id)


@router.get("/{event_id}/attendance", response_model=AttendanceListResponse)
async def get_event_attendance(
    event_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AttendanceListResponse:
    return await events_service.get_event_attendance(db, event_id, current_user.id)


@router.post("/{event_id}/attendance", response_model=AttendanceEntry)
async def host_update_attendance(
    event_id: UUID,
    body: HostAttendanceUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AttendanceEntry:
    return await events_service.host_update_attendance(db, event_id, current_user.id, body)


@router.post("/{event_id}/attendance/self", response_model=AttendanceEntry)
async def self_report_attendance(
    event_id: UUID,
    body: SelfAttendanceRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AttendanceEntry:
    return await events_service.self_report_attendance(db, event_id, current_user.id, body)
