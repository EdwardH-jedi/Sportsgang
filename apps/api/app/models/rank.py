from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Reason vocabulary — kept as plain strings (not Python Enum) so adding a
# new event type is an append-only change with no DB migration. Validation
# happens in the service layer.

# Honor reasons:
#   session_completed       — both parties played a confirmed booking
#   no_show_against_user    — someone else marked this user as a no-show
#   no_show_marked_by_user  — this user marked someone else no-show
#                              (symmetric anti-abuse penalty)
#   late_cancellation       — this user cancelled a confirmed booking
HONOR_REASONS: frozenset[str] = frozenset(
    {
        "session_completed",
        "no_show_against_user",
        "no_show_marked_by_user",
        "late_cancellation",
    }
)

# Rank reasons (only positive in V2.0 — no result verification yet, so
# play happens or it doesn't):
#   session_completed       — sport-specific +N points for completed play
RANK_REASONS: frozenset[str] = frozenset({"session_completed"})


class HonorEvent(Base):
    """
    Append-only ledger of honor / reliability deltas applied to a user.

    Honor reflects long-term reliability; never compute a single user's
    behavior from one event. The summary service folds these rows into a
    bounded score (HONOR_FLOOR..HONOR_CEILING). Booking reference is
    nullable so a future moderator-issued adjustment can land here too.
    """

    __tablename__ = "honor_events"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    delta: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(40), nullable=False)
    booking_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "booking_id", "reason", name="uq_honor_events_user_booking_reason"),)


class RankEvent(Base):
    """
    Append-only sport-specific rank-points ledger.

    Folding into a per-(user, sport) summary happens in the service layer.
    A user with no events for a sport simply has no rank in that sport —
    the summary returns the empty list, never a fabricated baseline.
    """

    __tablename__ = "rank_events"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    sport: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    delta: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(40), nullable=False)
    booking_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "booking_id", "reason", name="uq_rank_events_user_booking_reason"),)
