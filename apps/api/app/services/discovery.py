import base64
import binascii
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
    CompatibilityNoteResponse,
    CompatibilityResponse,
    DiscoveryFeedResponse,
    PartnerCardResponse,
    RecordActionResponse,
    SportProfileSummary,
)
from app.services import compatibility, sport_preferences

_CURRENT_YEAR = datetime.now().year

_LEVEL_ORDER: dict[str, int] = {"beginner": 0, "intermediate": 1, "advanced": 2}

# Max candidates fetched before scoring — keeps the scoring step bounded.
# The pool is the newest _SCORE_POOL users with a profile for the sport (after
# self / inactive / blocked / already-acted-on exclusion). `total` in the
# response counts eligible rows inside this pool, not global coverage.
_SCORE_POOL = 200


def _score_compatibility(
    actor_level: str,
    actor_times: list[str],
    target_sp: SportProfile,
) -> float:
    """Return a [0, 1] compatibility score between actor and target sport profiles.

    Legacy gym/tennis ranking only. Weights: 60% skill-level proximity, 40%
    preferred-time overlap. 'flexible' in either party's times counts as a
    full time match. Running/golf use app.services.compatibility instead.
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


def _summarise(sp: SportProfile) -> SportProfileSummary:
    return SportProfileSummary(
        sport=sp.sport,
        level=sp.level,
        gym_name=sp.gym_name,
        golf_club=sp.golf_club,
        preferences_configured=sport_preferences.is_configured(sp),
        preferred_times=list(sp.preferred_times or []),
        golf_handicap_tenths=sp.golf_handicap_tenths,
        golf_handicap_source=sp.golf_handicap_source,
        golf_experience=sp.golf_experience,
        golf_partner_intents=sp.golf_partner_intents,
        golf_preferred_holes=sp.golf_preferred_holes,
        run_pace_mode=sp.run_pace_mode,
        run_pace_min_sec_per_km=sp.run_pace_min_sec_per_km,
        run_pace_max_sec_per_km=sp.run_pace_max_sec_per_km,
        run_distances_km=sp.run_distances_km,
        run_group_style=sp.run_group_style,
    )


def _build_partner_card(
    user: User,
    profile: UserProfile,
    sport_profiles: list[SportProfile],
    assessment: compatibility.Assessment | None = None,
) -> PartnerCardResponse:
    age = _CURRENT_YEAR - profile.birth_year if profile.birth_year else None
    bio_excerpt = profile.bio[:160] if profile.bio else None
    # `profile.photos` is selectin-loaded by the feed query below and ordered
    # by position (relationship default). The avatar_url already mirrors the
    # 0th photo for users who have uploaded; photo_urls carries the full set
    # for the V1 detail preview UI.
    photo_urls = [p.photo_url for p in (profile.photos or [])]
    compat = None
    if assessment is not None and assessment.tier is not None:
        compat = CompatibilityResponse(
            tier=assessment.tier,
            reasons=[CompatibilityNoteResponse(code=n.code, text=n.text) for n in assessment.reasons],
            caveats=[CompatibilityNoteResponse(code=n.code, text=n.text) for n in assessment.caveats],
        )
    return PartnerCardResponse(
        user_id=user.id,
        display_name=profile.display_name,
        suburb=profile.suburb,
        bio_excerpt=bio_excerpt,
        bio=profile.bio,
        avatar_url=profile.avatar_url,
        photo_urls=photo_urls,
        age=age,
        sport_profiles=[_summarise(sp) for sp in sport_profiles],
        compatibility=compat,
    )


# ---------------------------------------------------------------------------
# Cursor pagination (v2 feeds)
#
# Rows are totally ordered by (-tier_rank, -points, user_id). The cursor is the
# key of the last row a client received; the next page is every row strictly
# after it. Removing acted-on users between page loads therefore cannot shift
# unseen candidates behind the client's position the way an offset does.
# ---------------------------------------------------------------------------

_SortKey = tuple[int, int, str]


def _encode_cursor(key: _SortKey) -> str:
    raw = f"{key[0]}:{key[1]}:{key[2]}".encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _decode_cursor(cursor: str) -> _SortKey:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        tier, points, user_id = base64.urlsafe_b64decode(padded.encode()).decode().split(":")
        return int(tier), int(points), str(UUID(user_id))
    except (ValueError, binascii.Error, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid cursor") from exc


async def get_discovery_feed(
    db: AsyncSession,
    current_user_id: UUID,
    sport: str,
    limit: int = 20,
    offset: int = 0,
    cursor: str | None = None,
    strict_pace: bool = False,
) -> DiscoveryFeedResponse:
    # Fetch actor's sport profile for compatibility scoring.
    actor_sp_stmt = select(SportProfile).where(
        and_(SportProfile.user_id == current_user_id, SportProfile.sport == sport)
    )
    actor_sp = (await db.execute(actor_sp_stmt)).scalar_one_or_none()

    is_v2 = sport in sport_preferences.FOCUS_SPORTS
    if strict_pace:
        if sport != "running":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="The pace filter is only available for running.",
            )
        if actor_sp is None or actor_sp.run_pace_min_sec_per_km is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Add your pace range to filter by pace.",
            )

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

    if is_v2:
        return _v2_feed(sport, actor_sp, pool, limit, offset, cursor, strict_pace)

    actor_level = actor_sp.level if actor_sp else "intermediate"
    actor_times = list(actor_sp.preferred_times or []) if actor_sp else ["flexible"]

    # Score and sort descending
    scored = sorted(
        pool,
        key=lambda row: _score_compatibility(actor_level, actor_times, row[2]),
        reverse=True,
    )

    total = len(scored)
    page = scored[offset : offset + limit]

    items = [_build_partner_card(user, profile, [sp]) for user, profile, sp in page]
    return DiscoveryFeedResponse(items=items, total=total, limit=limit, offset=offset, pool_limit=_SCORE_POOL)


def _v2_feed(
    sport: str,
    actor_sp: SportProfile | None,
    pool: list,
    limit: int,
    offset: int,
    cursor: str | None,
    strict_pace: bool,
) -> DiscoveryFeedResponse:
    ranked: list[tuple[_SortKey, tuple, compatibility.Assessment]] = []
    for row in pool:
        assessment = compatibility.assess(sport, actor_sp, row[2], strict_pace=strict_pace)
        if assessment.excluded:
            continue
        key = (compatibility.TIER_RANK[assessment.tier], assessment.points, str(row[0].id))
        ranked.append((key, row, assessment))

    # Higher tier first, then more fit points, then user id for a total order.
    def _order(key: _SortKey) -> tuple[int, int, str]:
        return (-key[0], -key[1], key[2])

    ranked.sort(key=lambda item: _order(item[0]))

    if cursor is not None:
        after = _order(_decode_cursor(cursor))
        remaining = [item for item in ranked if _order(item[0]) > after]
        page = remaining[:limit]
        has_more = len(remaining) > limit
    else:
        page = ranked[offset : offset + limit]
        has_more = len(ranked) > offset + limit

    items = [_build_partner_card(user, profile, [sp], assessment) for _, (user, profile, sp), assessment in page]
    return DiscoveryFeedResponse(
        items=items,
        total=len(ranked),
        limit=limit,
        offset=offset,
        next_cursor=_encode_cursor(page[-1][0]) if page and has_more else None,
        viewer_setup_required=actor_sp is None or not sport_preferences.is_configured(actor_sp),
        pool_limit=_SCORE_POOL,
    )


async def record_action(
    db: AsyncSession,
    actor_id: UUID,
    target_user_id: UUID,
    action: str,
    sport: str,
) -> RecordActionResponse:
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
