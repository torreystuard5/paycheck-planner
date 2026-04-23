import json
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


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
    auto_pay: Optional[bool] = False
    reminder_days: Optional[int] = Field(default=3, ge=0, le=30)
    is_split: Optional[bool] = None
    split_members: Optional[list] = None
    budget_id: Optional[UUID] = None


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
    is_split: Optional[bool] = None
    split_members: Optional[list] = None
    budget_id: Optional[UUID] = None


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
    is_split: bool = False
    split_members: Optional[list] = None
    budget_id: Optional[UUID] = None
    postpone_until: Optional[date] = None
    next_due_date: Optional[date] = None
    is_paid_this_period: bool = False
    last_payment_date: Optional[datetime] = None
    total_paid: Decimal = Decimal("0")
    percent_paid: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("split_members", mode="before")
    @classmethod
    def parse_split_members(cls, v: object) -> object:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return None
        return v
