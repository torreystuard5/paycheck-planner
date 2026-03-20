from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class DebtCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    type: str = Field(
        ...,
        pattern="^(credit_card|auto_loan|student_loan|personal_loan|mortgage|other)$",
    )
    balance: Decimal = Field(..., ge=0, max_digits=12, decimal_places=2)
    credit_limit: Decimal | None = Field(
        default=None, ge=0, max_digits=12, decimal_places=2
    )
    apr: Decimal = Field(..., ge=0, max_digits=5, decimal_places=2)
    minimum_payment: Decimal = Field(..., ge=0, max_digits=12, decimal_places=2)
    due_day: int = Field(..., ge=1, le=31)
    auto_pay: bool = False
    reminder_days: int = Field(default=3, ge=0, le=30)


class DebtUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    type: str | None = Field(
        default=None,
        pattern="^(credit_card|auto_loan|student_loan|personal_loan|mortgage|other)$",
    )
    balance: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    credit_limit: Decimal | None = Field(
        default=None, ge=0, max_digits=12, decimal_places=2
    )
    apr: Decimal | None = Field(default=None, ge=0, max_digits=5, decimal_places=2)
    minimum_payment: Decimal | None = Field(
        default=None, ge=0, max_digits=12, decimal_places=2
    )
    due_day: int | None = Field(default=None, ge=1, le=31)
    auto_pay: bool | None = None
    reminder_days: int | None = Field(default=None, ge=0, le=30)
    is_active: bool | None = None


class DebtResponse(BaseModel):
    id: UUID
    user_id: UUID
    household_id: UUID | None
    name: str
    type: str
    balance: Decimal
    credit_limit: Decimal | None
    apr: Decimal
    minimum_payment: Decimal
    due_day: int
    auto_pay: bool
    reminder_days: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
