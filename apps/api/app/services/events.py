"""
Event (group "battle" / "game") service.

Distinct from Booking (1:1 partner session) and Tournament (multi-round
structured competition). The data model leaves clean extension points
for the future Report/Block and Attendance/No-show streams (status,
soft-leave audit trail, visibility flag).
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import (
    EVENT_ATTENDANCE_HOST_STATUSES,
    EVENT_ATTENDANCE_SELF_STATUSES,
    EVENT_MODES,
    EVENT_VISIBILITIES,
    Event,
    EventParticipant,
)
from app.models.profile import UserProfile
from app.schemas.events import (
    AttendanceEntry,
    AttendanceListResponse,
    CreateEventRequest,
    EventDetail,
    EventHost,
    EventListResponse,
    EventParticipantSummary,
    EventSummary,
    HostAttendanceUpdateRequest,
    SelfAttendanceRequest,
)
from app.services.content_moderation import ensure_text_allowed

# Statuses where /events lists the row by default.
_VISIBLE_STATUSES: frozenset[str] = frozenset({"open", "full"})

# Statuses a participant can leave from.
_LEAVABLE_STATUSES: frozenset[str] = frozenset({"open", "full"})


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _joined_count(db: AsyncSession, event_id: UUID) -> int:
    stmt = select(func.count(EventParticipant.id)).where(
        EventParticipant.event_id == event_id,
        EventParticipant.status == "joined",
    )
    return int((await db.execute(stmt)).scalar_one())


async def _active_participant(db: AsyncSession, event_id: UUID, user_id: UUID) -> EventParticipant | None:
    stmt = select(EventParticipant).where(
        EventParticipant.event_id == event_id,
        EventParticipant.user_id == user_id,
        EventParticipant.status == "joined",
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _resolve_host(db: AsyncSession, host_user_id: UUID) -> EventHost:
    stmt = select(UserProfile.display_name).where(UserProfile.user_id == host_user_id)
    name = (await db.execute(stmt)).scalar_one_or_none()
    return EventHost(id=host_user_id, display_name=name or "Host")


async def _get_event_or_404(db: AsyncSession, event_id: UUID) -> Event:
    e = (await db.execute(select(Event).where(Event.id == event_id))).scalar_one_or_none()
    if e is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return e


async def _to_summary(db: AsyncSession, e: Event, current_user_id: UUID) -> EventSummary:
    count = await _joined_count(db, e.id)
    joined = (await _active_participant(db, e.id, current_user_id)) is not None
    host = await _resolve_host(db, e.host_user_id)
    return EventSummary(
        id=e.id,
        host_user_id=e.host_user_id,
        host=host,
        title=e.title,
        sport=e.sport,
        mode=e.mode,
        starts_at=e.starts_at,
        location_text=e.location_text,
        capacity=e.capacity,
        participant_count=count,
        spots_left=max(0, e.capacity - count),
        visibility=e.visibility,
        status=e.status,
        has_joined=joined,
        description=e.description,
        created_at=e.created_at,
        updated_at=e.updated_at,
    )


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def create_event(db: AsyncSession, host_user_id: UUID, body: CreateEventRequest) -> EventDetail:
    if body.mode not in EVENT_MODES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Invalid mode: {body.mode}",
        )
    if body.visibility not in EVENT_VISIBILITIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Invalid visibility: {body.visibility}",
        )
    # Private events not yet exposed via list, but we accept the value
    # so the future Friends-only stream can flip it on without a
    # migration. Reject anything that's not public for now to avoid
    # creating orphan-private rows nobody can see.
    if body.visibility != "public":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Only public events are supported in this release",
        )

    # Moderation: block disallowed text BEFORE persistence. Title and
    # description are user-generated; ``location_text`` is intentionally
    # NOT moderated — the mobile composer's venue picker is the safe
    # surface, and curated venue names (e.g. "Anytime Fitness Surry
    # Hills") would never trigger the wordlist anyway.
    ensure_text_allowed(body.title, context="event-title")
    if body.description:
        ensure_text_allowed(body.description, context="event-description")

    e = Event(
        host_user_id=host_user_id,
        title=body.title.strip(),
        sport=body.sport.strip().lower(),
        mode=body.mode,
        starts_at=body.starts_at,
        location_text=body.location_text.strip(),
        capacity=body.capacity,
        description=(body.description or None),
        visibility=body.visibility,
        status="open",
    )
    db.add(e)
    await db.flush()

    # Host auto-joins as the first participant. Matches the brief's
    # "host should be treated as participant"; simplifies capacity
    # accounting and the mobile join-state badge.
    db.add(
        EventParticipant(
            event_id=e.id,
            user_id=host_user_id,
            status="joined",
        )
    )
    await db.flush()

    # If capacity is exactly 1 (degenerate but valid) the host fills it
    # immediately — mirror the join-flow's full-status flip so the row
    # is consistent on read.
    if e.capacity <= 1:
        e.status = "full"

    await db.commit()
    await db.refresh(e)
    return await get_event(db, e.id, host_user_id)


async def list_events(
    db: AsyncSession,
    current_user_id: UUID,
    *,
    mine: bool = False,
    sport: str | None = None,
    mode: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> EventListResponse:
    base = select(Event)
    if mine:
        # Events the user has joined (active) OR hosts.
        base = (
            base.join(
                EventParticipant,
                EventParticipant.event_id == Event.id,
                isouter=True,
            )
            .where(
                (Event.host_user_id == current_user_id)
                | ((EventParticipant.user_id == current_user_id) & (EventParticipant.status == "joined"))
            )
            .distinct()
        )
    else:
        base = base.where(
            Event.status.in_(_VISIBLE_STATUSES),
            Event.visibility == "public",
        )

    if sport is not None:
        base = base.where(Event.sport == sport.strip().lower())

    if mode is not None:
        if mode not in EVENT_MODES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Invalid mode: {mode}",
            )
        base = base.where(Event.mode == mode)

    base = base.order_by(Event.starts_at.asc())

    rows = list((await db.execute(base.offset(offset).limit(limit))).scalars().all())
    total = int((await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one())

    items: list[EventSummary] = []
    for e in rows:
        items.append(await _to_summary(db, e, current_user_id))
    return EventListResponse(items=items, total=total)


async def get_event(db: AsyncSession, event_id: UUID, current_user_id: UUID) -> EventDetail:
    e = await _get_event_or_404(db, event_id)

    # Defensive private-visibility guard. POST /events rejects
    # visibility='private' for now, but the column accepts it so a
    # future stream (or a seeded row) shouldn't leak details to
    # outsiders. Treat as 404 so non-participants can't probe for
    # existence — matches the project's preference for hiding
    # inaccessible resources rather than advertising them with 403.
    if e.visibility == "private" and current_user_id != e.host_user_id:
        joined = await _active_participant(db, e.id, current_user_id)
        if joined is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    summary = await _to_summary(db, e, current_user_id)

    participants_stmt = (
        select(EventParticipant, UserProfile.display_name)
        .where(
            EventParticipant.event_id == e.id,
            EventParticipant.status == "joined",
        )
        .outerjoin(UserProfile, UserProfile.user_id == EventParticipant.user_id)
        .order_by(EventParticipant.joined_at.asc())
    )
    rows = (await db.execute(participants_stmt)).all()
    participants = [
        EventParticipantSummary(
            user_id=p.user_id,
            display_name=display_name or "Player",
            joined_at=p.joined_at,
        )
        for (p, display_name) in rows
    ]
    return EventDetail(**summary.model_dump(), participants=participants)


async def join_event(db: AsyncSession, event_id: UUID, current_user_id: UUID) -> EventDetail:
    locked_stmt = select(Event).where(Event.id == event_id).with_for_update()
    e = (await db.execute(locked_stmt)).scalar_one_or_none()
    if e is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Hide-as-404 MUST run before any terminal-status 422 so that a
    # private outsider cannot distinguish "no event with this id" from
    # "private cancelled/completed event with this id". Mirrors the
    # get_event / cancel_event / complete_event pattern.
    await _enforce_private_visibility(db, e, current_user_id)

    if e.status in ("cancelled", "completed"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Cannot join a {e.status} event",
        )

    if await _active_participant(db, e.id, current_user_id) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Already joined this event",
        )

    count = await _joined_count(db, e.id)
    if count >= e.capacity or e.status == "full":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Event is full",
        )

    # Re-activate a prior "left" row if the user is rejoining — keeps
    # the soft-leave audit trail honest (we don't create duplicate
    # joined rows for the same user on the same event).
    rejoin_stmt = select(EventParticipant).where(
        EventParticipant.event_id == e.id,
        EventParticipant.user_id == current_user_id,
        EventParticipant.status == "left",
    )
    prior = (await db.execute(rejoin_stmt)).scalars().first()
    if prior is not None:
        prior.status = "joined"
        prior.left_at = None
        prior.joined_at = datetime.now(tz=timezone.utc)
    else:
        db.add(
            EventParticipant(
                event_id=e.id,
                user_id=current_user_id,
                status="joined",
            )
        )

    new_count = count + 1
    if new_count >= e.capacity:
        e.status = "full"
    await db.flush()
    await db.commit()
    await db.refresh(e)
    return await get_event(db, e.id, current_user_id)


async def leave_event(db: AsyncSession, event_id: UUID, current_user_id: UUID) -> EventDetail:
    locked_stmt = select(Event).where(Event.id == event_id).with_for_update()
    e = (await db.execute(locked_stmt)).scalar_one_or_none()
    if e is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Hide-as-404 MUST run before any terminal-status 422 so that a
    # private outsider cannot distinguish "no event with this id" from
    # "private cancelled/completed event with this id". Same pattern as
    # join_event / get_event.
    await _enforce_private_visibility(db, e, current_user_id)

    if e.status not in _LEAVABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Cannot leave a {e.status} event",
        )

    # Host cannot orphan their own event. Cancel/transfer-host is a
    # future stream; until then, leaving must go through the host. This
    # check sits BEFORE the participant lookup so the response is the
    # same whether or not the host was auto-joined.
    if current_user_id == e.host_user_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Host cannot leave their own event",
        )

    participant = await _active_participant(db, e.id, current_user_id)
    if participant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You are not in this event",
        )

    # Soft leave — preserves the audit trail for the future no-show /
    # attendance stream. Status flips to "left" rather than deleting.
    participant.status = "left"
    participant.left_at = datetime.now(tz=timezone.utc)
    await db.flush()

    new_count = await _joined_count(db, e.id)
    if e.status == "full" and new_count < e.capacity:
        e.status = "open"

    await db.commit()
    await db.refresh(e)
    return await get_event(db, e.id, current_user_id)


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------

# Event statuses where attendance updates are accepted.
# - open/full   → host can finalize as soon as the event is over (no
#                 scheduler runs auto-flip yet)
# - completed   → still mutable (host may correct a wrong mark)
# - cancelled   → frozen; no attendance updates make sense for a
#                 cancelled event
_ATTENDANCE_MUTABLE_EVENT_STATUSES: frozenset[str] = frozenset({"open", "full", "completed"})


async def _enforce_private_visibility(db: AsyncSession, e: Event, current_user_id: UUID) -> None:
    """
    Hide-as-404 guard for private events. Must run before any
    endpoint-specific permission check (403 for non-host, 422 for
    business rules), so an outsider probing a private event ID never
    learns the event exists. Mirrors the get_event / join_event
    pattern: host always passes; active joined participant passes;
    everyone else gets 404.
    """
    if e.visibility != "private":
        return
    if current_user_id == e.host_user_id:
        return
    joined = await _active_participant(db, e.id, current_user_id)
    if joined is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")


def _entry_for(event_id: UUID, p: EventParticipant, display_name: str | None) -> AttendanceEntry:
    return AttendanceEntry(
        event_id=event_id,
        participant_user_id=p.user_id,
        display_name=display_name or "Player",
        participant_status=p.status,
        attendance_status=p.attendance_status,
        joined_at=p.joined_at,
        left_at=p.left_at,
        attendance_confirmed_by_host_at=p.attendance_confirmed_by_host_at,
        attendance_self_reported_at=p.attendance_self_reported_at,
        attendance_note=p.attendance_note,
    )


async def get_event_attendance(db: AsyncSession, event_id: UUID, current_user_id: UUID) -> AttendanceListResponse:
    """
    Return attendance rows for an event.

    - Host sees every participant (joined and left), to support
      after-the-fact corrections and a future no-show review.
    - An active joined participant sees their own row only — no leak
      of the rest of the roster's attendance status.
    - Non-participants are 404'd (matches the project's hide-as-404
      convention for inaccessible resources).
    """
    e = await _get_event_or_404(db, event_id)
    await _enforce_private_visibility(db, e, current_user_id)

    if current_user_id == e.host_user_id:
        stmt = (
            select(EventParticipant, UserProfile.display_name)
            .where(EventParticipant.event_id == e.id)
            .outerjoin(UserProfile, UserProfile.user_id == EventParticipant.user_id)
            .order_by(EventParticipant.joined_at.asc())
        )
        rows = (await db.execute(stmt)).all()
        return AttendanceListResponse(
            event_id=e.id,
            host_user_id=e.host_user_id,
            items=[_entry_for(e.id, p, name) for (p, name) in rows],
        )

    # Participant self-view. Must be active or have a left audit row;
    # outsiders are not told the event exists.
    me_stmt = (
        select(EventParticipant, UserProfile.display_name)
        .where(
            EventParticipant.event_id == e.id,
            EventParticipant.user_id == current_user_id,
        )
        .outerjoin(UserProfile, UserProfile.user_id == EventParticipant.user_id)
    )
    row = (await db.execute(me_stmt)).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    p, name = row
    return AttendanceListResponse(
        event_id=e.id,
        host_user_id=e.host_user_id,
        items=[_entry_for(e.id, p, name)],
    )


async def _load_participant_with_name(
    db: AsyncSession, event_id: UUID, user_id: UUID
) -> tuple[EventParticipant, str | None] | None:
    stmt = (
        select(EventParticipant, UserProfile.display_name)
        .where(
            EventParticipant.event_id == event_id,
            EventParticipant.user_id == user_id,
        )
        .outerjoin(UserProfile, UserProfile.user_id == EventParticipant.user_id)
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        return None
    return row[0], row[1]


def _ensure_attendance_event_mutable(e: Event) -> None:
    if e.status not in _ATTENDANCE_MUTABLE_EVENT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Cannot update attendance on a {e.status} event",
        )


def _utc_now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _event_has_started(e: Event, *, now: datetime | None = None) -> bool:
    """
    Return True if the event's ``starts_at`` is at or before *now*.

    Defensive against legacy naive datetimes. Existing schemas store
    starts_at as ``DateTime(timezone=True)``; if a row predates that
    convention we treat it as UTC so the comparison still resolves.
    """
    if now is None:
        now = _utc_now()
    starts = e.starts_at
    if starts.tzinfo is None:
        starts = starts.replace(tzinfo=timezone.utc)
    return starts <= now


def _ensure_attendance_time_eligible(e: Event) -> None:
    """
    Attendance mutations are gated on the event having started.

    Completed events stay open for host corrections regardless of the
    clock — by definition they already started. Cancelled events are
    rejected earlier by ``_ensure_attendance_event_mutable``.
    """
    if e.status == "completed":
        return
    if not _event_has_started(e):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Attendance opens after the game starts",
        )


async def host_update_attendance(
    db: AsyncSession,
    event_id: UUID,
    current_user_id: UUID,
    body: HostAttendanceUpdateRequest,
) -> AttendanceEntry:
    e = await _get_event_or_404(db, event_id)
    # Private-event outsiders must look like 404 (matches GET pattern)
    # BEFORE the 403, so probing the host endpoint can't reveal that a
    # private event with this ID exists.
    await _enforce_private_visibility(db, e, current_user_id)
    if current_user_id != e.host_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the host can update attendance",
        )

    _ensure_attendance_event_mutable(e)
    _ensure_attendance_time_eligible(e)

    if body.attendance_status not in EVENT_ATTENDANCE_HOST_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Invalid attendance status: {body.attendance_status}",
        )

    loaded = await _load_participant_with_name(db, e.id, body.participant_user_id)
    if loaded is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Participant not found for this event",
        )
    participant, display_name = loaded

    # Left participants are frozen from attendance updates. The audit
    # trail still records they joined-then-left; no_show is a separate
    # outcome from "left before the event" and we don't auto-merge the
    # two. A future stream can revisit if product wants late marks.
    if participant.status == "left":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Cannot update attendance for a participant who left",
        )

    participant.attendance_status = body.attendance_status
    participant.attendance_confirmed_by_host_at = datetime.now(tz=timezone.utc)
    if body.attendance_note is not None:
        participant.attendance_note = body.attendance_note
    await db.commit()
    await db.refresh(participant)
    return _entry_for(e.id, participant, display_name)


async def self_report_attendance(
    db: AsyncSession,
    event_id: UUID,
    current_user_id: UUID,
    body: SelfAttendanceRequest,
) -> AttendanceEntry:
    e = await _get_event_or_404(db, event_id)
    # Outsiders on a private event get 404, never 403 — same hide-as-404
    # pattern as the GET and host-update endpoints.
    await _enforce_private_visibility(db, e, current_user_id)
    _ensure_attendance_event_mutable(e)
    _ensure_attendance_time_eligible(e)

    if body.attendance_status not in EVENT_ATTENDANCE_SELF_STATUSES:
        # Either invalid vocab or no_show (host-only). Returns the same
        # 422 either way — participants don't get to self-brand no_show.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Invalid self-report status: {body.attendance_status}",
        )

    # Only ACTIVE joined participants can self-report. A left
    # participant's attendance row is frozen alongside their leave row.
    participant = await _active_participant(db, e.id, current_user_id)
    if participant is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only active participants can self-report attendance",
        )

    participant.attendance_status = body.attendance_status
    participant.attendance_self_reported_at = datetime.now(tz=timezone.utc)
    if body.attendance_note is not None:
        participant.attendance_note = body.attendance_note
    await db.commit()
    await db.refresh(participant)

    # Resolve display name for the response payload.
    name_stmt = select(UserProfile.display_name).where(UserProfile.user_id == current_user_id)
    name = (await db.execute(name_stmt)).scalar_one_or_none()
    return _entry_for(e.id, participant, name)


# ---------------------------------------------------------------------------
# Lifecycle: cancel / complete
#
# Both transitions are host-only. We deliberately do NOT mutate
# attendance rows when an event is cancelled or completed — the
# audit trail (who joined, who left, what the host marked) stays
# intact and the rank service's scoreable filter already excludes
# rows on cancelled events.
# ---------------------------------------------------------------------------


async def cancel_event(db: AsyncSession, event_id: UUID, current_user_id: UUID) -> EventDetail:
    locked_stmt = select(Event).where(Event.id == event_id).with_for_update()
    e = (await db.execute(locked_stmt)).scalar_one_or_none()
    if e is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Hide-as-404 for outsiders on private events — same pattern as
    # join_event so the cancel endpoint can't be used to probe.
    await _enforce_private_visibility(db, e, current_user_id)

    if current_user_id != e.host_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the host can cancel this event",
        )

    if e.status == "cancelled":
        # Idempotent — return the current detail without mutation.
        return await get_event(db, e.id, current_user_id)

    if e.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Cannot cancel a completed event",
        )

    e.status = "cancelled"
    await db.commit()
    await db.refresh(e)
    return await get_event(db, e.id, current_user_id)


async def complete_event(db: AsyncSession, event_id: UUID, current_user_id: UUID) -> EventDetail:
    locked_stmt = select(Event).where(Event.id == event_id).with_for_update()
    e = (await db.execute(locked_stmt)).scalar_one_or_none()
    if e is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    await _enforce_private_visibility(db, e, current_user_id)

    if current_user_id != e.host_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the host can complete this event",
        )

    if e.status == "completed":
        # Idempotent — host may double-tap or retry.
        return await get_event(db, e.id, current_user_id)

    if e.status == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Cannot complete a cancelled event",
        )

    if not _event_has_started(e):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Cannot complete an event before it has started",
        )

    e.status = "completed"
    await db.commit()
    await db.refresh(e)
    return await get_event(db, e.id, current_user_id)
