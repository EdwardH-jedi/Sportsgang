from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.match import Match
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.chat import MessageListResponse, MessageResponse, SendMessageRequest
from app.services import chat as chat_service
from app.services import safety

router = APIRouter(tags=["chat"])


# ─── HTTP endpoints ───────────────────────────────────────────────────────────


@router.get("/matches/{match_id}/messages", response_model=MessageListResponse)
async def list_messages(
    match_id: UUID,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageListResponse:
    return await chat_service.list_messages(db, match_id, current_user.id, limit, offset)


@router.post("/matches/{match_id}/messages", response_model=MessageResponse, status_code=201)
async def send_message(
    match_id: UUID,
    body: SendMessageRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    msg = await chat_service.send_message(db, match_id, current_user.id, body.body)
    await chat_service.deliver_message(db, msg)
    return msg


# ─── WebSocket endpoint ───────────────────────────────────────────────────────


@router.websocket("/matches/{match_id}/ws")
async def ws_chat(
    match_id: UUID,
    websocket: WebSocket,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Real-time message stream for a match room.

    Auth: pass ``?token=<jwt>`` as a query parameter. Admission matches the
    HTTP endpoints: an invalid token or a missing/inactive account closes
    with 1008 (HTTP 401); a non-participant, or a pair whose contact is
    restricted (block in either direction), closes with 4003 (HTTP 403).
    Blocking closes the pair's open sockets, and every push re-checks the
    restriction. Once connected, the server pushes new messages as JSON
    objects whenever the partner sends via the HTTP POST endpoint. Clients
    may send any text frame to keep the connection alive; those frames are
    discarded.
    """
    try:
        user_id = decode_access_token(token)
    except (jwt.PyJWTError, ValueError):
        await websocket.accept()
        await websocket.close(code=1008)
        return

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None or not user.is_active:
        await websocket.accept()
        await websocket.close(code=1008)
        return

    m = (await db.execute(select(Match).where(Match.id == match_id))).scalar_one_or_none()
    if (
        m is None
        or (m.user1_id != user_id and m.user2_id != user_id)
        or await safety.is_contact_restricted(db, user_id, chat_service.partner_of(m, user_id))
    ):
        await websocket.accept()
        await websocket.close(code=chat_service.WS_CLOSE_FORBIDDEN)
        return
    # Don't hold this session's transaction open for the socket's lifetime.
    await db.rollback()

    room = str(match_id)
    await chat_service.connections.connect(room, websocket)
    try:
        while True:
            await websocket.receive_text()  # discard keep-alive pings from client
    except WebSocketDisconnect:
        pass
    finally:
        chat_service.connections.disconnect(room, websocket)
