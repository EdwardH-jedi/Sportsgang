"""run + golf v2: sport preference and group-session detail columns

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-03

Additive only. Every new column is nullable and no existing row is written:
legacy sport profiles stay "not configured" (preferences_version IS NULL)
until the user edits them through the v2 flow, and legacy events carry NULL
details. No handicap, pace, verification or consent value is invented.
See docs/run-golf-v2/CONTRACTS.md.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None

_SPORT_PROFILE_COLUMNS = (
    sa.Column("preferences_version", sa.SmallInteger(), nullable=True),
    sa.Column("golf_handicap_tenths", sa.Integer(), nullable=True),
    sa.Column("golf_handicap_source", sa.String(length=20), nullable=True),
    sa.Column("golf_experience", sa.String(length=20), nullable=True),
    sa.Column("golf_partner_intents", sa.JSON(), nullable=True),
    sa.Column("golf_similarity_tolerance_tenths", sa.Integer(), nullable=True),
    sa.Column("golf_preferred_holes", sa.String(length=10), nullable=True),
    sa.Column("run_pace_mode", sa.String(length=20), nullable=True),
    sa.Column("run_pace_min_sec_per_km", sa.Integer(), nullable=True),
    sa.Column("run_pace_max_sec_per_km", sa.Integer(), nullable=True),
    sa.Column("run_distances_km", sa.JSON(), nullable=True),
    sa.Column("run_group_style", sa.String(length=30), nullable=True),
)

_EVENT_COLUMNS = (
    sa.Column("run_distance_km", sa.Float(), nullable=True),
    sa.Column("run_pace_mode", sa.String(length=20), nullable=True),
    sa.Column("run_pace_min_sec_per_km", sa.Integer(), nullable=True),
    sa.Column("run_pace_max_sec_per_km", sa.Integer(), nullable=True),
    sa.Column("run_group_style", sa.String(length=30), nullable=True),
    sa.Column("run_beginner_friendly", sa.Boolean(), nullable=True),
    sa.Column("run_walk_breaks_ok", sa.Boolean(), nullable=True),
    sa.Column("golf_holes", sa.SmallInteger(), nullable=True),
    sa.Column("golf_tee_time_status", sa.String(length=20), nullable=True),
    sa.Column("golf_estimated_cost_cents", sa.Integer(), nullable=True),
    sa.Column("golf_handicap_min_tenths", sa.Integer(), nullable=True),
    sa.Column("golf_handicap_max_tenths", sa.Integer(), nullable=True),
    sa.Column("golf_beginners_welcome", sa.Boolean(), nullable=True),
)


def upgrade() -> None:
    for column in _SPORT_PROFILE_COLUMNS:
        op.add_column("sport_profiles", column)
    # Both checks pass for every existing row (both pace columns are NULL).
    op.create_check_constraint(
        "ck_sport_profiles_run_pace_pair",
        "sport_profiles",
        "(run_pace_min_sec_per_km IS NULL) = (run_pace_max_sec_per_km IS NULL)",
    )
    op.create_check_constraint(
        "ck_sport_profiles_run_pace_order",
        "sport_profiles",
        "run_pace_min_sec_per_km IS NULL OR run_pace_min_sec_per_km <= run_pace_max_sec_per_km",
    )
    for column in _EVENT_COLUMNS:
        op.add_column("events", column)


def downgrade() -> None:
    for column in reversed(_EVENT_COLUMNS):
        op.drop_column("events", column.name)
    op.drop_constraint("ck_sport_profiles_run_pace_order", "sport_profiles", type_="check")
    op.drop_constraint("ck_sport_profiles_run_pace_pair", "sport_profiles", type_="check")
    for column in reversed(_SPORT_PROFILE_COLUMNS):
        op.drop_column("sport_profiles", column.name)
