"""Google Calendar integration tests — OAuth flow, sync state, and encryption.

Real Google API calls are not made in tests. The OAuth code exchange
and Calendar event creation are mocked via httpx.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator
from urllib.parse import parse_qs, urlparse
from uuid import UUID
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


def _future_booking_window(*, days_from_now: int = 7, duration_hours: int = 1) -> tuple[str, str]:
    """
    Return (starts_at, ends_at) ISO strings safely in the future.

    The Google Calendar tests previously hardcoded May 2026 timestamps,
    which started failing once that window moved into the past and the
    bookings endpoint began rejecting the requests. Compute the window
    relative to "now" so the tests remain stable across calendar dates.
    """
    starts = datetime.now(tz=timezone.utc) + timedelta(days=days_from_now)
    ends = starts + timedelta(hours=duration_hours)
    # Strip microseconds for cleaner ISO output, then append Z.
    starts_iso = starts.replace(microsecond=0).isoformat().replace("+00:00", "Z")
    ends_iso = ends.replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return starts_iso, ends_iso


from app.db.base import Base
from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app

from app.models import match, profile, user, chat, booking  # noqa: F401
from app.models import google_calendar, notification, safety  # noqa: F401

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
_engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
_TestSession = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)


@pytest.fixture(scope="module", autouse=True)
async def create_tables():
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with _TestSession() as session:
        yield session


async def _override_get_redis() -> AsyncGenerator:
    mock = AsyncMock()
    mock.ping = AsyncMock(return_value=True)
    mock.aclose = AsyncMock()
    yield mock


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_redis] = _override_get_redis
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def _register(client: AsyncClient, email: str) -> tuple[str, str]:
    r = await client.post("/auth/register", json={"email": email, "password": "password123"})
    token = r.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    return token, me.json()["id"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_status_not_connected(client: AsyncClient) -> None:
    token, _ = await _register(client, "gcal_status@example.com")
    r = await client.get("/users/me/google-calendar/status", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["connected"] is False


async def test_status_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/users/me/google-calendar/status")
    # FastAPI returns 401 (not 403) when no credentials are provided at all.
    assert r.status_code in (401, 403)


async def test_disconnect_when_not_connected_returns_404(client: AsyncClient) -> None:
    token, _ = await _register(client, "gcal_disc@example.com")
    r = await client.delete("/users/me/google-calendar/disconnect", headers=_auth(token))
    assert r.status_code == 404


async def test_auth_url_returns_url_when_configured(client: AsyncClient) -> None:
    token, _ = await _register(client, "gcal_url@example.com")
    # Patch settings so client_id is set
    with patch("app.services.google_calendar.get_settings") as mock_settings:
        mock_settings.return_value = MagicMock(
            google_client_id="test-client-id",
            google_client_secret="test-secret",
            google_redirect_uri="http://localhost:8000/users/me/google-calendar/callback",
        )
        r = await client.get("/users/me/google-calendar/auth-url", headers=_auth(token))
    assert r.status_code == 200
    assert "url" in r.json()
    assert "accounts.google.com" in r.json()["url"]


async def test_auth_url_unconfigured_returns_503(client: AsyncClient) -> None:
    token, _ = await _register(client, "gcal_503@example.com")
    # Default settings have empty google_client_id
    r = await client.get("/users/me/google-calendar/auth-url", headers=_auth(token))
    assert r.status_code == 503


async def test_oauth_callback_stores_tokens(client: AsyncClient) -> None:
    token, _ = await _register(client, "gcal_cb@example.com")

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "access_token": "test-access-token",
        "refresh_token": "test-refresh-token",
        "expires_in": 3600,
    }

    with patch("app.services.google_calendar.get_settings") as mock_settings, patch("httpx.AsyncClient") as mock_http:
        mock_settings.return_value = MagicMock(
            google_client_id="test-id",
            google_client_secret="test-secret",
            google_redirect_uri="http://localhost/callback",
        )
        mock_http.return_value.__aenter__ = AsyncMock(
            return_value=MagicMock(post=AsyncMock(return_value=mock_response))
        )
        mock_http.return_value.__aexit__ = AsyncMock(return_value=False)

        auth_url = await client.get("/users/me/google-calendar/auth-url", headers=_auth(token))
        state = parse_qs(urlparse(auth_url.json()["url"]).query)["state"][0]
        r = await client.get(f"/users/me/google-calendar/callback?code=testcode&state={state}")

    assert r.status_code == 200
    assert "connected" in r.text.lower()


async def test_oauth_url_uses_random_state_and_pkce(client: AsyncClient) -> None:
    token, user_id = await _register(client, "gcal_pkce@example.com")
    with patch("app.services.google_calendar.get_settings") as mock_settings:
        mock_settings.return_value = MagicMock(
            google_client_id="test-id",
            google_client_secret="test-secret",
            google_redirect_uri="http://localhost/callback",
        )
        response = await client.get("/users/me/google-calendar/auth-url", headers=_auth(token))

    query = parse_qs(urlparse(response.json()["url"]).query)
    assert query["state"][0] != user_id
    assert len(query["state"][0]) >= 32
    assert query["code_challenge_method"] == ["S256"]
    assert len(query["code_challenge"][0]) >= 43


async def test_oauth_state_is_one_time_and_bound_to_issuing_user(client: AsyncClient) -> None:
    from sqlalchemy import select

    from app.models.google_calendar import GoogleCalendarToken

    token_a, user_a = await _register(client, "gcal_state_a@example.com")
    token_b, user_b = await _register(client, "gcal_state_b@example.com")
    mock_response = MagicMock(status_code=200)
    mock_response.json.return_value = {
        "access_token": "state-access",
        "refresh_token": "state-refresh",
        "expires_in": 3600,
    }

    with patch("app.services.google_calendar.get_settings") as mock_settings, patch("httpx.AsyncClient") as mock_http:
        mock_settings.return_value = MagicMock(
            google_client_id="test-id",
            google_client_secret="test-secret",
            google_redirect_uri="http://localhost/callback",
        )
        mock_http.return_value.__aenter__ = AsyncMock(
            return_value=MagicMock(post=AsyncMock(return_value=mock_response))
        )
        mock_http.return_value.__aexit__ = AsyncMock(return_value=False)
        auth_url = await client.get("/users/me/google-calendar/auth-url", headers=_auth(token_a))
        state = parse_qs(urlparse(auth_url.json()["url"]).query)["state"][0]

        first = await client.get(
            f"/users/me/google-calendar/callback?code=first&state={state}",
            headers=_auth(token_b),
        )
        replay = await client.get(f"/users/me/google-calendar/callback?code=second&state={state}")

    assert first.status_code == 200
    assert replay.status_code == 400
    async with _TestSession() as session:
        bound_users = set((await session.execute(select(GoogleCalendarToken.user_id))).scalars().all())
    assert UUID(user_a) in bound_users
    assert UUID(user_b) not in bound_users


async def test_oauth_state_rejects_unknown_expired_and_redirect_mismatch(client: AsyncClient) -> None:
    from sqlalchemy import select

    from app.models.google_calendar import GoogleOAuthState

    token, _ = await _register(client, "gcal_state_invalid@example.com")
    settings = MagicMock(
        google_client_id="test-id",
        google_client_secret="test-secret",
        google_redirect_uri="http://localhost/callback",
    )
    with patch("app.services.google_calendar.get_settings", return_value=settings):
        unknown = await client.get("/users/me/google-calendar/callback?code=x&state=unknown")
        assert unknown.status_code == 400

        expired_url = await client.get("/users/me/google-calendar/auth-url", headers=_auth(token))
        expired_state = parse_qs(urlparse(expired_url.json()["url"]).query)["state"][0]
        async with _TestSession() as session:
            row = (
                await session.execute(
                    select(GoogleOAuthState).where(
                        GoogleOAuthState.state_hash == hashlib.sha256(expired_state.encode()).hexdigest()
                    )
                )
            ).scalar_one()
            row.expires_at = datetime.now(tz=timezone.utc) - timedelta(seconds=1)
            await session.commit()
        expired = await client.get(f"/users/me/google-calendar/callback?code=x&state={expired_state}")
        assert expired.status_code == 400

        mismatch_url = await client.get("/users/me/google-calendar/auth-url", headers=_auth(token))
        mismatch_state = parse_qs(urlparse(mismatch_url.json()["url"]).query)["state"][0]
        settings.google_redirect_uri = "http://localhost/changed-callback"
        mismatch = await client.get(f"/users/me/google-calendar/callback?code=x&state={mismatch_state}")
        assert mismatch.status_code == 400


async def test_sync_booking_requires_confirmed_status(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "gcal_sync_a@example.com")
    token_b, uid_b = await _register(client, "gcal_sync_b@example.com")

    # Create a match via mutual like
    await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_b, "action": "like", "sport": "gym"},
        headers=_auth(token_a),
    )
    r = await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_a, "action": "like", "sport": "gym"},
        headers=_auth(token_b),
    )
    match_id = r.json()["match_id"]

    # Create booking (status=proposed) with a future-relative window
    # so /bookings validation does not reject it as past-dated.
    starts_at, ends_at = _future_booking_window(days_from_now=7)
    book_r = await client.post(
        "/bookings",
        json={
            "match_id": match_id,
            "sport": "gym",
            "starts_at": starts_at,
            "ends_at": ends_at,
        },
        headers=_auth(token_a),
    )
    assert book_r.status_code == 201, book_r.text
    booking_id = book_r.json()["id"]

    # Try to sync — should fail with 422 (not confirmed)
    r = await client.post(
        f"/bookings/{booking_id}/sync-google-calendar",
        headers=_auth(token_a),
    )
    assert r.status_code == 422


async def test_sync_booking_requires_google_connection(client: AsyncClient) -> None:
    token_a, uid_a = await _register(client, "gcal_nosync_a@example.com")
    token_b, uid_b = await _register(client, "gcal_nosync_b@example.com")

    await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_b, "action": "like", "sport": "gym"},
        headers=_auth(token_a),
    )
    r = await client.post(
        "/discovery/actions",
        json={"target_user_id": uid_a, "action": "like", "sport": "gym"},
        headers=_auth(token_b),
    )
    match_id = r.json()["match_id"]

    starts_at, ends_at = _future_booking_window(days_from_now=8)
    book_r = await client.post(
        "/bookings",
        json={
            "match_id": match_id,
            "sport": "gym",
            "starts_at": starts_at,
            "ends_at": ends_at,
        },
        headers=_auth(token_a),
    )
    assert book_r.status_code == 201, book_r.text
    booking_id = book_r.json()["id"]
    # Confirm it
    await client.post(f"/bookings/{booking_id}/confirm", headers=_auth(token_b))

    # Try to sync without connecting Google Calendar
    r = await client.post(
        f"/bookings/{booking_id}/sync-google-calendar",
        headers=_auth(token_a),
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Encryption edge case tests
# ---------------------------------------------------------------------------


async def test_encrypt_decrypt_roundtrip() -> None:
    """encrypt_token / decrypt_token round-trip without a key (plaintext sentinel)."""
    from app.core.encryption import decrypt_token, encrypt_token

    raw = "ya29.some-access-token"
    stored = encrypt_token(raw)
    assert stored != raw  # must not be identical (sentinel prefix added when no key)
    assert decrypt_token(stored) == raw


async def test_decrypt_legacy_plaintext() -> None:
    """decrypt_token returns raw string when given a legacy unencrypted value."""
    from app.core.encryption import decrypt_token

    legacy = "ya29.legacy-token-without-encryption"
    # No sentinel prefix, no key configured → treated as legacy plaintext.
    assert decrypt_token(legacy) == legacy


async def test_decrypt_plain_prefix_without_key() -> None:
    """plain: sentinel values are correctly stripped by decrypt_token."""
    from app.core.encryption import decrypt_token

    sentinel_value = "plain:my-raw-token"
    assert decrypt_token(sentinel_value) == "my-raw-token"


async def test_encrypt_with_fernet_key_roundtrip() -> None:
    """encrypt_token / decrypt_token round-trip with a real Fernet key."""
    from cryptography.fernet import Fernet

    from app.core.encryption import decrypt_token, encrypt_token

    key = Fernet.generate_key().decode()

    with patch("app.core.encryption.get_settings") as mock_settings:
        mock_settings.return_value = MagicMock(field_encryption_key=key)
        raw = "ya29.encrypted-token"
        stored = encrypt_token(raw)
        # Ciphertext must differ from plaintext and have no sentinel prefix.
        assert stored != raw
        assert not stored.startswith("plain:")
        recovered = decrypt_token(stored)

    assert recovered == raw


async def test_encrypt_with_key_differs_each_call() -> None:
    """Fernet encryption is non-deterministic — two encryptions of the same value differ."""
    from cryptography.fernet import Fernet

    from app.core.encryption import encrypt_token

    key = Fernet.generate_key().decode()

    with patch("app.core.encryption.get_settings") as mock_settings:
        mock_settings.return_value = MagicMock(field_encryption_key=key)
        raw = "ya29.token"
        assert encrypt_token(raw) != encrypt_token(raw)


async def test_validate_encryption_config_blocks_production_without_key() -> None:
    """validate_encryption_config raises RuntimeError in production with no key."""
    from app.core.encryption import validate_encryption_config

    with patch("app.core.encryption.get_settings") as mock_settings:
        mock_settings.return_value = MagicMock(app_env="production", field_encryption_key="")
        try:
            validate_encryption_config()
            assert False, "Expected RuntimeError"
        except RuntimeError as exc:
            assert "FIELD_ENCRYPTION_KEY" in str(exc)


async def test_validate_encryption_config_blocks_staging_without_key() -> None:
    """Staging also refuses to start without a key (backups would leak tokens)."""
    from app.core.encryption import validate_encryption_config

    with patch("app.core.encryption.get_settings") as mock_settings:
        mock_settings.return_value = MagicMock(app_env="staging", field_encryption_key="")
        try:
            validate_encryption_config()
            assert False, "Expected RuntimeError"
        except RuntimeError as exc:
            assert "FIELD_ENCRYPTION_KEY" in str(exc)
            assert "staging" in str(exc)


async def test_validate_encryption_config_passes_local_without_key() -> None:
    """validate_encryption_config does not raise in local dev (plaintext fallback allowed)."""
    from app.core.encryption import encrypt_token, validate_encryption_config

    with patch("app.core.encryption.get_settings") as mock_settings:
        mock_settings.return_value = MagicMock(app_env="local", field_encryption_key="")
        validate_encryption_config()  # must not raise
        # Fallback still produces the sentinel-prefixed value.
        assert encrypt_token("x").startswith("plain:")


async def test_oauth_callback_stores_encrypted_tokens(client: AsyncClient) -> None:
    """Tokens written via the ORM are encrypted on disk but returned as
    plaintext when loaded — proving the ``EncryptedString`` round-trip works."""
    from sqlalchemy import select, text

    from app.models.google_calendar import GoogleCalendarToken

    token, user_id = await _register(client, "gcal_enc@example.com")

    raw_access = "ya29.test-access-encrypted"
    raw_refresh = "1//test-refresh-encrypted"

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "access_token": raw_access,
        "refresh_token": raw_refresh,
        "expires_in": 3600,
    }

    with patch("app.services.google_calendar.get_settings") as mock_settings, patch("httpx.AsyncClient") as mock_http:
        mock_settings.return_value = MagicMock(
            google_client_id="test-id",
            google_client_secret="test-secret",
            google_redirect_uri="http://localhost/callback",
        )
        mock_http.return_value.__aenter__ = AsyncMock(
            return_value=MagicMock(post=AsyncMock(return_value=mock_response))
        )
        mock_http.return_value.__aexit__ = AsyncMock(return_value=False)

        auth_url = await client.get("/users/me/google-calendar/auth-url", headers=_auth(token))
        state = parse_qs(urlparse(auth_url.json()["url"]).query)["state"][0]
        r = await client.get(f"/users/me/google-calendar/callback?code=testcode&state={state}")

    assert r.status_code == 200

    async with _TestSession() as session:
        from uuid import UUID

        # ORM-loaded values are decrypted transparently.
        stmt = select(GoogleCalendarToken).where(GoogleCalendarToken.user_id == UUID(user_id))
        row = (await session.execute(stmt)).scalar_one()
        assert row.access_token == raw_access
        assert row.refresh_token == raw_refresh

        # Raw on-disk values bypass the TypeDecorator and must NOT equal the plaintext.
        # Look up by the row's primary key (avoids UUID-serialisation differences
        # between SQLAlchemy's ``Uuid`` type and a raw string comparison on sqlite,
        # which stores UUIDs as hex without dashes).
        raw_row = (
            await session.execute(
                text("SELECT access_token, refresh_token FROM google_calendar_tokens WHERE id = :pk"),
                {"pk": str(row.id).replace("-", "")},
            )
        ).one()
        assert raw_row[0] != raw_access
        assert raw_row[1] != raw_refresh
