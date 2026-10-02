from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class SportProfileSummary(BaseModel):
    sport: str
    level: str
    gym_name: str | None = None
    golf_club: str | None = None
    # v2 fields (null on legacy rows). Tolerance stays private to its owner.
    preferences_configured: bool = False
    preferred_times: list[str] = []
    golf_handicap_tenths: int | None = None
    golf_handicap_source: str | None = None
    golf_experience: str | None = None
    golf_partner_intents: list[str] | None = None
    golf_preferred_holes: str | None = None
    run_pace_mode: str | None = None
    run_pace_min_sec_per_km: int | None = None
    run_pace_max_sec_per_km: int | None = None
    run_distances_km: list[float] | None = None
    run_group_style: str | None = None


class CompatibilityNoteResponse(BaseModel):
    code: str
    text: str


class CompatibilityResponse(BaseModel):
    """v2 bilateral compatibility (running/golf feeds only)."""

    tier: Literal["compatible", "unverified", "needs_setup"]
    reasons: list[CompatibilityNoteResponse] = []
    caveats: list[CompatibilityNoteResponse] = []


class PartnerCardResponse(BaseModel):
    user_id: UUID
    display_name: str
    suburb: str | None = None
    # Truncated 160-char preview for the feed card. Full text lives in `bio`.
    bio_excerpt: str | None = None
    # Full bio for the profile-detail preview (V1 partner detail modal).
    bio: str | None = None
    avatar_url: str | None = None
    # Ordered list of all profile photos (avatar_url is photo_urls[0] when set).
    # Empty when the user has not uploaded any photos.
    photo_urls: list[str] = []
    age: int | None = None
    sport_profiles: list[SportProfileSummary]
    # v2 running/golf feeds only; null on legacy gym/tennis feeds.
    compatibility: CompatibilityResponse | None = None


class DiscoveryFeedResponse(BaseModel):
    items: list[PartnerCardResponse]
    # Eligible candidates inside the bounded scoring pool, not global coverage.
    total: int
    limit: int
    offset: int
    next_cursor: str | None = None
    viewer_setup_required: bool = False
    pool_limit: int


class RecordActionRequest(BaseModel):
    target_user_id: UUID
    action: Literal["like", "pass", "save"]
    sport: Literal["gym", "golf", "tennis", "running"]


class RecordActionResponse(BaseModel):
    action: str
    match_created: bool
    match_id: UUID | None = None
