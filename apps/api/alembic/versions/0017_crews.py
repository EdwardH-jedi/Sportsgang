"""crews + crew_members tables

Revision ID: 0017
Revises: 0016
Create Date: 2026-09-24

Run-first redesign: a Crew is a persistent group of runners with a home
area and a typical pace band. Two new tables, nothing existing changes:

  * crews         — one row per crew; home_lat/home_lng are rounded to
                    2 dp by the API and never returned to clients
  * crew_members  — one row per (crew, user) with role owner|member

Purely additive; v1.0 clients never touch these tables.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crews",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("sport", sa.String(30), nullable=False, server_default="running"),
        sa.Column("home_area", sa.String(80), nullable=False),
        sa.Column("home_lat", sa.Float(), nullable=True),
        sa.Column("home_lng", sa.Float(), nullable=True),
        sa.Column("pace_min_sec_per_km", sa.Integer(), nullable=True),
        sa.Column("pace_max_sec_per_km", sa.Integer(), nullable=True),
        sa.Column("visibility", sa.String(20), nullable=False, server_default="public"),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.CheckConstraint(
            "pace_min_sec_per_km IS NULL OR (pace_min_sec_per_km >= 150 AND pace_min_sec_per_km <= 900)",
            name="ck_crews_pace_min_range",
        ),
        sa.CheckConstraint(
            "pace_max_sec_per_km IS NULL OR (pace_max_sec_per_km >= 150 AND pace_max_sec_per_km <= 900)",
            name="ck_crews_pace_max_range",
        ),
        sa.CheckConstraint(
            "pace_min_sec_per_km IS NULL OR pace_max_sec_per_km IS NULL OR pace_min_sec_per_km <= pace_max_sec_per_km",
            name="ck_crews_pace_band_order",
        ),
    )
    op.create_index("ix_crews_sport", "crews", ["sport"])
    op.create_index("ix_crews_created_by", "crews", ["created_by"])
    op.create_index("ix_crews_home_lat_lng", "crews", ["home_lat", "home_lng"])

    op.create_table(
        "crew_members",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("crew_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="member"),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["crew_id"], ["crews.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("crew_id", "user_id", name="uq_crew_members_crew_user"),
    )
    op.create_index("ix_crew_members_crew_id", "crew_members", ["crew_id"])
    op.create_index("ix_crew_members_user_id", "crew_members", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_crew_members_user_id", table_name="crew_members")
    op.drop_index("ix_crew_members_crew_id", table_name="crew_members")
    op.drop_table("crew_members")

    op.drop_index("ix_crews_home_lat_lng", table_name="crews")
    op.drop_index("ix_crews_created_by", table_name="crews")
    op.drop_index("ix_crews_sport", table_name="crews")
    op.drop_table("crews")
