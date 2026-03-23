from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


# ── AppUpdate ─────────────────────────────────────────────────────


class AppUpdateCreate(BaseModel):
    date: date
    description: str
    type: str = "update"


class AppUpdateUpdate(BaseModel):
    date: Optional[date] = None
    description: Optional[str] = None
    type: Optional[str] = None


class AppUpdateOut(BaseModel):
    id: int
    date: date
    description: str
    type: str
    created_by: UUID
    created_at: datetime

    model_config = {"from_attributes": True}


# ── ComingSoon ────────────────────────────────────────────────────


class ComingSoonCreate(BaseModel):
    feature_name: str
    description: str
    eta: Optional[str] = None


class ComingSoonUpdate(BaseModel):
    feature_name: Optional[str] = None
    description: Optional[str] = None
    eta: Optional[str] = None


class ComingSoonOut(BaseModel):
    id: int
    feature_name: str
    description: str
    eta: Optional[str] = None
    created_by: UUID
    created_at: datetime

    model_config = {"from_attributes": True}
