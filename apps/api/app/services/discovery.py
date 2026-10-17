from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.match import DiscoveryAction, Match
from app.models.profile import SportProfile, UserProfile
from app.models.safety import Block
from app.models.user import User
from app.schemas.discovery import (
    DiscoveryFeedResponse,
    PartnerCardResponse,
    RecordActionResponse,
    SportProfileSummary,
)

_CURRENT_YEAR = datetime.now().year

_LEVEL_ORDER: dict[str, int] = {"beginner": 0, "intermediate": 1, "advanced": 2}

# Max candidates fetched before scoring — keeps the scoring step bounded.
_SCORE_POOL = 200


def _score_compatibility(
    actor_level: str,
    actor_times: list[str],
    target_sp: SportProfile,
) -> float:
    """Return a [0, 1] compatibility score between actor and target sport profiles.

    Weights: 60% skill-level proximity, 40% preferred-time overlap.
    'flexible' in either party's times counts as a full time match.
    """
    level_score = 1.0 - abs(_LEVEL_ORDER.get(actor_level, 1) - _LEVEL_ORDER.get(target_sp.level, 1)) / 2.0

    actor_set = set(actor_times or [])
    target_set = set(target_sp.preferred_times or [])
    if "flexible" in actor_set or "flexible" in target_set:
        time_score = 1.0
    elif actor_set & target_set:
        time_score = len(actor_set & target_set) / max(len(actor_set), len(target_set), 1)
    else:
        time_score = 0.0

    return 0.6 * level_score + 0.4 * time_score


def _build_partner_card(
    user: User,
    profile: UserProfile,
    sport_profiles: list[SportProfile],
) -> PartnerCardResponse:
    age = _CURRENT_YEAR - profile.birth_year if profile.birth_year else None
    bio_excerpt = profile.bio[:160] if profile.bio else None
    # `profile.photos` is selectin-loaded by the feed query below and ordered
    # by position (relationship default). The avatar_url already mirrors the
    # 0th photo for users who have uploaded; photo_urls carries the full set
    # for the V1 detail preview UI.
    photo_urls = [p.photo_url for p in (profile.photos or [])]
    return PartnerCardResponse(
        user_id=user.id,
        display_name=profile.display_name,
        suburb=profile.suburb,
        bio_excerpt=bio_excerpt,
        bio=profile.bio,
        avatar_url=profile.avatar_url,
        photo_urls=photo_urls,
        age=age,
        sport_profiles=[
            SportProfileSummary(
                sport=sp.sport,
                level=sp.level,
                gym_name=sp.gym_name,
                golf_club=sp.golf_club,
            )
            for sp in sport_profiles
        ],
    )


async def get_discovery_feed(
    db: AsyncSession,
    current_user_id: UUID,
    sport: str,
    limit: int = 20,
    offset: int = 0,
) -> DiscoveryFeedResponse:
    # Fetch actor's sport profile for compatibility scoring.
    actor_sp_stmt = select(SportProfile).where(
        and_(SportProfile.user_id == current_user_id, SportProfile.sport == sport)
    )
    actor_sp = (await db.execute(actor_sp_stmt)).scalar_one_or_none()
    actor_level = actor_sp.level if actor_sp else "intermediate"
    actor_times = list(actor_sp.preferred_times or []) if actor_sp else ["flexible"]

    # IDs the current user has already acted on for this sport
    acted_on_subq = (
        select(DiscoveryAction.target_id)
        .where(
            and_(
                DiscoveryAction.actor_id == current_user_id,
                DiscoveryAction.sport == sport,
            )
        )
        .scalar_subquery()
    )

    # Users blocked by or blocking the current user (bidirectional hide)
    blocked_by_me_subq = select(Block.blocked_id).where(Block.blocker_id == current_user_id).scalar_subquery()
    blocking_me_subq = select(Block.blocker_id).where(Block.blocked_id == current_user_id).scalar_subquery()

    base_filter = and_(
        User.id != current_user_id,
        User.is_active.is_(True),
        User.id.not_in(acted_on_subq),
        User.id.not_in(blocked_by_me_subq),
        User.id.not_in(blocking_me_subq),
    )

    # Fetch a scoring pool (bounded) — sort by score in Python, then paginate.
    pool_stmt = (
        select(User, UserProfile, SportProfile)
        .join(UserProfile, UserProfile.user_id == User.id)
        .join(
            SportProfile,
            and_(SportProfile.user_id == User.id, SportProfile.sport == sport),
        )
        # Load each candidate profile's photos in the same round-trip so the
        # V1 detail-preview UI renders without a follow-up request per card.
        .options(selectinload(UserProfile.photos))
        .where(base_filter)
        .order_by(User.created_at.desc())
        .limit(_SCORE_POOL)
    )
    pool = (await db.execute(pool_stmt)).all()

    # Score and sort descending
    scored = sorted(
        pool,
        key=lambda row: _score_compatibility(actor_level, actor_times, row[2]),
        reverse=True,
    )

    total = len(scored)
    page = scored[offset : offset + limit]

    items = [_build_partner_card(user, profile, [sp]) for user, profile, sp in page]
    return DiscoveryFeedResponse(items=items, total=total, limit=limit, offset=offset)


async def record_action(
    db: AsyncSession,
    actor_id: UUID,
    target_user_id: UUID,
    action: str,
    sport: str,
) -> RecordActionResponse:
    if actor_id == target_user_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="You cannot perform a discovery action on yourself",
        )

    # Upsert: update existing action or insert new one
    existing_stmt = select(DiscoveryAction).where(
        and_(
            DiscoveryAction.actor_id == actor_id,
            DiscoveryAction.target_id == target_user_id,
            DiscoveryAction.sport == sport,
        )
    )
    existing = (await db.execute(existing_stmt)).scalar_one_or_none()

    if existing is None:
        db.add(
            DiscoveryAction(
                actor_id=actor_id,
                target_id=target_user_id,
                sport=sport,
                action=action,
            )
        )
    else:
        existing.action = action

    match_created = False
    match_id = None

    if action == "like":
        # Check for reverse like → mutual match
        reverse_stmt = select(DiscoveryAction).where(
            and_(
                DiscoveryAction.actor_id == target_user_id,
                DiscoveryAction.target_id == actor_id,
                DiscoveryAction.sport == sport,
                DiscoveryAction.action == "like",
            )
        )
        reverse = (await db.execute(reverse_stmt)).scalar_one_or_none()

        if reverse is not None:
            # Canonical pair: user1_id < user2_id (lexicographic string sort)
            u1_str, u2_str = sorted([str(actor_id), str(target_user_id)])
            u1, u2 = UUID(u1_str), UUID(u2_str)

            existing_match_stmt = select(Match).where(
                and_(
                    Match.user1_id == u1,
                    Match.user2_id == u2,
                    Match.sport == sport,
                )
            )
            existing_match = (await db.execute(existing_match_stmt)).scalar_one_or_none()

            if existing_match is None:
                new_match = Match(user1_id=u1, user2_id=u2, sport=sport, status="active")
                db.add(new_match)
                await db.flush()
                match_created = True
                match_id = new_match.id

    await db.commit()
    return RecordActionResponse(action=action, match_created=match_created, match_id=match_id)
