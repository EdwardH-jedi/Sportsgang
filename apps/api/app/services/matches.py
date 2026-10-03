from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, case, exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import Message
from app.models.match import Match
from app.models.profile import SportProfile, UserProfile
from app.models.safety import Block
from app.models.user import User
from app.schemas.discovery import PartnerCardResponse, SportProfileSummary
from app.schemas.matches import MatchListResponse, MatchResponse

_CURRENT_YEAR = datetime.now().year


async def _fetch_latest_message_by_match(db: AsyncSession, match_ids: list[UUID]) -> dict[UUID, Message]:
    """Return a {match_id: latest Message} dict for the given match ids.

    Uses one ``IN`` query and groups in Python — portable across Postgres
    and SQLite (test backend), avoids N+1 even with the page-size 50 cap
    on the matches list.
    """
    if not match_ids:
        return {}
    stmt = select(Message).where(Message.match_id.in_(match_ids)).order_by(Message.created_at.desc())
    rows = list((await db.execute(stmt)).scalars().all())
    latest: dict[UUID, Message] = {}
    for msg in rows:
        # Rows arrive newest-first, so the first one we see per match is
        # the latest. Skip subsequent older rows for the same match.
        if msg.match_id not in latest:
            latest[msg.match_id] = msg
    return latest


async def list_matches(
    db: AsyncSession,
    current_user_id: UUID,
    limit: int = 20,
    offset: int = 0,
) -> MatchListResponse:
    # Active contacts only: a match whose pair is blocked (either direction)
    # or whose partner account is inactive is not listed. The match and its
    # messages are kept and reappear after an unblock.
    partner_id = case((Match.user1_id == current_user_id, Match.user2_id), else_=Match.user1_id)
    participant_filter = and_(
        or_(
            Match.user1_id == current_user_id,
            Match.user2_id == current_user_id,
        ),
        Match.status == "active",
        ~exists().where(
            or_(
                and_(Block.blocker_id == Match.user1_id, Block.blocked_id == Match.user2_id),
                and_(Block.blocker_id == Match.user2_id, Block.blocked_id == Match.user1_id),
            )
        ),
        exists().where(User.id == partner_id, User.is_active.is_(True)),
    )

    stmt = select(Match).where(participant_filter).order_by(Match.created_at.desc()).offset(offset).limit(limit)
    matches = list((await db.execute(stmt)).scalars().all())

    count_stmt = select(Match.id).where(participant_filter)
    total = len((await db.execute(count_stmt)).all())

    latest_messages = await _fetch_latest_message_by_match(db, [m.id for m in matches])

    items: list[MatchResponse] = []
    for m in matches:
        partner_id = m.user2_id if m.user1_id == current_user_id else m.user1_id
        partner = await _build_partner_card(db, partner_id, m.sport)
        last = latest_messages.get(m.id)
        items.append(
            MatchResponse(
                id=m.id,
                user1_id=m.user1_id,
                user2_id=m.user2_id,
                sport=m.sport,
                status=m.status,
                created_at=m.created_at,
                partner=partner,
                last_message=last.body if last else None,
                last_message_at=last.created_at if last else None,
                last_message_sender_id=last.sender_id if last else None,
            )
        )

    return MatchListResponse(items=items, total=total, limit=limit, offset=offset)


async def archive_match(
    db: AsyncSession,
    match_id: UUID,
    current_user_id: UUID,
) -> MatchResponse | None:
    stmt = select(Match).where(Match.id == match_id)
    m = (await db.execute(stmt)).scalar_one_or_none()

    if m is None:
        return None
    if m.user1_id != current_user_id and m.user2_id != current_user_id:
        return None

    m.status = "archived"
    await db.commit()
    await db.refresh(m)

    partner_id = m.user2_id if m.user1_id == current_user_id else m.user1_id
    partner = await _build_partner_card(db, partner_id, m.sport)

    return MatchResponse(
        id=m.id,
        user1_id=m.user1_id,
        user2_id=m.user2_id,
        sport=m.sport,
        status=m.status,
        created_at=m.created_at,
        partner=partner,
    )


async def _build_partner_card(db: AsyncSession, user_id: UUID, sport: str) -> PartnerCardResponse:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    profile = (await db.execute(select(UserProfile).where(UserProfile.user_id == user_id))).scalar_one_or_none()
    sp = (
        await db.execute(select(SportProfile).where(and_(SportProfile.user_id == user_id, SportProfile.sport == sport)))
    ).scalar_one_or_none()

    display_name = profile.display_name if profile else (user.email if user else "Unknown")
    age = (_CURRENT_YEAR - profile.birth_year) if profile and profile.birth_year else None
    bio_excerpt = profile.bio[:160] if profile and profile.bio else None

    return PartnerCardResponse(
        user_id=user_id,
        display_name=display_name,
        suburb=profile.suburb if profile else None,
        bio_excerpt=bio_excerpt,
        avatar_url=profile.avatar_url if profile else None,
        age=age,
        sport_profiles=[
            SportProfileSummary(
                sport=sp.sport,
                level=sp.level,
                gym_name=sp.gym_name,
                golf_club=sp.golf_club,
            )
        ]
        if sp
        else [],
    )
