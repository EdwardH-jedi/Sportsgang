from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, WebSocket, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import Message
from app.models.match import Match
from app.schemas.chat import MessageListResponse, MessageResponse
from app.services import safety
from app.services.content_moderation import ensure_text_allowed


async def _assert_participant(db: AsyncSession, match_id: UUID, user_id: UUID) -> Match:
    stmt = select(Match).where(Match.id == match_id)
    m = (await db.execute(stmt)).scalar_one_or_none()
    if m is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    if m.user1_id != user_id and m.user2_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a participant")
    return m


def partner_of(m: Match, user_id: UUID) -> UUID:
    return m.user2_id if m.user1_id == user_id else m.user1_id


async def list_messages(
    db: AsyncSession,
    match_id: UUID,
    current_user_id: UUID,
    limit: int = 50,
    offset: int = 0,
) -> MessageListResponse:
    m = await _assert_participant(db, match_id, current_user_id)
    # Chat is hidden from both people while contact is restricted. The rows
    # stay in the database unchanged, and unblocking shows them again.
    if await safety.is_contact_restricted(db, current_user_id, partner_of(m, current_user_id)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=safety.CONTACT_UNAVAILABLE)

    stmt = (
        select(Message)
        .where(Message.match_id == match_id)
        .order_by(Message.created_at.asc())
        .offset(offset)
        .limit(limit)
    )
    messages = list((await db.execute(stmt)).scalars().all())

    count_stmt = select(func.count()).select_from(Message).where(Message.match_id == match_id)
    total: int = (await db.execute(count_stmt)).scalar_one()

    return MessageListResponse(
        items=[MessageResponse.model_validate(msg) for msg in messages],
        total=total,
        limit=limit,
        offset=offset,
    )


async def send_message(
    db: AsyncSession,
    match_id: UUID,
    sender_id: UUID,
    body: str,
) -> MessageResponse:
    # Moderation runs FIRST — before the participant check and before
    # any DB write — so disallowed content costs us no Match lookup,
    # is never persisted, and never triggers a WebSocket broadcast.
    # English-only V1; Korean/CJK is a follow-up.
    ensure_text_allowed(body, context="chat")
    m = await _assert_participant(db, match_id, sender_id)
    await safety.ensure_contact_allowed(db, sender_id, partner_of(m, sender_id))

    msg = Message(match_id=match_id, sender_id=sender_id, body=body)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return MessageResponse.model_validate(msg)


# ─── Realtime delivery ───────────────────────────────────────────────────────


class ConnectionManager:
    """Active WebSocket connections grouped by match room (this process only)."""

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

    async def close_room(self, room: str, code: int) -> None:
        for ws in self._rooms.pop(room, []):
            try:
                await ws.close(code=code)
            except Exception:
                pass


connections = ConnectionManager()

# Close code for a socket that is not (or no longer) allowed in its room:
# not a participant, or contact between the pair is restricted.
WS_CLOSE_FORBIDDEN = 4003


async def deliver_message(db: AsyncSession, msg: MessageResponse) -> bool:
    """Push a stored message to the match room, unless contact became restricted meanwhile.

    A block can commit between the message's commit and this push; in that
    case nothing is delivered and the room's sockets are closed.
    """
    m = (await db.execute(select(Match).where(Match.id == msg.match_id))).scalar_one_or_none()
    room = str(msg.match_id)
    if m is None or await safety.is_contact_restricted(db, m.user1_id, m.user2_id):
        await connections.close_room(room, WS_CLOSE_FORBIDDEN)
        return False
    data = msg.model_dump(mode="json")
    await connections.broadcast(
        room,
        {
            "id": data["id"],
            "matchId": data["match_id"],
            "senderId": data["sender_id"],
            "body": data["body"],
            "createdAt": data["created_at"],
        },
    )
    return True


async def close_pair_rooms(db: AsyncSession, a: UUID, b: UUID) -> None:
    """Disconnect every open chat socket between a and b (after a block)."""
    stmt = select(Match.id).where(
        or_(
            and_(Match.user1_id == a, Match.user2_id == b),
            and_(Match.user1_id == b, Match.user2_id == a),
        )
    )
    for (match_id,) in (await db.execute(stmt)).all():
        await connections.close_room(str(match_id), WS_CLOSE_FORBIDDEN)
