from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

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
    offset: int = Query(0, ge=0, description="Legacy paging; ignored when cursor is sent"),
    cursor: str | None = Query(None, max_length=200, description="next_cursor from the previous page (running/golf)"),
    strict_pace: bool = Query(False, description="Running only: declared pace ranges must overlap"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DiscoveryFeedResponse:
    return await discovery_service.get_discovery_feed(
        db=db,
        current_user_id=current_user.id,
        sport=sport,
        limit=limit,
        offset=offset,
        cursor=cursor,
        strict_pace=strict_pace,
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
