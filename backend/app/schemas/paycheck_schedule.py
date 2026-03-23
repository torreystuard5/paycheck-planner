from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class PaycheckScheduleCreate(BaseModel):
    frequency: str  # "weekly", "biweekly", "semi_monthly", "monthly"
    day_of_week: Optional[int] = None
    anchor_date: Optional[date] = None
    day1: Optional[int] = None
    day2: Optional[int] = None
    income_source_name: Optional[str] = None


class PaycheckScheduleUpdate(BaseModel):
    frequency: Optional[str] = None
    day_of_week: Optional[int] = None
    anchor_date: Optional[date] = None
    day1: Optional[int] = None
    day2: Optional[int] = None
    income_source_name: Optional[str] = None


class PaycheckScheduleOut(BaseModel):
    id: int
    frequency: str
    day_of_week: Optional[int] = None
    anchor_date: Optional[date] = None
    day1: Optional[int] = None
    day2: Optional[int] = None
    income_source_name: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UpcomingPaycheckDate(BaseModel):
    date: date
    schedule_id: int
    income_source_name: Optional[str] = None
