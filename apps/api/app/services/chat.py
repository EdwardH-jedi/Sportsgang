from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import Message
from app.models.match import Match
from app.schemas.chat import MessageListResponse, MessageResponse
from app.services.content_moderation import ensure_text_allowed


async def _assert_participant(db: AsyncSession, match_id: UUID, user_id: UUID) -> Match:
    stmt = select(Match).where(Match.id == match_id)
    m = (await db.execute(stmt)).scalar_one_or_none()
    if m is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    if m.user1_id != user_id and m.user2_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a participant")
    return m


async def list_messages(
    db: AsyncSession,
    match_id: UUID,
    current_user_id: UUID,
    limit: int = 50,
    offset: int = 0,
) -> MessageListResponse:
    """Legacy oldest-first offset page. Kept unchanged for older clients."""
    await _assert_participant(db, match_id, current_user_id)

    stmt = (
        select(Message)
        .where(Message.match_id == match_id)
        .order_by(Message.created_at.asc())
        .offset(offset)
        .limit(limit)
    )
    messages = list((await db.execute(stmt)).scalars().all())
    total = await _count(db, match_id)

    return MessageListResponse(
        items=[MessageResponse.model_validate(msg) for msg in messages],
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + len(messages) < total,
    )


async def list_messages_keyset(
    db: AsyncSession,
    match_id: UUID,
    current_user_id: UUID,
    limit: int,
    before: UUID | None = None,
    after: UUID | None = None,
) -> MessageListResponse:
    """Keyset page over ``(created_at, id)``; items are always oldest-first.

    - neither cursor: the newest ``limit`` messages (``has_more`` = older exist)
    - ``before``: messages strictly older than that message (``has_more`` = older exist)
    - ``after``: messages strictly newer than that message (``has_more`` = newer exist)

    The id tie-break keeps pages stable when timestamps collide.
    """
    await _assert_participant(db, match_id, current_user_id)

    stmt = select(Message).where(Message.match_id == match_id)
    if after is not None:
        cursor = await _cursor(db, match_id, after)
        stmt = stmt.where(
            or_(
                Message.created_at > cursor.created_at,
                and_(Message.created_at == cursor.created_at, Message.id > cursor.id),
            )
        ).order_by(Message.created_at.asc(), Message.id.asc())
    else:
        if before is not None:
            cursor = await _cursor(db, match_id, before)
            stmt = stmt.where(
                or_(
                    Message.created_at < cursor.created_at,
                    and_(Message.created_at == cursor.created_at, Message.id < cursor.id),
                )
            )
        stmt = stmt.order_by(Message.created_at.desc(), Message.id.desc())

    rows = list((await db.execute(stmt.limit(limit + 1))).scalars().all())
    has_more = len(rows) > limit
    rows = rows[:limit]
    if after is None:
        rows.reverse()

    return MessageListResponse(
        items=[MessageResponse.model_validate(msg) for msg in rows],
        total=await _count(db, match_id),
        limit=limit,
        offset=0,
        has_more=has_more,
    )


async def _count(db: AsyncSession, match_id: UUID) -> int:
    count_stmt = select(func.count()).select_from(Message).where(Message.match_id == match_id)
    return (await db.execute(count_stmt)).scalar_one()


async def _cursor(db: AsyncSession, match_id: UUID, message_id: UUID) -> Message:
    # Scoped to the match so a cursor can't be used to probe other rooms.
    stmt = select(Message).where(Message.id == message_id, Message.match_id == match_id)
    msg = (await db.execute(stmt)).scalar_one_or_none()
    if msg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cursor message not found")
    return msg


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
    await _assert_participant(db, match_id, sender_id)

    msg = Message(match_id=match_id, sender_id=sender_id, body=body)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return MessageResponse.model_validate(msg)
