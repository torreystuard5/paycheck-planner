from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class IncomeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    amount: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)
    frequency: str = Field(..., pattern="^(weekly|biweekly|semi_monthly|monthly)$")
    next_pay_date: date


class IncomeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    frequency: str | None = Field(
        default=None, pattern="^(weekly|biweekly|semi_monthly|monthly)$"
    )
    next_pay_date: date | None = None
    is_active: bool | None = None


class IncomeResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    amount: Decimal
    frequency: str
    next_pay_date: date
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
