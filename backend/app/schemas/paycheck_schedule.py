from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PaycheckScheduleCreate(BaseModel):
    frequency: str = Field(pattern="^(weekly|biweekly|semi_monthly|monthly)$")
    day_of_week: Optional[int] = Field(default=None, ge=0, le=6)
    anchor_date: Optional[date] = None
    day1: Optional[int] = Field(default=None, ge=1, le=31)
    day2: Optional[int] = Field(default=None, ge=1, le=31)
    income_source_name: Optional[str] = None
    budget_id: Optional[UUID] = None


class PaycheckScheduleUpdate(BaseModel):
    frequency: Optional[str] = Field(default=None, pattern="^(weekly|biweekly|semi_monthly|monthly)$")
    day_of_week: Optional[int] = Field(default=None, ge=0, le=6)
    anchor_date: Optional[date] = None
    day1: Optional[int] = Field(default=None, ge=1, le=31)
    day2: Optional[int] = Field(default=None, ge=1, le=31)
    income_source_name: Optional[str] = None
    budget_id: Optional[UUID] = None


class PaycheckScheduleOut(BaseModel):
    id: int
    frequency: str
    day_of_week: Optional[int] = Field(default=None, ge=0, le=6)
    anchor_date: Optional[date] = None
    day1: Optional[int] = Field(default=None, ge=1, le=31)
    day2: Optional[int] = Field(default=None, ge=1, le=31)
    income_source_name: Optional[str] = None
    budget_id: Optional[UUID] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UpcomingPaycheckDate(BaseModel):
    date: date
    schedule_id: int
    income_source_name: Optional[str] = None
