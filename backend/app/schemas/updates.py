from __future__ import annotations

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
    date: date | None = None
    description: str | None = None
    type: str | None = None


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
    eta: str | None = None


class ComingSoonUpdate(BaseModel):
    feature_name: str | None = None
    description: str | None = None
    eta: str | None = None


class ComingSoonOut(BaseModel):
    id: int
    feature_name: str
    description: str
    eta: str | None = None
    created_by: UUID
    created_at: datetime

    model_config = {"from_attributes": True}
