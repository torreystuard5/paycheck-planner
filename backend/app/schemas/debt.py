from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class DebtCreate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=150)
    type: Optional[str] = Field(
        default="other",
        pattern="^(credit_card|auto_loan|student_loan|personal_loan|mortgage|other)$",
    )
    balance: Optional[Decimal] = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    credit_limit: Optional[Decimal] = Field(
        default=None, ge=0, max_digits=12, decimal_places=2
    )
    apr: Optional[Decimal] = Field(default=None, ge=0, max_digits=5, decimal_places=2)
    minimum_payment: Optional[Decimal] = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    due_day: Optional[int] = Field(default=None, ge=1, le=31)
    auto_pay: bool = False
    reminder_days: int = Field(default=3, ge=0, le=30)


class DebtUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=150)
    type: Optional[str] = Field(
        default=None,
        pattern="^(credit_card|auto_loan|student_loan|personal_loan|mortgage|other)$",
    )
    balance: Optional[Decimal] = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    credit_limit: Optional[Decimal] = Field(
        default=None, ge=0, max_digits=12, decimal_places=2
    )
    apr: Optional[Decimal] = Field(default=None, ge=0, max_digits=5, decimal_places=2)
    minimum_payment: Optional[Decimal] = Field(
        default=None, ge=0, max_digits=12, decimal_places=2
    )
    due_day: Optional[int] = Field(default=None, ge=1, le=31)
    auto_pay: Optional[bool] = None
    reminder_days: Optional[int] = Field(default=None, ge=0, le=30)
    is_active: Optional[bool] = None


class DebtResponse(BaseModel):
    id: UUID
    user_id: UUID
    household_id: Optional[UUID] = None
    name: Optional[str] = None
    type: Optional[str] = None
    balance: Optional[Decimal] = None
    credit_limit: Optional[Decimal] = None
    apr: Optional[Decimal] = None
    minimum_payment: Optional[Decimal] = None
    due_day: Optional[int] = None
    auto_pay: bool = False
    reminder_days: int = 3
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
