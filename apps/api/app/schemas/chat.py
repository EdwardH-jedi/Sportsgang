from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field

from app.core.time import AuditInstant


class SendMessageRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=1000)


class MessageResponse(BaseModel):
    id: UUID
    match_id: UUID
    sender_id: UUID
    body: str
    created_at: AuditInstant

    model_config = {"from_attributes": True}


class MessageListResponse(BaseModel):
    items: list[MessageResponse]
    total: int
    limit: int
    offset: int
