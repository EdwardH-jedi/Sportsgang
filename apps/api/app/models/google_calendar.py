from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.encryption import EncryptedString
from app.db.base import Base


class GoogleCalendarToken(Base):
    """
    Stores a user's Google OAuth tokens for Calendar access.

    access_token and refresh_token are wrapped in ``EncryptedString`` so the
    ciphertext (Fernet/AES-256-GCM) is persisted automatically. Callers in
    the service layer read/write raw plaintext tokens — the ORM handles
    encrypt-on-bind and decrypt-on-load. Production requires
    FIELD_ENCRYPTION_KEY; the app refuses to start without it. In local dev
    a ``plain:`` sentinel is used instead of real encryption.
    """

    __tablename__ = "google_calendar_tokens"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    access_token: Mapped[str] = mapped_column(EncryptedString(2048), nullable=False)
    refresh_token: Mapped[str] = mapped_column(EncryptedString(512), nullable=False)
    token_expiry: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Google Calendar ID to write events into (usually "primary")
    calendar_id: Mapped[str] = mapped_column(String(256), nullable=False, default="primary")
    connected_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)


class GoogleOAuthState(Base):
    """One-time server-side binding for a Google OAuth authorization request."""

    __tablename__ = "google_oauth_states"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    state_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code_verifier: Mapped[str] = mapped_column(String(128), nullable=False)
    redirect_uri: Mapped[str] = mapped_column(String(512), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("state_hash", name="uq_google_oauth_states_state_hash"),)


class CalendarBookingSync(Base):
    """
    Tracks the sync state between a Protin booking and a Google Calendar event.
    One row per (booking, user) pair — each participant syncs independently.
    """

    __tablename__ = "calendar_booking_syncs"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    booking_id: Mapped[UUID] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    google_event_id: Mapped[str] = mapped_column(String(256), nullable=False)
    # pending | synced | failed | cancelled
    sync_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("booking_id", "user_id", name="uq_calendar_booking_syncs_booking_user"),)
