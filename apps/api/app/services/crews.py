"""
Crew service — persistent running groups.

Membership rules:
  * The creator becomes the crew's ``owner``. Only owners may edit or
    delete a crew.
  * Anyone may join a public crew (409 if already a member).
  * Members leave by deleting their membership. The last owner cannot
    leave while other members remain (409); an owner who is the only
    member deletes the crew by leaving.

Safety: crews whose owner is in a block relationship with the caller
(either direction) are hidden from discovery lists and treated as 404
on detail / join — except for crews the caller already belongs to, so
a member can always see and leave their own crews.

Privacy: crew home coordinates are write-only; lists expose a coarse
``distance_km`` (see :mod:`app.core.geo`).
"""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, case, delete, exists, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.geo import DEFAULT_RADIUS_KM, bbox_filter, coarse_distance_km, haversine_km
from app.models.crew import Crew, CrewMember
from app.models.profile import UserProfile
from app.models.safety import Block
from app.schemas.crews import (
    CreateCrewRequest,
    CrewDetail,
    CrewListItem,
    CrewListResponse,
    CrewMemberSummary,
    CrewNextRun,
    LeaveCrewResponse,
    UpdateCrewRequest,
    check_pace_band,
)
from app.schemas.events import EventSummary
from app.services.content_moderation import ensure_text_allowed

_MEMBER_PREVIEW_LIMIT = 12
_UPCOMING_RUNS_LIMIT = 10
# Upper bound on crews pulled into Python for exact-distance sorting.
_GEO_POOL = 500


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _blocked_by_me(user_id: UUID):
    return select(Block.blocked_id).where(Block.blocker_id == user_id).scalar_subquery()


def _blocking_me(user_id: UUID):
    return select(Block.blocker_id).where(Block.blocked_id == user_id).scalar_subquery()


def _owner_blocked_clause(user_id: UUID):
    """True for crews with an owner in a block relationship with *user_id*."""
    return exists(
        select(CrewMember.id).where(
            CrewMember.crew_id == Crew.id,
            CrewMember.role == "owner",
            or_(
                CrewMember.user_id.in_(_blocked_by_me(user_id)),
                CrewMember.user_id.in_(_blocking_me(user_id)),
            ),
        )
    )


async def _blocked_user_ids(db: AsyncSession, user_id: UUID) -> set[UUID]:
    rows = (
        await db.execute(
            select(Block.blocker_id, Block.blocked_id).where(
                or_(Block.blocker_id == user_id, Block.blocked_id == user_id)
            )
        )
    ).all()
    return {blocked if blocker == user_id else blocker for blocker, blocked in rows}


async def _membership(db: AsyncSession, crew_id: UUID, user_id: UUID) -> CrewMember | None:
    stmt = select(CrewMember).where(CrewMember.crew_id == crew_id, CrewMember.user_id == user_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def _get_visible_crew(db: AsyncSession, crew_id: UUID, user_id: UUID) -> tuple[Crew, CrewMember | None]:
    """
    Load a crew for *user_id* or raise 404. Hidden-as-404 when an owner
    is in a block relationship with the caller, unless the caller is
    already a member.
    """
    crew = (await db.execute(select(Crew).where(Crew.id == crew_id))).scalar_one_or_none()
    if crew is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Crew not found")
    membership = await _membership(db, crew.id, user_id)
    if membership is None:
        hidden = (
            await db.execute(select(Crew.id).where(Crew.id == crew.id, _owner_blocked_clause(user_id)))
        ).scalar_one_or_none()
        if hidden is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Crew not found")
    return crew, membership


def _require_owner(membership: CrewMember | None, action: str) -> None:
    if membership is None or membership.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Only a crew owner can {action} this crew",
        )


async def _member_counts(db: AsyncSession, crew_ids: list[UUID]) -> dict[UUID, int]:
    if not crew_ids:
        return {}
    stmt = (
        select(CrewMember.crew_id, func.count(CrewMember.id))
        .where(CrewMember.crew_id.in_(crew_ids))
        .group_by(CrewMember.crew_id)
    )
    return {crew_id: int(count) for crew_id, count in (await db.execute(stmt)).all()}


