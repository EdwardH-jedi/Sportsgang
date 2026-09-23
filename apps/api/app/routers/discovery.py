from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.geo import DEFAULT_RADIUS_KM, MAX_RADIUS_KM, MIN_RADIUS_KM, require_lat_lng_pair
from app.db.session import get_db
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.discovery import DiscoveryFeedResponse, RecordActionRequest, RecordActionResponse
from app.services import discovery as discovery_service

router = APIRouter(prefix="/discovery", tags=["discovery"])


@router.get("", response_model=DiscoveryFeedResponse)
async def get_discovery_feed(
    sport: str = Query(..., description="Sport filter: gym, golf, tennis, or running"),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    # Optional geo filter (run-first). Without lat/lng the feed is
    # byte-for-byte the v1.0 behaviour. With them, candidates without a
    # home location or outside radius_km are excluded, the feed is
    # sorted nearest-first and each card carries a coarse distance_km.
    lat: float | None = Query(None, ge=-90.0, le=90.0),
    lng: float | None = Query(None, ge=-180.0, le=180.0),
    radius_km: float = Query(DEFAULT_RADIUS_KM, ge=MIN_RADIUS_KM, le=MAX_RADIUS_KM),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DiscoveryFeedResponse:
    require_lat_lng_pair(lat, lng)
    return await discovery_service.get_discovery_feed(
        db=db,
        current_user_id=current_user.id,
        sport=sport,
        limit=limit,
        offset=offset,
        lat=lat,
        lng=lng,
        radius_km=radius_km,
    )


@router.post("/actions", response_model=RecordActionResponse)
async def record_action(
    body: RecordActionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RecordActionResponse:
    return await discovery_service.record_action(
        db=db,
        actor_id=current_user.id,
        target_user_id=body.target_user_id,
        action=body.action,
        sport=body.sport,
    )
