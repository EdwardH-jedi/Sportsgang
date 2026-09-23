from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.geo import HOME_COORD_DECIMALS, round_coord

# Birth-year bounds match the mobile Step 1 picker: [today - MAX_AGE, today - MIN_AGE].
# Computed at validation time so the bounds advance with the calendar year — the
# previous static `le=2005` rejected every Step 1 submit by users picking the
# top of the picker (today - 18) once today >= 2024, which silently dropped
# display_name along with the rest of the upsert payload.
MIN_PROFILE_AGE = 18
MAX_PROFILE_AGE = 90


def _validate_birth_year(value: Optional[int]) -> Optional[int]:
    if value is None:
        return value
    current_year = date.today().year
    min_year = current_year - MAX_PROFILE_AGE
    max_year = current_year - MIN_PROFILE_AGE
    if value < min_year or value > max_year:
        raise ValueError(f"birth_year must be between {min_year} and {max_year}")
    return value


class UserProfileCreate(BaseModel):
    display_name: str = Field(max_length=80)
    bio: Optional[str] = Field(None, max_length=400)
    birth_year: Optional[int] = None
    suburb: Optional[str] = Field(None, max_length=80)
    # Optional coarse home location (run-first discovery). Rounded to
    # 2 dp (~1 km) before storage and never returned to other users.
    # Must be sent as a pair; send both as null to clear. Omitting them
    # leaves the stored value untouched (v1.0 clients never send them).
    home_lat: Optional[float] = Field(None, ge=-90.0, le=90.0)
    home_lng: Optional[float] = Field(None, ge=-180.0, le=180.0)

    @field_validator("birth_year")
    @classmethod
    def _check_birth_year(cls, v: Optional[int]) -> Optional[int]:
        return _validate_birth_year(v)

    @field_validator("home_lat", "home_lng")
    @classmethod
    def _round_home_coord(cls, v: Optional[float]) -> Optional[float]:
        return round_coord(v, HOME_COORD_DECIMALS)

    @model_validator(mode="after")
    def _check_home_pair(self) -> "UserProfileCreate":
        lat_sent = "home_lat" in self.model_fields_set
        lng_sent = "home_lng" in self.model_fields_set
        if lat_sent != lng_sent or (self.home_lat is None) != (self.home_lng is None):
            raise ValueError("home_lat and home_lng must be provided together")
        return self


class UserProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(None, max_length=80)
    bio: Optional[str] = Field(None, max_length=400)
    birth_year: Optional[int] = None
    suburb: Optional[str] = Field(None, max_length=80)

    @field_validator("birth_year")
    @classmethod
    def _check_birth_year(cls, v: Optional[int]) -> Optional[int]:
        return _validate_birth_year(v)


class ProfilePhotoResponse(BaseModel):
    id: UUID
    photo_url: str
    position: int

    model_config = ConfigDict(from_attributes=True)


class UserProfileResponse(BaseModel):
    id: UUID
    user_id: UUID
    display_name: str
    bio: Optional[str]
    birth_year: Optional[int]
    suburb: Optional[str]
    avatar_url: Optional[str]
    photos: list[ProfilePhotoResponse] = []
    # True once the user has saved a coarse home location. The
    # coordinates themselves are write-only and never serialised.
    has_home_location: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProfilePhotosResponse(BaseModel):
    photos: list[ProfilePhotoResponse]
    avatar_url: Optional[str]


_VALID_OPEN_TO = {"any", "male", "female", "non_binary"}


class IdentityPreferencesCreate(BaseModel):
    open_to: list[str] = ["any"]
    age_range_min: int = Field(18, ge=18, le=80)
    age_range_max: int = Field(65, ge=18, le=80)
    max_distance_km: int = Field(20, ge=1, le=100)

    @field_validator("open_to")
    @classmethod
    def validate_open_to(cls, v: list[str]) -> list[str]:
        invalid = set(v) - _VALID_OPEN_TO
        if invalid:
            raise ValueError(f"Invalid open_to values: {invalid}. Must be subset of {_VALID_OPEN_TO}")
        return v


class IdentityPreferencesResponse(BaseModel):
    id: UUID
    user_id: UUID
    open_to: list[str]
    age_range_min: int
    age_range_max: int
    max_distance_km: int
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SportProfileCreate(BaseModel):
    sport: Literal["gym", "golf", "tennis", "running"]
    level: Literal["beginner", "intermediate", "advanced"]
    preferred_times: list[Literal["morning", "afternoon", "evening", "flexible"]] = ["flexible"]
    gym_name: Optional[str] = Field(None, max_length=120)
    golf_club: Optional[str] = Field(None, max_length=120)
    goals: Optional[str] = Field(None, max_length=300)


class SportProfileResponse(BaseModel):
    id: UUID
    user_id: UUID
    sport: str
    level: str
    preferred_times: list[str]
    gym_name: Optional[str]
    golf_club: Optional[str]
    goals: Optional[str]
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
