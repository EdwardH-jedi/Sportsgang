from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class SportProfileSummary(BaseModel):
    sport: str
    level: str
    gym_name: str | None = None
    golf_club: str | None = None


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
    # Coarse distance from the caller's supplied lat/lng to this user's
    # (already ~1 km rounded) home location: rounded UP to the next
    # 0.5 km, minimum 1.0. Only set when /discovery is called with
    # lat & lng; null otherwise (and on every non-discovery surface).
    distance_km: float | None = None


class DiscoveryFeedResponse(BaseModel):
    items: list[PartnerCardResponse]
    total: int
    limit: int
    offset: int


class RecordActionRequest(BaseModel):
    target_user_id: UUID
    action: Literal["like", "pass", "save"]
    sport: Literal["gym", "golf", "tennis", "running"]


class RecordActionResponse(BaseModel):
    action: str
    match_created: bool
    match_id: UUID | None = None
