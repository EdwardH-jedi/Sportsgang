from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.crew import PACE_MAX_SEC_PER_KM, PACE_MIN_SEC_PER_KM

# Group-run distance bounds (km).
RUN_DISTANCE_MIN_KM = 0.5
RUN_DISTANCE_MAX_KM = 100.0

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
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now(), nullable=False)

    # --- Group-run fields (run-first redesign; all optional) -----------
    # A group run is an Event, optionally owned by a crew. ``crew_id`` is
    # SET NULL when the crew is deleted so the run itself survives.
    crew_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("crews.id", ondelete="SET NULL", name="fk_events_crew_id_crews"),
        nullable=True,
        index=True,
    )
    # Public meeting point (not a home), stored to 5 dp (~1 m).
    meeting_lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    meeting_lng: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    distance_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pace_min_sec_per_km: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pace_max_sec_per_km: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    __table_args__ = (
        CheckConstraint("capacity >= 1", name="ck_events_capacity_min"),
        Index("ix_events_meeting_lat_lng", "meeting_lat", "meeting_lng"),
        CheckConstraint(
            f"distance_km IS NULL OR (distance_km >= {RUN_DISTANCE_MIN_KM} AND distance_km <= {RUN_DISTANCE_MAX_KM})",
            name="ck_events_distance_km_range",
        ),
        CheckConstraint(
            f"pace_min_sec_per_km IS NULL OR "
            f"(pace_min_sec_per_km >= {PACE_MIN_SEC_PER_KM} AND pace_min_sec_per_km <= {PACE_MAX_SEC_PER_KM})",
            name="ck_events_pace_min_range",
        ),
        CheckConstraint(
            f"pace_max_sec_per_km IS NULL OR "
            f"(pace_max_sec_per_km >= {PACE_MIN_SEC_PER_KM} AND pace_max_sec_per_km <= {PACE_MAX_SEC_PER_KM})",
            name="ck_events_pace_max_range",
        ),
        CheckConstraint(
            "pace_min_sec_per_km IS NULL OR pace_max_sec_per_km IS NULL OR pace_min_sec_per_km <= pace_max_sec_per_km",
            name="ck_events_pace_band_order",
        ),
    )


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
    joined_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
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
