"""add coarse home location to user_profiles

Revision ID: 0016
Revises: 0015
Create Date: 2026-09-24

Run-first discovery ranks runner candidates by distance. Two nullable
columns hold a *coarse* home location (the API rounds to 2 decimal
places, ~1 km, before writing). Existing rows stay NULL, and users
without a home location are simply excluded from geo-filtered discovery
— v1.0 clients never send or read these columns.

A composite (home_lat, home_lng) index backs the bounding-box prefilter.
Constraint changes go through ``batch_alter_table`` so the migration
also runs on SQLite (on Postgres the batch block emits plain ALTERs).
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("user_profiles") as batch:
        batch.add_column(sa.Column("home_lat", sa.Float(), nullable=True))
        batch.add_column(sa.Column("home_lng", sa.Float(), nullable=True))
        batch.create_check_constraint(
            "ck_user_profiles_home_lat_range",
            "home_lat IS NULL OR (home_lat >= -90 AND home_lat <= 90)",
        )
        batch.create_check_constraint(
            "ck_user_profiles_home_lng_range",
            "home_lng IS NULL OR (home_lng >= -180 AND home_lng <= 180)",
        )
    op.create_index("ix_user_profiles_home_lat_lng", "user_profiles", ["home_lat", "home_lng"])


def downgrade() -> None:
    op.drop_index("ix_user_profiles_home_lat_lng", table_name="user_profiles")
    with op.batch_alter_table("user_profiles") as batch:
        batch.drop_constraint("ck_user_profiles_home_lng_range", type_="check")
        batch.drop_constraint("ck_user_profiles_home_lat_range", type_="check")
        batch.drop_column("home_lng")
        batch.drop_column("home_lat")
