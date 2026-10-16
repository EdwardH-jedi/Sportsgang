from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.match import Match
from app.routers.auth import get_current_user
from app.schemas.chat import MessageListResponse, MessageResponse, SendMessageRequest
from app.services import chat as chat_service

router = APIRouter(tags=["chat"])


# ─── WebSocket connection manager ────────────────────────────────────────────


class _ConnectionManager:
    """Manages active WebSocket connections grouped by match room."""

    def __init__(self) -> None:
        self._rooms: dict[str, list[WebSocket]] = {}

    async def connect(self, room: str, ws: WebSocket) -> None:
        await ws.accept()
        self._rooms.setdefault(room, []).append(ws)

    def disconnect(self, room: str, ws: WebSocket) -> None:
        conns = self._rooms.get(room, [])
        if ws in conns:
            conns.remove(ws)

    async def broadcast(self, room: str, data: dict) -> None:
        for ws in list(self._rooms.get(room, [])):
            try:
                await ws.send_json(data)
            except Exception:
                pass


_manager = _ConnectionManager()


# ─── HTTP endpoints ───────────────────────────────────────────────────────────


@router.get("/matches/{match_id}/messages", response_model=MessageListResponse)
async def list_messages(
    match_id: UUID,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    latest: bool = Query(False, description="Return the newest page instead of the oldest."),
    before: UUID | None = Query(None, description="Message id; return messages older than it."),
    after: UUID | None = Query(None, description="Message id; return messages newer than it."),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageListResponse:
    """List messages oldest-first within the page.

    Without ``latest``/``before``/``after`` this is the original offset page
    from the start of history. The cursor modes page by ``(created_at, id)``
    and cannot be combined with each other or with ``offset``.
    """
    modes = sum([latest, before is not None, after is not None])
    if modes == 0:
        return await chat_service.list_messages(db, match_id, current_user.id, limit, offset)
    if modes > 1 or offset:
        raise HTTPException(status_code=422, detail="Use only one of latest, before, after, and no offset.")
    return await chat_service.list_messages_keyset(
        db, match_id, current_user.id, limit, before=before, after=after
    )


@router.post("/matches/{match_id}/messages", response_model=MessageResponse, status_code=201)
async def send_message(
    match_id: UUID,
    body: SendMessageRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    msg = await chat_service.send_message(db, match_id, current_user.id, body.body)
    await _manager.broadcast(
        str(match_id),
        {
            "id": str(msg.id),
            "matchId": str(msg.match_id),
            "senderId": str(msg.sender_id),
            "body": msg.body,
            "createdAt": msg.created_at.isoformat(),
        },
    )
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

    Auth: pass ``?token=<jwt>`` as a query parameter.
    The endpoint validates the token and confirms the caller is a match participant
    before accepting the connection.  Once connected, the server pushes new
    messages as JSON objects whenever the partner sends via the HTTP POST endpoint.
    Clients may send any text frame to keep the connection alive; those frames are
    discarded.
    """
    try:
        user_id = decode_access_token(token)
    except (jwt.PyJWTError, ValueError):
        await websocket.accept()
        await websocket.close(code=1008)
        return

    m = (await db.execute(select(Match).where(Match.id == match_id))).scalar_one_or_none()
    if m is None or (m.user1_id != user_id and m.user2_id != user_id):
        await websocket.accept()
        await websocket.close(code=4003)
        return

    room = str(match_id)
    await _manager.connect(room, websocket)
    try:
        while True:
            await websocket.receive_text()  # discard keep-alive pings from client
    except WebSocketDisconnect:
        pass
    finally:
        _manager.disconnect(room, websocket)
