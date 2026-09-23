"""group-run fields on events

Revision ID: 0018
Revises: 0017
Create Date: 2026-09-24

A group run is an ordinary ``events`` row with optional run metadata.
Every new column is nullable, so existing events and v1.0 clients are
unaffected:

  * crew_id              — FK crews.id, ON DELETE SET NULL
  * meeting_lat/lng      — public meeting point (API stores 5 dp)
  * distance_km          — planned distance, 0.5–100
  * pace_min/max_sec_per_km — pace band, 150–900 s/km, min <= max

Constraint changes go through ``batch_alter_table`` so the migration
also runs on SQLite (on Postgres the batch block emits plain ALTERs).
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("events") as batch:
        batch.add_column(sa.Column("crew_id", sa.UUID(), nullable=True))
        batch.add_column(sa.Column("meeting_lat", sa.Float(), nullable=True))
        batch.add_column(sa.Column("meeting_lng", sa.Float(), nullable=True))
        batch.add_column(sa.Column("distance_km", sa.Float(), nullable=True))
        batch.add_column(sa.Column("pace_min_sec_per_km", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("pace_max_sec_per_km", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_events_crew_id_crews", "crews", ["crew_id"], ["id"], ondelete="SET NULL")
        batch.create_check_constraint(
            "ck_events_distance_km_range",
            "distance_km IS NULL OR (distance_km >= 0.5 AND distance_km <= 100.0)",
        )
        batch.create_check_constraint(
            "ck_events_pace_min_range",
            "pace_min_sec_per_km IS NULL OR (pace_min_sec_per_km >= 150 AND pace_min_sec_per_km <= 900)",
        )
        batch.create_check_constraint(
            "ck_events_pace_max_range",
            "pace_max_sec_per_km IS NULL OR (pace_max_sec_per_km >= 150 AND pace_max_sec_per_km <= 900)",
        )
        batch.create_check_constraint(
            "ck_events_pace_band_order",
            "pace_min_sec_per_km IS NULL OR pace_max_sec_per_km IS NULL OR pace_min_sec_per_km <= pace_max_sec_per_km",
        )
    op.create_index("ix_events_crew_id", "events", ["crew_id"])
    op.create_index("ix_events_meeting_lat_lng", "events", ["meeting_lat", "meeting_lng"])


def downgrade() -> None:
    op.drop_index("ix_events_meeting_lat_lng", table_name="events")
    op.drop_index("ix_events_crew_id", table_name="events")
    with op.batch_alter_table("events") as batch:
        batch.drop_constraint("ck_events_pace_band_order", type_="check")
        batch.drop_constraint("ck_events_pace_max_range", type_="check")
        batch.drop_constraint("ck_events_pace_min_range", type_="check")
        batch.drop_constraint("ck_events_distance_km_range", type_="check")
        batch.drop_constraint("fk_events_crew_id_crews", type_="foreignkey")
        batch.drop_column("pace_max_sec_per_km")
        batch.drop_column("pace_min_sec_per_km")
        batch.drop_column("distance_km")
        batch.drop_column("meeting_lng")
        batch.drop_column("meeting_lat")
        batch.drop_column("crew_id")
