"""enforce participant integrity and add one-time Google OAuth state

Revision ID: 0017
Revises: 0016
Create Date: 2026-08-22

This migration is intentionally non-destructive. It refuses to add constraints
when invalid historical rows exist so an operator can review them rather than
silently deleting or rewriting user data.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import context, op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def _assert_no_invalid_history() -> None:
    if context.is_offline_mode():
        return
    connection = op.get_bind()
    checks = {
        "self discovery actions": "SELECT count(*) FROM discovery_actions WHERE actor_id = target_id",
        "self matches": "SELECT count(*) FROM matches WHERE user1_id = user2_id",
        "self bookings": "SELECT count(*) FROM bookings WHERE proposer_id = partner_id",
        "invalid booking time ranges": "SELECT count(*) FROM bookings WHERE starts_at >= ends_at",
        "duplicate honor events": """
            SELECT count(*) FROM (
                SELECT user_id, booking_id, reason
                FROM honor_events
                WHERE booking_id IS NOT NULL
                GROUP BY user_id, booking_id, reason
                HAVING count(*) > 1
            ) duplicates
        """,
        "duplicate rank events": """
            SELECT count(*) FROM (
                SELECT user_id, booking_id, reason
                FROM rank_events
                WHERE booking_id IS NOT NULL
                GROUP BY user_id, booking_id, reason
                HAVING count(*) > 1
            ) duplicates
        """,
    }
    failures = [label for label, query in checks.items() if connection.execute(sa.text(query)).scalar_one()]
    if failures:
        raise RuntimeError("Cannot apply integrity constraints; review existing rows first: " + ", ".join(failures))


def upgrade() -> None:
    _assert_no_invalid_history()

    op.create_check_constraint(
        "ck_discovery_actions_distinct_users",
        "discovery_actions",
        "actor_id <> target_id",
    )
    op.create_check_constraint("ck_matches_distinct_users", "matches", "user1_id <> user2_id")
    op.create_check_constraint("ck_bookings_distinct_users", "bookings", "proposer_id <> partner_id")
    op.create_check_constraint("ck_bookings_valid_time_range", "bookings", "starts_at < ends_at")
    op.create_unique_constraint(
        "uq_honor_events_user_booking_reason",
        "honor_events",
        ["user_id", "booking_id", "reason"],
    )
    op.create_unique_constraint(
        "uq_rank_events_user_booking_reason",
        "rank_events",
        ["user_id", "booking_id", "reason"],
    )

    op.create_table(
        "google_oauth_states",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("state_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("code_verifier", sa.String(length=128), nullable=False),
        sa.Column("redirect_uri", sa.String(length=512), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("state_hash", name="uq_google_oauth_states_state_hash"),
    )
    op.create_index("ix_google_oauth_states_state_hash", "google_oauth_states", ["state_hash"])
    op.create_index("ix_google_oauth_states_user_id", "google_oauth_states", ["user_id"])
    op.create_index("ix_google_oauth_states_expires_at", "google_oauth_states", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_google_oauth_states_expires_at", table_name="google_oauth_states")
    op.drop_index("ix_google_oauth_states_user_id", table_name="google_oauth_states")
    op.drop_index("ix_google_oauth_states_state_hash", table_name="google_oauth_states")
    op.drop_table("google_oauth_states")

    op.drop_constraint("uq_rank_events_user_booking_reason", "rank_events", type_="unique")
    op.drop_constraint("uq_honor_events_user_booking_reason", "honor_events", type_="unique")
    op.drop_constraint("ck_bookings_valid_time_range", "bookings", type_="check")
    op.drop_constraint("ck_bookings_distinct_users", "bookings", type_="check")
    op.drop_constraint("ck_matches_distinct_users", "matches", type_="check")
    op.drop_constraint("ck_discovery_actions_distinct_users", "discovery_actions", type_="check")
