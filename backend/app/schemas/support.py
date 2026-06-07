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
    priority: str = "normal"
    assigned_to: Optional[UUID] = None
    assigned_to_name: Optional[str] = None
    admin_notes: Optional[str] = None
    cant_access_email: bool = False
    created_at: datetime
    resolved_at: Optional[datetime] = None
    reply_count: int = 0

    model_config = {"from_attributes": True}

    @model_validator(mode="wrap")
    @classmethod
    def _compute_reply_count(cls, data: Any, handler: Any) -> Any:
        if not isinstance(data, dict) and hasattr(data, "replies"):
            public_replies = [
                r for r in data.replies if not getattr(r, "is_internal", False)
            ]
            data.__dict__.setdefault("reply_count", len(public_replies))
        return handler(data)


class TicketReplyCreate(BaseModel):
    message: Optional[str] = None


class InternalNoteCreate(BaseModel):
    message: str = Field(..., min_length=1)


class TicketReplyRead(BaseModel):
    id: UUID
    ticket_id: UUID
    reply_message: Optional[str] = None
    is_internal: bool = False
    replied_by: Optional[UUID] = None
    replied_by_name: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SupportTicketDetail(SupportTicketRead):
    replies: list[TicketReplyRead] = []
    internal_notes: list[TicketReplyRead] = []

    model_config = {"from_attributes": True}


class SupportTicketUpdate(BaseModel):
    status: Optional[str] = Field(None, pattern="^(open|in_progress|resolved)$")
    priority: Optional[str] = Field(None, pattern="^(low|normal|high|urgent)$")
    assigned_to: Optional[UUID] = None
    admin_notes: Optional[str] = None


class SupportTicketListResponse(BaseModel):
    tickets: list[SupportTicketRead]
    total: int
    page: int
    per_page: int
    status_counts: dict[str, int] = Field(default_factory=dict)
