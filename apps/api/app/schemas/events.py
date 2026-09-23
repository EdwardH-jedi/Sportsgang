from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.geo import MEETING_COORD_DECIMALS, round_coord
from app.models.crew import PACE_MAX_SEC_PER_KM, PACE_MIN_SEC_PER_KM
from app.models.event import RUN_DISTANCE_MAX_KM, RUN_DISTANCE_MIN_KM

EventMode = Literal["casual", "ranked"]
EventVisibility = Literal["public", "private"]
EventStatus = Literal["open", "full", "cancelled", "completed"]
AttendanceStatus = Literal["pending", "attended", "no_show", "excused"]
# Self-report subset — participants cannot brand themselves no_show or
# reset to pending.
SelfAttendanceStatus = Literal["attended", "excused"]
ParticipantStatus = Literal["joined", "left"]


def check_pace_band(pace_min: int | None, pace_max: int | None) -> None:
    """Raise ValueError when both bounds are set and min > max."""
    if pace_min is not None and pace_max is not None and pace_min > pace_max:
        raise ValueError("pace_min_sec_per_km must be less than or equal to pace_max_sec_per_km")


class _GroupRunFields(BaseModel):
    """
    Optional group-run fields shared by create and update. v1.0 clients
    never send them; every one defaults to null.
    """

    crew_id: UUID | None = None
    meeting_lat: float | None = Field(default=None, ge=-90.0, le=90.0)
    meeting_lng: float | None = Field(default=None, ge=-180.0, le=180.0)
    distance_km: float | None = Field(default=None, ge=RUN_DISTANCE_MIN_KM, le=RUN_DISTANCE_MAX_KM)
    pace_min_sec_per_km: int | None = Field(default=None, ge=PACE_MIN_SEC_PER_KM, le=PACE_MAX_SEC_PER_KM)
    pace_max_sec_per_km: int | None = Field(default=None, ge=PACE_MIN_SEC_PER_KM, le=PACE_MAX_SEC_PER_KM)

    @field_validator("meeting_lat", "meeting_lng")
    @classmethod
    def _round_meeting(cls, v: float | None) -> float | None:
        return round_coord(v, MEETING_COORD_DECIMALS)

    @field_validator("distance_km")
    @classmethod
    def _round_distance(cls, v: float | None) -> float | None:
        return None if v is None else round(v, 2)

    @model_validator(mode="after")
    def _check_run_fields(self):
        lat_sent = "meeting_lat" in self.model_fields_set
        lng_sent = "meeting_lng" in self.model_fields_set
        if lat_sent != lng_sent or (self.meeting_lat is None) != (self.meeting_lng is None):
            raise ValueError("meeting_lat and meeting_lng must be provided together")
        check_pace_band(self.pace_min_sec_per_km, self.pace_max_sec_per_km)
        return self


class CreateEventRequest(_GroupRunFields):
    title: str = Field(min_length=1, max_length=120)
    sport: str = Field(min_length=1, max_length=30)
    mode: EventMode = "casual"
    starts_at: datetime
    location_text: str = Field(min_length=1, max_length=200)
    capacity: int = Field(ge=1, le=200)
    description: str | None = Field(default=None, max_length=1000)
    visibility: EventVisibility = "public"


class UpdateEventRequest(_GroupRunFields):
    """
    Host-only partial update (PATCH /events/{id}). Omitted fields are
    untouched. ``description`` and every group-run field can be cleared
    with null; ``title``, ``starts_at``, ``location_text`` and
    ``capacity`` cannot. Sport, mode and visibility are fixed at
    creation.
    """

    title: str | None = Field(default=None, min_length=1, max_length=120)
    starts_at: datetime | None = None
    location_text: str | None = Field(default=None, min_length=1, max_length=200)
    capacity: int | None = Field(default=None, ge=1, le=200)
    description: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _check_required_not_null(self) -> "UpdateEventRequest":
        for required in ("title", "starts_at", "location_text", "capacity"):
            if required in self.model_fields_set and getattr(self, required) is None:
                raise ValueError(f"{required} cannot be null")
        return self


class EventHost(BaseModel):
    id: UUID
    display_name: str


class EventSummary(BaseModel):
    id: UUID
    host_user_id: UUID
    host: EventHost | None = None
    title: str
    sport: str
    mode: str
    starts_at: datetime
    location_text: str
    capacity: int
    participant_count: int
    spots_left: int
    visibility: str
    status: str
    has_joined: bool
    description: str | None = None
    created_at: datetime
    updated_at: datetime
    # --- Group-run fields (additive; null for ordinary events) ---------
    crew_id: UUID | None = None
    crew_name: str | None = None
    meeting_lat: float | None = None
    meeting_lng: float | None = None
    distance_km: float | None = None
    pace_min_sec_per_km: int | None = None
    pace_max_sec_per_km: int | None = None
    # Distance from the lat/lng passed to GET /events to the meeting
    # point, in km (1 dp). Null unless the list was geo-filtered.
    distance_km_from_you: float | None = None

    model_config = {"from_attributes": True}


class EventParticipantSummary(BaseModel):
    user_id: UUID
    display_name: str
    joined_at: datetime
    # NOTE: attendance_status is intentionally NOT exposed here.
    # General event detail (GET /events/{id}) must not leak each
    # participant's attendance outcome to every viewer. Attendance is
    # served only by GET /events/{id}/attendance, which scopes results
    # to host / self.


class EventDetail(EventSummary):
    participants: list[EventParticipantSummary]


class EventListResponse(BaseModel):
    items: list[EventSummary]
    total: int


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------


class AttendanceEntry(BaseModel):
    event_id: UUID
    participant_user_id: UUID
    display_name: str
    participant_status: str
    attendance_status: str
    joined_at: datetime
    left_at: datetime | None = None
    attendance_confirmed_by_host_at: datetime | None = None
    attendance_self_reported_at: datetime | None = None
    attendance_note: str | None = None

    model_config = {"from_attributes": True}


class AttendanceListResponse(BaseModel):
    event_id: UUID
    host_user_id: UUID
    items: list[AttendanceEntry]


class HostAttendanceUpdateRequest(BaseModel):
    participant_user_id: UUID
    attendance_status: AttendanceStatus
    attendance_note: str | None = Field(default=None, max_length=500)


class SelfAttendanceRequest(BaseModel):
    attendance_status: SelfAttendanceStatus
    attendance_note: str | None = Field(default=None, max_length=500)
