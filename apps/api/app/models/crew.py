from __future__ import annotations

from datetime import datetime, timezone
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

# Vocabularies kept as plain strings (no DB enum), matching events.
CREW_ROLES: frozenset[str] = frozenset({"owner", "member"})
# Only public crews exist for now. The column is there so invite-only
# crews can ship later without a migration.
CREW_VISIBILITIES: frozenset[str] = frozenset({"public"})

# Pace band bounds in seconds per km: 2:30/km (elite) to 15:00/km
# (walk/run). Shared by crews and group runs.
PACE_MIN_SEC_PER_KM = 150
PACE_MAX_SEC_PER_KM = 900


def _utcnow() -> datetime:
    # Python-side default alongside server_default so rows created in the
    # same second still order deterministically (SQLite's CURRENT_TIMESTAMP
    # has one-second resolution).
    return datetime.now(tz=timezone.utc)


class Crew(Base):
    """
    A persistent group of runners with a home area and a typical pace
    band. Membership lives in :class:`CrewMember`; the ``owner`` role
    there (not ``created_by``) is what grants edit/delete rights.

    ``home_lat``/``home_lng`` are stored rounded to 2 dp (~1 km) and are
    never returned by the API — list responses expose a coarse
    ``distance_km`` instead, the same privacy rule as profile homes.
    """

    __tablename__ = "crews"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    sport: Mapped[str] = mapped_column(
        String(30), nullable=False, default="running", server_default="running", index=True
    )
    home_area: Mapped[str] = mapped_column(String(80), nullable=False)
    home_lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    home_lng: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pace_min_sec_per_km: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pace_max_sec_per_km: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="public", server_default="public")
    # Audit only. SET NULL so deleting the creator's account never
    # deletes a crew other people still belong to.
    created_by: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_crews_home_lat_lng", "home_lat", "home_lng"),
        CheckConstraint(
            f"pace_min_sec_per_km IS NULL OR "
            f"(pace_min_sec_per_km >= {PACE_MIN_SEC_PER_KM} AND pace_min_sec_per_km <= {PACE_MAX_SEC_PER_KM})",
            name="ck_crews_pace_min_range",
        ),
        CheckConstraint(
            f"pace_max_sec_per_km IS NULL OR "
            f"(pace_max_sec_per_km >= {PACE_MIN_SEC_PER_KM} AND pace_max_sec_per_km <= {PACE_MAX_SEC_PER_KM})",
            name="ck_crews_pace_max_range",
        ),
        CheckConstraint(
            "pace_min_sec_per_km IS NULL OR pace_max_sec_per_km IS NULL OR pace_min_sec_per_km <= pace_max_sec_per_km",
            name="ck_crews_pace_band_order",
        ),
    )


class CrewMember(Base):
    """
    One row per (crew, user). Leaving hard-deletes the row — unlike
    event participation there is no attendance audit trail to keep.
    """

    __tablename__ = "crew_members"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    crew_id: Mapped[UUID] = mapped_column(ForeignKey("crews.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="member", server_default="member")
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now(), nullable=False
    )

    __table_args__ = (UniqueConstraint("crew_id", "user_id", name="uq_crew_members_crew_user"),)
