from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Status vocabulary kept as plain strings (no DB enum) so adding new
# values like "started" later does not require a migration. Service
# layer validates allowed transitions.
EVENT_STATUSES: frozenset[str] = frozenset({"open", "full", "cancelled", "completed"})
EVENT_MODES: frozenset[str] = frozenset({"casual", "ranked"})
EVENT_VISIBILITIES: frozenset[str] = frozenset({"public", "private"})
EVENT_PARTICIPANT_STATUSES: frozenset[str] = frozenset({"joined", "left"})

# Attendance vocabulary. Kept as plain strings so future values
# (e.g. "late") can be added without a DB migration.
#
#   pending     — default; outcome not yet recorded
#   attended    — confirmed present
#   no_show     — expected but did not attend; host-only mark
#   excused     — could not attend with valid reason (illness, conflict);
#                 self-report or host mark
EVENT_ATTENDANCE_STATUSES: frozenset[str] = frozenset({"pending", "attended", "no_show", "excused"})
# Host can set any of these (including resetting back to pending).
EVENT_ATTENDANCE_HOST_STATUSES: frozenset[str] = EVENT_ATTENDANCE_STATUSES
# Participants self-report only positive / excused outcomes — they cannot
# brand themselves as no_show, and resetting back to pending is host-only.
EVENT_ATTENDANCE_SELF_STATUSES: frozenset[str] = frozenset({"attended", "excused"})


class Event(Base):
    """
    Group event ("battle" / "game") that one host opens and other users
    can join. Distinct from ``Booking`` (1:1 partner session) and
    ``Tournament`` (multi-round structured competition).
    """

    __tablename__ = "events"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    host_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    sport: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    mode: Mapped[str] = mapped_column(String(20), nullable=False, default="casual")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    location_text: Mapped[str] = mapped_column(String(200), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="public")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")

    # v2 running/golf session details (migration 0016). NULL on every
    # legacy event. Validated in app/schemas/events.py; all of these are
    # informational — only status and capacity gate joining.
    run_distance_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    run_pace_mode: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    run_pace_min_sec_per_km: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    run_pace_max_sec_per_km: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    run_group_style: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    run_beginner_friendly: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    run_walk_breaks_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    golf_holes: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    # Host's declaration ("secured" / "planning"); never a course booking.
    golf_tee_time_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    golf_estimated_cost_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    golf_handicap_min_tenths: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    golf_handicap_max_tenths: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    golf_beginners_welcome: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (CheckConstraint("capacity >= 1", name="ck_events_capacity_min"),)


class EventParticipant(Base):
    """
    Soft join: rows are not deleted on leave so we keep an audit trail
    (future no-show / attendance stream consumes this).
    """

    __tablename__ = "event_participants"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    event_id: Mapped[UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="joined")
    # TIMESTAMP WITH TIME ZONE, as created by migration 0010. Declaring it
    # timezone-aware here makes SQLAlchemy bind it as timestamptz; the old
    # naive declaration bound `::TIMESTAMP WITHOUT TIME ZONE`, which asyncpg
    # rejects for the aware UTC value a rejoin writes (review F1).
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    left_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Attendance lifecycle is independent of participant lifecycle.
    # status='left' means the user departed before attendance was
    # finalized; attendance_status='no_show' means they were expected
    # and didn't appear. The two never get auto-merged.
    attendance_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", server_default="pending"
    )
    attendance_confirmed_by_host_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    attendance_self_reported_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    attendance_note: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    __table_args__ = (
        # One active "joined" row per (event, user) is enforced in the
        # service layer rather than a partial index, so the constraint
        # works identically on SQLite (tests) and Postgres (prod).
        UniqueConstraint("event_id", "user_id", "status", name="uq_event_participants_event_user_status"),
    )
