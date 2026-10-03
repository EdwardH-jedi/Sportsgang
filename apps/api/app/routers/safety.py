from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.routers.auth import get_current_user
from app.schemas.safety import (
    BlockListResponse,
    BlockResponse,
    CreateReportRequest,
    ReportListResponse,
    ReportResponse,
)
from app.services import chat as chat_service
from app.services import safety as safety_service

router = APIRouter(tags=["safety"])


# ── Reports ──────────────────────────────────────────────────────────────────


@router.post("/reports", response_model=ReportResponse, status_code=201)
async def create_report(
    req: CreateReportRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReportResponse:
    return await safety_service.create_report(db, current_user.id, req)


@router.get("/reports/mine", response_model=ReportListResponse)
async def list_my_reports(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReportListResponse:
    """List the caller's submitted reports. Scoped to the authenticated user."""
    return await safety_service.list_my_reports(db, current_user.id)


# ── Blocks ───────────────────────────────────────────────────────────────────


@router.get("/blocks", response_model=BlockListResponse)
async def list_blocks(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BlockListResponse:
    return await safety_service.list_blocks(db, current_user.id)


@router.post("/blocks/{blocked_user_id}", response_model=BlockResponse, status_code=201)
async def block_user(
    blocked_user_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BlockResponse:
    block = await safety_service.block_user(db, current_user.id, blocked_user_id)
    # Already-open chat sockets between the pair must not outlive the block.
    await chat_service.close_pair_rooms(db, current_user.id, blocked_user_id)
    return block


@router.delete("/blocks/{blocked_user_id}", status_code=204)
async def unblock_user(
    blocked_user_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await safety_service.unblock_user(db, current_user.id, blocked_user_id)
