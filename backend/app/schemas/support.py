from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


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

    model_config = {"from_attributes": True}
