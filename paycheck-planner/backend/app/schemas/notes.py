from datetime import datetime

from pydantic import BaseModel, Field


# --- PIN ---

class PinSetupRequest(BaseModel):
    pin: str | None = Field(None, pattern=r"^\d{4,6}$")
    current_pin: str | None = Field(None, pattern=r"^\d{4,6}$")
    new_pin: str | None = Field(None, pattern=r"^\d{4,6}$")


class PinVerifyRequest(BaseModel):
    pin: str = Field(..., pattern=r"^\d{4,6}$")


class PinVerifyResponse(BaseModel):
    notes_session_token: str
    expires_in: int


# --- Notes ---

class NoteCreate(BaseModel):
    title: str | None = None
    content: str | None = None


class NoteUpdate(BaseModel):
    title: str | None = None
    content: str | None = None


class NoteListItem(BaseModel):
    id: int
    title: str | None
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class NoteDetail(BaseModel):
    id: int
    title: str | None
    content: str | None
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}


# --- Settings ---

class NotesSettingsUpdate(BaseModel):
    lock_timeout: int = Field(..., ge=1, le=10)
