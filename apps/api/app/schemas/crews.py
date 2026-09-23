from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.geo import HOME_COORD_DECIMALS, round_coord
from app.models.crew import PACE_MAX_SEC_PER_KM, PACE_MIN_SEC_PER_KM
from app.schemas.events import EventSummary, check_pace_band

CrewRole = Literal["owner", "member"]
CrewVisibility = Literal["public"]


def _check_coord_pair(model: BaseModel, lat: float | None, lng: float | None) -> None:
    lat_sent = "home_lat" in model.model_fields_set
    lng_sent = "home_lng" in model.model_fields_set
    if lat_sent != lng_sent or (lat is None) != (lng is None):
        raise ValueError("home_lat and home_lng must be provided together")


class CreateCrewRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    description: str | None = Field(default=None, max_length=500)
    sport: str = Field(default="running", min_length=1, max_length=30)
    # Display name of the crew's home area, e.g. "Surry Hills".
    home_area: str = Field(min_length=1, max_length=80)
    # Optional point used for "crews near you". Rounded to 2 dp (~1 km)
    # and never returned — lists expose a coarse distance_km instead.
    home_lat: float | None = Field(default=None, ge=-90.0, le=90.0)
    home_lng: float | None = Field(default=None, ge=-180.0, le=180.0)
    pace_min_sec_per_km: int | None = Field(default=None, ge=PACE_MIN_SEC_PER_KM, le=PACE_MAX_SEC_PER_KM)
    pace_max_sec_per_km: int | None = Field(default=None, ge=PACE_MIN_SEC_PER_KM, le=PACE_MAX_SEC_PER_KM)
    visibility: CrewVisibility = "public"

    @field_validator("name", "home_area", "sport")
    @classmethod
    def _strip_required(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("must not be blank")
        return v

    @field_validator("home_lat", "home_lng")
    @classmethod
    def _round(cls, v: float | None) -> float | None:
        return round_coord(v, HOME_COORD_DECIMALS)

    @model_validator(mode="after")
    def _check(self) -> "CreateCrewRequest":
        _check_coord_pair(self, self.home_lat, self.home_lng)
        check_pace_band(self.pace_min_sec_per_km, self.pace_max_sec_per_km)
        return self


class UpdateCrewRequest(BaseModel):
    """
    Partial update (PATCH). Omitted fields are untouched; nullable
    fields (description, home_lat/home_lng, pace bounds) can be cleared
    by sending null. The pace band is re-validated against the merged
    result, so sending only ``pace_max_sec_per_km`` below the stored
    minimum is rejected.
    """

    name: str | None = Field(default=None, min_length=1, max_length=60)
    description: str | None = Field(default=None, max_length=500)
    sport: str | None = Field(default=None, min_length=1, max_length=30)
    home_area: str | None = Field(default=None, min_length=1, max_length=80)
    home_lat: float | None = Field(default=None, ge=-90.0, le=90.0)
    home_lng: float | None = Field(default=None, ge=-180.0, le=180.0)
    pace_min_sec_per_km: int | None = Field(default=None, ge=PACE_MIN_SEC_PER_KM, le=PACE_MAX_SEC_PER_KM)
    pace_max_sec_per_km: int | None = Field(default=None, ge=PACE_MIN_SEC_PER_KM, le=PACE_MAX_SEC_PER_KM)
    visibility: CrewVisibility | None = None

    @field_validator("name", "home_area", "sport")
    @classmethod
    def _strip_optional(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = " ".join(v.split())
        if not v:
            raise ValueError("must not be blank")
        return v

    @field_validator("home_lat", "home_lng")
    @classmethod
    def _round(cls, v: float | None) -> float | None:
        return round_coord(v, HOME_COORD_DECIMALS)

    @model_validator(mode="after")
    def _check(self) -> "UpdateCrewRequest":
        for required in ("name", "home_area", "sport", "visibility"):
            if required in self.model_fields_set and getattr(self, required) is None:
                raise ValueError(f"{required} cannot be null")
        if "home_lat" in self.model_fields_set or "home_lng" in self.model_fields_set:
            _check_coord_pair(self, self.home_lat, self.home_lng)
        check_pace_band(self.pace_min_sec_per_km, self.pace_max_sec_per_km)
        return self


class CrewNextRun(BaseModel):
    """Compact summary of a crew's next upcoming group run (list cards)."""

    id: UUID
    title: str
    starts_at: datetime
    location_text: str
    distance_km: float | None = None
    pace_min_sec_per_km: int | None = None
    pace_max_sec_per_km: int | None = None
    spots_left: int


class CrewMemberSummary(BaseModel):
    """
    Public member preview. Field names are the same as the public
    partner card (``user_id``, ``display_name``, ``avatar_url``) so
    clients can reuse their avatar rendering.
    """

    user_id: UUID
    display_name: str
    avatar_url: str | None = None
    role: CrewRole
    joined_at: datetime


class CrewListItem(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    sport: str
    home_area: str
    pace_min_sec_per_km: int | None = None
    pace_max_sec_per_km: int | None = None
    visibility: str
    created_by: UUID | None = None
    member_count: int
    # The caller's role in this crew, or null when not a member.
    my_role: CrewRole | None = None
    # Coarse distance from the query point (rounded up to 0.5 km, min
    # 1.0). Null unless the request supplied lat/lng.
    distance_km: float | None = None
    next_run: CrewNextRun | None = None
    created_at: datetime
    updated_at: datetime


class CrewDetail(CrewListItem):
    # Up to 12 members, owners first then by join date. Users in a
    # block relationship with the caller are omitted from the preview
    # (member_count still counts them).
    members: list[CrewMemberSummary]
    # Next open/full public group runs of this crew, soonest first.
    upcoming_runs: list[EventSummary]


class CrewListResponse(BaseModel):
    items: list[CrewListItem]
    total: int
    limit: int
    offset: int


class LeaveCrewResponse(BaseModel):
    crew_id: UUID
    # True when the caller was the only member (and owner): leaving
    # deleted the crew.
    crew_deleted: bool
