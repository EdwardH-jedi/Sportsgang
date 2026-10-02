from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

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
    upcoming: bool = Query(False, description="Only sessions starting now or later"),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventListResponse:
    return await events_service.list_events(
        db=db,
        current_user_id=current_user.id,
        mine=mine,
        sport=sport,
        mode=mode,
        upcoming=upcoming,
        limit=limit,
        offset=offset,
    )


@router.get("/{event_id}", response_model=EventDetail)
async def get_event(
    event_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventDetail:
    return await events_service.get_event(db, event_id, current_user.id)


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
