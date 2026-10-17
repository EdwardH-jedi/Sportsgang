from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DiscoveryAction(Base):
    __tablename__ = "discovery_actions"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    actor_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    target_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    sport: Mapped[str] = mapped_column(String(20), nullable=False)
    action: Mapped[str] = mapped_column(String(10), nullable=False)  # like | pass | save
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "actor_id",
            "target_id",
            "sport",
            name="uq_discovery_actions_actor_target_sport",
        ),
        CheckConstraint("actor_id <> target_id", name="ck_discovery_actions_distinct_users"),
    )


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user1_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    user2_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    sport: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "user1_id",
            "user2_id",
            "sport",
            name="uq_matches_canonical_pair_sport",
        ),
        CheckConstraint("user1_id <> user2_id", name="ck_matches_distinct_users"),
    )
