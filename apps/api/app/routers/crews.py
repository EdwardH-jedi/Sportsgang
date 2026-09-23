"""
Crew routes — persistent running groups (run-first redesign).

All routes require authentication. See :mod:`app.services.crews` for
the membership, blocking and privacy rules.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.geo import DEFAULT_RADIUS_KM, MAX_RADIUS_KM, MIN_RADIUS_KM, require_lat_lng_pair
from app.db.session import get_db
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.crews import (
    CreateCrewRequest,
    CrewDetail,
    CrewListResponse,
    LeaveCrewResponse,
    UpdateCrewRequest,
)
from app.services import crews as crews_service

router = APIRouter(prefix="/crews", tags=["crews"])


@router.get("", response_model=CrewListResponse)
async def list_crews(
    lat: float | None = Query(None, ge=-90.0, le=90.0),
    lng: float | None = Query(None, ge=-180.0, le=180.0),
    radius_km: float = Query(DEFAULT_RADIUS_KM, ge=MIN_RADIUS_KM, le=MAX_RADIUS_KM),
    sport: str | None = Query(None, min_length=1, max_length=30),
    q: str | None = Query(None, min_length=1, max_length=60, description="Case-insensitive match on name or area"),
    mine: bool = Query(False, description="Only crews the caller belongs to"),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CrewListResponse:
    require_lat_lng_pair(lat, lng)
    return await crews_service.list_crews(
        db,
        current_user.id,
        lat=lat,
        lng=lng,
        radius_km=radius_km,
        sport=sport,
        q=q,
        mine=mine,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=CrewDetail, status_code=status.HTTP_201_CREATED)
async def create_crew(
    body: CreateCrewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CrewDetail:
    return await crews_service.create_crew(db, current_user.id, body)


@router.get("/{crew_id}", response_model=CrewDetail)
async def get_crew(
    crew_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CrewDetail:
    return await crews_service.get_crew(db, crew_id, current_user.id)


@router.patch("/{crew_id}", response_model=CrewDetail)
async def update_crew(
    crew_id: UUID,
    body: UpdateCrewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CrewDetail:
    return await crews_service.update_crew(db, crew_id, current_user.id, body)


@router.delete("/{crew_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_crew(
    crew_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await crews_service.delete_crew(db, crew_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{crew_id}/join", response_model=CrewDetail)
async def join_crew(
    crew_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CrewDetail:
    return await crews_service.join_crew(db, crew_id, current_user.id)


@router.delete("/{crew_id}/membership", response_model=LeaveCrewResponse)
async def leave_crew(
    crew_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LeaveCrewResponse:
    return await crews_service.leave_crew(db, crew_id, current_user.id)
