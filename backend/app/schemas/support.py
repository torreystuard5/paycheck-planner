from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class SupportTicketCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., min_length=1, max_length=320)
    subject: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1)


class SupportTicketRead(BaseModel):
    id: UUID
    user_id: UUID | None = None
    name: str
    email: str
    subject: str
    message: str
    status: str
    created_at: datetime
    reply_count: int = 0

    model_config = {"from_attributes": True}

    @model_validator(mode="wrap")
    @classmethod
    def _compute_reply_count(cls, data: Any, handler: Any) -> Any:
        if not isinstance(data, dict) and hasattr(data, "replies"):
            data.__dict__.setdefault("reply_count", len(data.replies))
        return handler(data)


class TicketReplyCreate(BaseModel):
    message: str = Field(..., min_length=1)


class TicketReplyRead(BaseModel):
    id: UUID
    ticket_id: UUID
    reply_message: str
    replied_by: UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SupportTicketDetail(SupportTicketRead):
    replies: list[TicketReplyRead] = []

    model_config = {"from_attributes": True}
