from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class BillCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    amount: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)
    due_day: int = Field(..., ge=1, le=31)
    frequency: str = Field(
        default="monthly", pattern="^(weekly|biweekly|semi_monthly|monthly|quarterly|annual)$"
    )
    category: str | None = Field(default=None, max_length=50)
    auto_pay: bool = False
    reminder_days: int = Field(default=3, ge=0, le=30)


class BillUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    due_day: int | None = Field(default=None, ge=1, le=31)
    frequency: str | None = Field(
        default=None, pattern="^(weekly|biweekly|semi_monthly|monthly|quarterly|annual)$"
    )
    category: str | None = None
    auto_pay: bool | None = None
    reminder_days: int | None = Field(default=None, ge=0, le=30)
    is_active: bool | None = None


class BillPayRequest(BaseModel):
    paid_amount: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    paid_date: datetime | None = None


class BillResponse(BaseModel):
    id: UUID
    user_id: UUID
    household_id: UUID | None
    name: str
    amount: Decimal
    due_day: int
    frequency: str
    category: str | None
    auto_pay: bool
    reminder_days: int
    is_paid: bool
    paid_date: datetime | None
    paid_amount: Decimal | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
