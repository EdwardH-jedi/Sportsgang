from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services import sport_preferences

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

    @field_validator("birth_year")
    @classmethod
    def _check_birth_year(cls, v: Optional[int]) -> Optional[int]:
        return _validate_birth_year(v)


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


GolfHandicapSource = Literal["official_index", "estimate", "none"]
GolfExperience = Literal["new", "range", "played_rounds", "regular"]
GolfPartnerIntent = Literal["similar_level", "learn_from_experienced", "welcome_beginners", "any_level"]
GolfPreferredHoles = Literal["9", "18", "either"]
RunPaceMode = Literal["match_pace", "social"]
RunGroupStyle = Literal["stay_together", "regroup_at_finish", "pace_groups"]


class SportProfileCreate(BaseModel):
    """Upsert body for POST /users/me/sport-profiles.

    Legacy fields keep their full-replace behaviour. The v2 fields
    (``preferences_version`` and ``golf_*`` / ``run_*``) are applied with
    ``exclude_unset``: omitted = preserved, explicit null = cleared. An empty
    intents/distances list is normalised to null (cleared). Cross-field rules
    run on the merged row in ``app.services.sport_preferences``.
    """

    sport: Literal["gym", "golf", "tennis", "running"]
    level: Literal["beginner", "intermediate", "advanced"]
    preferred_times: list[Literal["morning", "afternoon", "evening", "flexible"]] = ["flexible"]
    gym_name: Optional[str] = Field(None, max_length=120)
    golf_club: Optional[str] = Field(None, max_length=120)
    goals: Optional[str] = Field(None, max_length=300)

    preferences_version: Optional[Literal[2]] = None
    golf_handicap_tenths: Optional[int] = Field(
        None, ge=sport_preferences.HANDICAP_MIN_TENTHS, le=sport_preferences.HANDICAP_MAX_TENTHS
    )
    golf_handicap_source: Optional[GolfHandicapSource] = None
    golf_experience: Optional[GolfExperience] = None
    golf_partner_intents: Optional[list[GolfPartnerIntent]] = Field(None, max_length=4)
    golf_similarity_tolerance_tenths: Optional[int] = Field(
        None, ge=sport_preferences.TOLERANCE_MIN_TENTHS, le=sport_preferences.TOLERANCE_MAX_TENTHS
    )
    golf_preferred_holes: Optional[GolfPreferredHoles] = None
    run_pace_mode: Optional[RunPaceMode] = None
    run_pace_min_sec_per_km: Optional[int] = Field(
        None, ge=sport_preferences.PACE_MIN_SEC_PER_KM, le=sport_preferences.PACE_MAX_SEC_PER_KM
    )
    run_pace_max_sec_per_km: Optional[int] = Field(
        None, ge=sport_preferences.PACE_MIN_SEC_PER_KM, le=sport_preferences.PACE_MAX_SEC_PER_KM
    )
    run_distances_km: Optional[list[float]] = Field(None, max_length=sport_preferences.RUN_DISTANCES_MAX_ITEMS)
    run_group_style: Optional[RunGroupStyle] = None

    @field_validator("golf_partner_intents")
    @classmethod
    def _dedupe_intents(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if not v:
            return None
        return list(dict.fromkeys(v))

    @field_validator("run_distances_km")
    @classmethod
    def _normalise_distances(cls, v: Optional[list[float]]) -> Optional[list[float]]:
        if not v:
            return None
        cleaned: set[float] = set()
        for d in v:
            if not 0 < d <= sport_preferences.RUN_DISTANCE_MAX_KM:
                raise ValueError(f"Distances must be between 0 and {sport_preferences.RUN_DISTANCE_MAX_KM:g} km")
            cleaned.add(round(d, 1))
        return sorted(cleaned)


class SportProfileResponse(BaseModel):
    id: UUID
    user_id: UUID
    sport: str
    level: str
    preferred_times: list[str]
    gym_name: Optional[str]
    golf_club: Optional[str]
    goals: Optional[str]
    preferences_version: Optional[int] = None
    golf_handicap_tenths: Optional[int] = None
    golf_handicap_source: Optional[str] = None
    golf_experience: Optional[str] = None
    golf_partner_intents: Optional[list[str]] = None
    golf_similarity_tolerance_tenths: Optional[int] = None
    golf_preferred_holes: Optional[str] = None
    run_pace_mode: Optional[str] = None
    run_pace_min_sec_per_km: Optional[int] = None
    run_pace_max_sec_per_km: Optional[int] = None
    run_distances_km: Optional[list[float]] = None
    run_group_style: Optional[str] = None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
