from uuid import UUID

from pydantic import BaseModel

from app.core.time import AuditInstant
from app.schemas.discovery import PartnerCardResponse


class MatchResponse(BaseModel):
    id: UUID
    user1_id: UUID
    user2_id: UUID
    sport: str
    status: str
    created_at: AuditInstant
    partner: PartnerCardResponse
    # Last-message preview for the chat list. All three fields are
    # optional so a brand-new match (no messages yet) serializes cleanly
    # — clients render an empty-state fallback in that case.
    last_message: str | None = None
    last_message_at: AuditInstant | None = None
    last_message_sender_id: UUID | None = None


class MatchListResponse(BaseModel):
    items: list[MatchResponse]
    total: int
    limit: int
    offset: int


class ArchiveMatchRequest(BaseModel):
    reason: str | None = None