async def _my_roles(db: AsyncSession, crew_ids: list[UUID], user_id: UUID) -> dict[UUID, str]:
    if not crew_ids:
        return {}
    stmt = select(CrewMember.crew_id, CrewMember.role).where(
        CrewMember.crew_id.in_(crew_ids), CrewMember.user_id == user_id
    )
    return {crew_id: role for crew_id, role in (await db.execute(stmt)).all()}


async def _next_runs(db: AsyncSession, crew_ids: list[UUID]) -> dict[UUID, CrewNextRun]:
    # Group runs gain a crew link in a follow-up migration; until then no
    # crew has runs.
    return {}


async def _upcoming_runs(db: AsyncSession, crew_id: UUID, user_id: UUID) -> list[EventSummary]:
    return []


async def _to_list_items(
    db: AsyncSession,
    crews: list[Crew],
    user_id: UUID,
    distances: dict[UUID, float] | None = None,
) -> list[CrewListItem]:
    ids = [c.id for c in crews]
    counts = await _member_counts(db, ids)
    roles = await _my_roles(db, ids, user_id)
    next_runs = await _next_runs(db, ids)
    return [
        CrewListItem(
            id=c.id,
            name=c.name,
            description=c.description,
            sport=c.sport,
            home_area=c.home_area,
            pace_min_sec_per_km=c.pace_min_sec_per_km,
            pace_max_sec_per_km=c.pace_max_sec_per_km,
            visibility=c.visibility,
            created_by=c.created_by,
            member_count=counts.get(c.id, 0),
            my_role=roles.get(c.id),
            distance_km=(distances or {}).get(c.id),
            next_run=next_runs.get(c.id),
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in crews
    ]


async def _members_preview(db: AsyncSession, crew_id: UUID, user_id: UUID) -> list[CrewMemberSummary]:
    blocked = await _blocked_user_ids(db, user_id)
    stmt = (
        select(CrewMember, UserProfile.display_name, UserProfile.avatar_url)
        .outerjoin(UserProfile, UserProfile.user_id == CrewMember.user_id)
        .where(CrewMember.crew_id == crew_id)
        # Owners first, then by join date.
        .order_by(case((CrewMember.role == "owner", 0), else_=1), CrewMember.joined_at.asc())
    )
    preview: list[CrewMemberSummary] = []
    for member, display_name, avatar_url in (await db.execute(stmt)).all():
        if member.user_id in blocked:
            continue
        preview.append(
            CrewMemberSummary(
                user_id=member.user_id,
                display_name=display_name or "Runner",
                avatar_url=avatar_url,
                role=member.role,
                joined_at=member.joined_at,
            )
        )
        if len(preview) >= _MEMBER_PREVIEW_LIMIT:
            break
    return preview


def _moderate(name: str | None, description: str | None) -> None:
    if name:
        ensure_text_allowed(name, context="crew-name")
    if description:
        ensure_text_allowed(description, context="crew-description")


async def _delete_crew_rows(db: AsyncSession, crew_id: UUID) -> None:
    """Delete a crew and its memberships explicitly (dialect-independent)."""
    await db.execute(delete(CrewMember).where(CrewMember.crew_id == crew_id))
    await db.execute(delete(Crew).where(Crew.id == crew_id))


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def list_crews(
    db: AsyncSession,
    current_user_id: UUID,
    *,
    lat: float | None = None,
    lng: float | None = None,
    radius_km: float = DEFAULT_RADIUS_KM,
    sport: str | None = None,
    q: str | None = None,
    mine: bool = False,
    limit: int = 20,
    offset: int = 0,
) -> CrewListResponse:
    """
    ``mine=true`` lists crews the caller belongs to (block filter not
    applied — a member can always reach their own crews). Otherwise all
    public crews minus those with a blocked/blocking owner.

    Without lat/lng: newest first, ``distance_km`` null. With lat/lng:
    crews without a home point or outside ``radius_km`` are excluded and
    results are ordered by coarse distance, then member count, then name.
    """
    geo = lat is not None and lng is not None

    stmt = select(Crew).where(Crew.visibility == "public")
    if mine:
        stmt = stmt.where(
            exists(select(CrewMember.id).where(CrewMember.crew_id == Crew.id, CrewMember.user_id == current_user_id))
        )
    else:
        stmt = stmt.where(~_owner_blocked_clause(current_user_id))

    if sport is not None:
        stmt = stmt.where(Crew.sport == sport.strip().lower())

    if q is not None and q.strip():
        needle = q.strip().lower()
        stmt = stmt.where(
            or_(
                func.lower(Crew.name).contains(needle, autoescape=True),
                func.lower(Crew.home_area).contains(needle, autoescape=True),
            )
        )

    if not geo:
        stmt = stmt.order_by(Crew.created_at.desc(), Crew.id.asc())
        total = int((await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one())
        crews = list((await db.execute(stmt.offset(offset).limit(limit))).scalars().all())
        items = await _to_list_items(db, crews, current_user_id)
        return CrewListResponse(items=items, total=total, limit=limit, offset=offset)

    stmt = stmt.where(and_(*bbox_filter(Crew.home_lat, Crew.home_lng, lat, lng, radius_km))).limit(_GEO_POOL)
    pool = list((await db.execute(stmt)).scalars().all())
    distances: dict[UUID, float] = {}
    nearby: list[Crew] = []
    for crew in pool:
        km = haversine_km(lat, lng, crew.home_lat, crew.home_lng)
        if km > radius_km:
            continue
        distances[crew.id] = coarse_distance_km(km)
        nearby.append(crew)

    counts = await _member_counts(db, [c.id for c in nearby])
    nearby.sort(key=lambda c: (distances[c.id], -counts.get(c.id, 0), c.name.lower()))
    page = nearby[offset : offset + limit]
    items = await _to_list_items(db, page, current_user_id, distances)
    return CrewListResponse(items=items, total=len(nearby), limit=limit, offset=offset)


async def get_crew(db: AsyncSession, crew_id: UUID, current_user_id: UUID) -> CrewDetail:
    crew, _ = await _get_visible_crew(db, crew_id, current_user_id)
    [summary] = await _to_list_items(db, [crew], current_user_id)
    return CrewDetail(
        **summary.model_dump(),
        members=await _members_preview(db, crew.id, current_user_id),
        upcoming_runs=await _upcoming_runs(db, crew.id, current_user_id),
    )


async def create_crew(db: AsyncSession, current_user_id: UUID, body: CreateCrewRequest) -> CrewDetail:
    # Moderation BEFORE persistence, same as events.
    _moderate(body.name, body.description)

    crew = Crew(
        name=body.name,
        description=(body.description.strip() or None) if body.description else None,
        sport=body.sport.lower(),
        home_area=body.home_area,
        home_lat=body.home_lat,
        home_lng=body.home_lng,
        pace_min_sec_per_km=body.pace_min_sec_per_km,
        pace_max_sec_per_km=body.pace_max_sec_per_km,
        visibility=body.visibility,
        created_by=current_user_id,
    )
    db.add(crew)
    await db.flush()
    db.add(CrewMember(crew_id=crew.id, user_id=current_user_id, role="owner"))
    await db.commit()
    return await get_crew(db, crew.id, current_user_id)


async def update_crew(db: AsyncSession, crew_id: UUID, current_user_id: UUID, body: UpdateCrewRequest) -> CrewDetail:
    crew, membership = await _get_visible_crew(db, crew_id, current_user_id)
    _require_owner(membership, "edit")

    changes = body.model_dump(exclude_unset=True)
    _moderate(changes.get("name"), changes.get("description"))

    pace_min = changes.get("pace_min_sec_per_km", crew.pace_min_sec_per_km)
    pace_max = changes.get("pace_max_sec_per_km", crew.pace_max_sec_per_km)
    try:
        check_pace_band(pace_min, pace_max)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc

    if "description" in changes and changes["description"] is not None:
        changes["description"] = changes["description"].strip() or None
    if "sport" in changes:
        changes["sport"] = changes["sport"].lower()
    for field, value in changes.items():
        setattr(crew, field, value)

    await db.commit()
    await db.refresh(crew)
    return await get_crew(db, crew.id, current_user_id)


async def delete_crew(db: AsyncSession, crew_id: UUID, current_user_id: UUID) -> None:
    crew, membership = await _get_visible_crew(db, crew_id, current_user_id)
    _require_owner(membership, "delete")
    await _delete_crew_rows(db, crew.id)
    await db.commit()


async def join_crew(db: AsyncSession, crew_id: UUID, current_user_id: UUID) -> CrewDetail:
    crew, membership = await _get_visible_crew(db, crew_id, current_user_id)
    if membership is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member of this crew")

    db.add(CrewMember(crew_id=crew.id, user_id=current_user_id, role="member"))
    try:
        await db.commit()
    except IntegrityError as exc:
        # Concurrent double-tap: the unique (crew_id, user_id) constraint
        # caught the second insert.
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member of this crew") from exc
    return await get_crew(db, crew.id, current_user_id)


async def leave_crew(db: AsyncSession, crew_id: UUID, current_user_id: UUID) -> LeaveCrewResponse:
    crew = (await db.execute(select(Crew).where(Crew.id == crew_id))).scalar_one_or_none()
    if crew is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Crew not found")
    membership = await _membership(db, crew.id, current_user_id)
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="You are not in this crew")

    if membership.role == "owner":
        other_owners = int(
            (
                await db.execute(
                    select(func.count(CrewMember.id)).where(
                        CrewMember.crew_id == crew.id,
                        CrewMember.role == "owner",
                        CrewMember.user_id != current_user_id,
                    )
                )
            ).scalar_one()
        )
        if other_owners == 0:
            others = int(
                (
                    await db.execute(
                        select(func.count(CrewMember.id)).where(
                            CrewMember.crew_id == crew.id,
                            CrewMember.user_id != current_user_id,
                        )
                    )
                ).scalar_one()
            )
            if others > 0:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="You're the crew's only owner. Delete the crew, or wait until the other members have left.",
                )
            # Sole member and owner: leaving dissolves the crew.
            await _delete_crew_rows(db, crew.id)
            await db.commit()
            return LeaveCrewResponse(crew_id=crew.id, crew_deleted=True)

    await db.execute(delete(CrewMember).where(CrewMember.id == membership.id))
    await db.commit()
    return LeaveCrewResponse(crew_id=crew.id, crew_deleted=False)


async def remove_user_from_crews(db: AsyncSession, user_id: UUID) -> None:
    """
    Account-deletion hook (called from ``DELETE /auth/me`` before the
    user row goes). Does not commit.

    * Crews where the user is the only member are deleted.
    * Crews where the user is the last owner but others remain get a new
      owner: the longest-standing remaining member.
    * The user's memberships are removed and ``created_by`` is cleared.
    """
    memberships = list((await db.execute(select(CrewMember).where(CrewMember.user_id == user_id))).scalars().all())
    for membership in memberships:
        others = list(
            (
                await db.execute(
                    select(CrewMember)
                    .where(CrewMember.crew_id == membership.crew_id, CrewMember.user_id != user_id)
                    .order_by(CrewMember.joined_at.asc(), CrewMember.id.asc())
                )
            )
            .scalars()
            .all()
        )
        if not others:
            await _delete_crew_rows(db, membership.crew_id)
            continue
        if membership.role == "owner" and not any(m.role == "owner" for m in others):
            others[0].role = "owner"
    await db.flush()
    await db.execute(delete(CrewMember).where(CrewMember.user_id == user_id))
    await db.execute(update(Crew).where(Crew.created_by == user_id).values(created_by=None))
