from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class IncomeCreate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    amount: Optional[Decimal] = Field(default=None, max_digits=12, decimal_places=2)
    frequency: Optional[str] = Field(
        default="monthly", pattern="^(weekly|biweekly|semi_monthly|monthly)$"
    )
    next_pay_date: Optional[date] = None


class IncomeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    amount: Optional[Decimal] = Field(default=None, max_digits=12, decimal_places=2)
    frequency: Optional[str] = Field(
        default=None, pattern="^(weekly|biweekly|semi_monthly|monthly)$"
    )
    next_pay_date: Optional[date] = None
    is_active: Optional[bool] = None


class IncomeResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: Optional[str] = None
    amount: Optional[Decimal] = None
    frequency: Optional[str] = None
    next_pay_date: Optional[date] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
