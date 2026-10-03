from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.discovery import PartnerCardResponse
from app.schemas.venues import VenueResponse


class CreateBookingRequest(BaseModel):
    match_id: UUID
    sport: Literal["gym", "golf", "tennis", "running"]
    starts_at: datetime
    ends_at: datetime
    location: str | None = Field(default=None, max_length=200)
    # Optional reference to a Nearby Courts catalog entry. When provided,
    # the API resolves the venue and includes it in the response. The
    # freeform `location` string is preserved alongside.
    venue_id: UUID | None = None
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("starts_at", "ends_at")
    @classmethod
    def _utc_instant(cls, value: datetime) -> datetime:
        """One absolute UTC instant, independent of the API process time zone.

        Offset-free values come from clients that predate the Sydney composer
        and are interpreted as UTC — the convention the past-time check always
        applied (docs/run-golf-v2/CONTRACTS.md §7). Values with an offset keep
        their instant. Both bounds are normalized before any comparison,
        validation or storage, so equivalent offsets store identical values.
        """
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class BookingResponse(BaseModel):
    id: UUID
    match_id: UUID
    proposer_id: UUID
    partner_id: UUID
    sport: str
    starts_at: datetime
    ends_at: datetime
    location: str | None
    notes: str | None
    status: str
    created_at: datetime
    updated_at: datetime
    partner: PartnerCardResponse
    venue: VenueResponse | None = None

    model_config = {"from_attributes": True}


class BookingListResponse(BaseModel):
    items: list[BookingResponse]
    total: int
    limit: int
    offset: int
