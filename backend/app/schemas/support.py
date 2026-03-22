from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class SupportTicketCreate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    email: Optional[str] = Field(default=None, max_length=320)
    subject: Optional[str] = Field(default=None, max_length=255)
    message: Optional[str] = None


class SupportTicketRead(BaseModel):
    id: UUID
    user_id: Optional[UUID] = None
    name: Optional[str] = None
    email: Optional[str] = None
    subject: Optional[str] = None
    message: Optional[str] = None
    status: str = "open"
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
    message: Optional[str] = None


class TicketReplyRead(BaseModel):
    id: UUID
    ticket_id: UUID
    reply_message: Optional[str] = None
    replied_by: Optional[UUID] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SupportTicketDetail(SupportTicketRead):
    replies: list[TicketReplyRead] = []

    model_config = {"from_attributes": True}
