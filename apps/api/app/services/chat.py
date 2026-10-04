from __future__ import annotations

import asyncio
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


# Delivery holds the pair's contact lock while it sends (CONTRACTS.md §8), so
# these bound how long a slow client can make a block wait, whatever the
# number of sockets in the room (review MA-B):
WS_SEND_TIMEOUT_SECONDS = 5.0  # one deadline for the whole room's concurrent sends
WS_CLOSE_TIMEOUT_SECONDS = 1.0  # each close attempt, all attempts concurrent


class ConnectionManager:
    """Active WebSocket connections grouped by match room (this process only)."""

    def __init__(self) -> None:
        self._rooms: dict[str, list[WebSocket]] = {}
        self._closing: set[asyncio.Task] = set()  # close attempts still running

    async def connect(self, room: str, ws: WebSocket) -> None:
        """Register an accepted socket; the caller holds the pair's contact lock."""
        self._rooms.setdefault(room, []).append(ws)

    def disconnect(self, room: str, ws: WebSocket) -> None:
        conns = self._rooms.get(room, [])
        if ws in conns:
            conns.remove(ws)

    async def broadcast(self, room: str, data: dict) -> None:
        """Send one frame to every socket in the room, all within one deadline.

        Sends still running at the deadline, or when this call is cancelled,
        are cancelled and awaited before it returns, so none continues after
        the caller releases the contact lock. Sockets whose send failed or did
        not finish are dropped from the room and closed in the background.
        """
        sends = {asyncio.create_task(ws.send_json(data)): ws for ws in self._rooms.get(room, [])}
        if not sends:
            return
        try:
            await asyncio.wait(sends, timeout=WS_SEND_TIMEOUT_SECONDS)
        finally:
            for task in sends:
                task.cancel()
            await asyncio.wait(sends)
            for task, ws in sends.items():
                if task.cancelled() or task.exception() is not None:
                    self.disconnect(room, ws)
                    self._close(ws, WS_CLOSE_UNAVAILABLE)

    async def close_room(self, room: str, code: int) -> None:
        await self.close_rooms([room], code)

    async def close_rooms(self, rooms: list[str], code: int) -> None:
        """Unregister every socket in `rooms` and wait for their close attempts.

        All attempts start before this first suspends and run concurrently,
        each bounded by WS_CLOSE_TIMEOUT_SECONDS. A hung or failing close, or
        cancelling this call, cannot stop the attempts on the other sockets.
        """
        closing = [self._close(ws, code) for room in rooms for ws in self._rooms.pop(room, [])]
        if closing:
            await asyncio.wait(closing)

    def _close(self, ws: WebSocket, code: int) -> asyncio.Task:
        task = asyncio.create_task(self._close_one(ws, code))
        self._closing.add(task)
        task.add_done_callback(self._closing.discard)
        return task

    @staticmethod
    async def _close_one(ws: WebSocket, code: int) -> None:
        try:
            await asyncio.wait_for(ws.close(code=code), timeout=WS_CLOSE_TIMEOUT_SECONDS)
        except Exception:
            pass  # already gone, or can't take the close frame: it is unregistered either way


connections = ConnectionManager()

# Close code for a socket that is not (or no longer) allowed in its room:
# not a participant, or contact between the pair is restricted.
WS_CLOSE_FORBIDDEN = 4003
# Close code for a socket dropped because it could not take a frame in time.
WS_CLOSE_UNAVAILABLE = 1011


async def deliver_message(db: AsyncSession, msg: MessageResponse) -> bool:
    """Push a stored message to the match room, unless contact is restricted.

    The check and the push run under the pair's contact lock (CONTRACTS.md
    §8): a block that commits first means nothing is pushed and the room's
    sockets are closed; a block that arrives during the push waits for it.
    """
    room = str(msg.match_id)
    allowed = False
    try:
        m = (await db.execute(select(Match).where(Match.id == msg.match_id))).scalar_one_or_none()
        allowed = m is not None and await safety.lock_contact(db, m.user1_id, m.user2_id)
        if allowed:
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
    finally:
        await db.rollback()  # releases the contact lock
    if not allowed:
        await connections.close_room(room, WS_CLOSE_FORBIDDEN)
    return allowed


async def close_pair_rooms(db: AsyncSession, a: UUID, b: UUID) -> None:
    """Disconnect every open chat socket between a and b (after a block)."""
    stmt = select(Match.id).where(
        or_(
            and_(Match.user1_id == a, Match.user2_id == b),
            and_(Match.user1_id == b, Match.user2_id == a),
        )
    )
    rooms = [str(match_id) for (match_id,) in (await db.execute(stmt)).all()]
    await connections.close_rooms(rooms, WS_CLOSE_FORBIDDEN)
