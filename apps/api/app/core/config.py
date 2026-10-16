from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "local"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    postgres_url: str = "postgresql://protin:protin@localhost:5432/protin"
    redis_url: str = "redis://localhost:6379/0"

    # Google Calendar OAuth 2.0
    # Register at https://console.cloud.google.com/ → APIs & Services → Credentials
    google_client_id: str = ""
    google_client_secret: str = ""
    # Must match an authorised redirect URI in Google Cloud Console
    google_redirect_uri: str = "http://localhost:8000/users/me/google-calendar/callback"

    # Expo Push Notifications
    # Leave empty to disable push delivery (staging default)
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"

    # Shared secret for internal-only endpoints such as notification processing.
    # Required in staging/production for routes mounted under /internal.
    internal_api_token: str = ""

    # Apple Sign-in. Must match the app's bundle identifier (iOS) or the
    # Services ID (web) registered with Apple Developer. Required when the
    # /auth/apple endpoint is enabled in staging/production.
    apple_client_id: str = ""

    # Apple Sign-in token revocation (App Store 5.1.1(v)). Required ONLY to
    # revoke a user's Apple tokens during account deletion. When any of the
    # three are empty the backend skips the code-exchange/revoke steps
    # entirely (local dev, CI, reviewer env), leaving email/password flows and
    # identity-token verification unaffected.
    #   * apple_team_id     — 10-char Apple Developer Team ID (client_secret iss)
    #   * apple_key_id      — 10-char Key ID of the Sign in with Apple .p8 key
    #   * apple_private_key — the .p8 private key PEM contents (ES256). Provided
    #                         via secret/env; literal "\n" escapes are accepted.
    apple_team_id: str = ""
    apple_key_id: str = ""
    apple_private_key: str = ""

    # JWT signing key — must be set in .env for staging/production.
    secret_key: str = "change-me-in-production"

    # Field-level encryption key for OAuth tokens stored in the database.
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Must be set in production; optional in local/staging (tokens stored as plaintext with a sentinel prefix).
    field_encryption_key: str = ""

    # Comma-separated allowed CORS origins. Empty = wildcard (local dev only).
    cors_origins: str = ""

    # Local/dev media storage. Profile photos are written to
    # ``{media_root}/profile_photos/{user_id}/{file}`` and exposed at
    # ``{media_url_prefix}/profile_photos/{user_id}/{file}`` via StaticFiles.
    # Cloud object storage (S3/GCS) is a future replacement.
    media_root: str = "media"
    media_url_prefix: str = "/media"

    # Google Places API (New) — venue discovery provider.
    #
    # Used by app/services/places.py to back the "Google-Maps-like venue
    # density" picker results in v1.1. Empty string is the default and
    # the provider returns [] without making any HTTP call — so the
    # local seed catalog continues to work unchanged when the key is
    # not configured (local dev, CI, App Store reviewer environment).
    google_places_api_key: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        if not self.cors_origins.strip():
            return []
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def async_postgres_url(self) -> str:
        """Return a postgresql+asyncpg:// URL for use with SQLAlchemy asyncio."""
        url = self.postgres_url
        # Normalise legacy postgres:// scheme
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        if not url.startswith("postgresql+asyncpg://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
