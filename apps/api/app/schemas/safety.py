from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.core.time import AuditInstant

# Reason vocab keeps legacy V1 values and adds V1.1 entries so existing
# callers (Chat → user report) and new event-side flows both work.
ReportReason = Literal[
    # Legacy
    "spam",
    "inappropriate",
    "fake",
    "harassment",
    "other",
    # V1.1
    "no_show",
    "fraud_or_scam",
    "inappropriate_chat",
    "fake_profile",
    "unsafe_behavior",
]
ReportTargetType = Literal["user", "event"]
ReportStatus = Literal["submitted", "reviewed", "dismissed", "actioned"]


class CreateReportRequest(BaseModel):
    # Default to "user" so legacy callers omitting target_type still work.
    target_type: ReportTargetType = "user"
    # Legacy field name preserved for user reports.
    reported_user_id: UUID | None = None
    target_event_id: UUID | None = None
    reason: ReportReason
    context: str | None = Field(default=None, max_length=1000)
    # Status is server-controlled. The field is deliberately NOT
    # exposed on the request schema so clients cannot create
    # already-actioned reports.


class ReportResponse(BaseModel):
    id: UUID
    reporter_id: UUID
    target_type: str = "user"
    reported_id: UUID | None = None
    target_event_id: UUID | None = None
    reason: str
    context: str | None = None
    status: str = "submitted"
    created_at: AuditInstant

    model_config = {"from_attributes": True}


class BlockResponse(BaseModel):
    id: UUID
    blocker_id: UUID
    blocked_id: UUID
    created_at: AuditInstant
    # Filled by GET /blocks so the list can show a name instead of an id;
    # null when the blocked user never created a profile.
    blocked_display_name: str | None = None

    model_config = {"from_attributes": True}


class BlockListResponse(BaseModel):
    items: list[BlockResponse]
    total: int


class ReportListResponse(BaseModel):
    """Response shape for GET /reports/mine — mirrors BlockListResponse."""

    items: list[ReportResponse]
    total: int
