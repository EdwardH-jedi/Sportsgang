from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

EventMode = Literal["casual", "ranked"]
EventVisibility = Literal["public", "private"]
EventStatus = Literal["open", "full", "cancelled", "completed"]
AttendanceStatus = Literal["pending", "attended", "no_show", "excused"]
# Self-report subset — participants cannot brand themselves no_show or
# reset to pending.
SelfAttendanceStatus = Literal["attended", "excused"]
ParticipantStatus = Literal["joined", "left"]


RunSessionPaceMode = Literal["target_pace", "social"]
RunGroupStyle = Literal["stay_together", "regroup_at_finish", "pace_groups"]
TeeTimeStatus = Literal["secured", "planning"]


class RunSessionDetails(BaseModel):
    """v2 running session details (docs/run-golf-v2/CONTRACTS.md §5).

    Informational only — they describe the plan for this run and never gate
    joining. Cross-field rules (pace pair vs mode, sport/mode/capacity) are
    enforced in app.services.events so the API returns readable messages.
    """

    distance_km: float = Field(gt=0, le=100)
    pace_mode: RunSessionPaceMode
    pace_min_sec_per_km: int | None = Field(default=None, ge=120, le=1200)
    pace_max_sec_per_km: int | None = Field(default=None, ge=120, le=1200)
    group_style: RunGroupStyle
    beginner_friendly: bool = False
    walk_breaks_ok: bool = False

    @field_validator("distance_km")
    @classmethod
    def _one_decimal(cls, v: float) -> float:
        rounded = round(v, 1)
        if rounded <= 0:
            raise ValueError("Distance must be at least 0.1 km")
        return rounded


class GolfSessionDetails(BaseModel):
    """v2 golf round details. ``tee_time_status='secured'`` is the host's
    declaration, never a course booking or platform verification."""

    holes: Literal[9, 18]
    tee_time_status: TeeTimeStatus
    estimated_cost_cents: int | None = Field(default=None, ge=0, le=1_000_000)
    handicap_min_tenths: int | None = Field(default=None, ge=-100, le=540)
    handicap_max_tenths: int | None = Field(default=None, ge=-100, le=540)
    beginners_welcome: bool = False


class CreateEventRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    sport: str = Field(min_length=1, max_length=30)
    mode: EventMode = "casual"
    starts_at: datetime
    location_text: str = Field(min_length=1, max_length=200)
    capacity: int = Field(ge=1, le=200)
    description: str | None = Field(default=None, max_length=1000)
    visibility: EventVisibility = "public"
    # v2: only with sport 'running' / 'golf' respectively, mode 'casual'.
    run_details: RunSessionDetails | None = None
    golf_details: GolfSessionDetails | None = None


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
    # v2 details; null on legacy events and for the other sport.
    run_details: RunSessionDetails | None = None
    golf_details: GolfSessionDetails | None = None
    created_at: datetime
    updated_at: datetime

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
