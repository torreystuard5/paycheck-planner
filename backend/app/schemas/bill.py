from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class BillCreate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=150)
    amount: Optional[Decimal] = Field(default=None, max_digits=12, decimal_places=2)
    due_day: Optional[int] = Field(default=None, ge=1, le=31)
    frequency: Optional[str] = Field(
        default="monthly",
        pattern="^(one_time|weekly|biweekly|semi_monthly|monthly|quarterly|annual|yearly)$",
    )
    category: Optional[str] = Field(default=None, max_length=50)
    auto_pay: bool = False
    reminder_days: int = Field(default=3, ge=0, le=30)
    payment_mode: Optional[str] = Field(
        default="single", pattern="^(single|split)$"
    )
    assigned_member_id: Optional[UUID] = None
    day_of_week: Optional[int] = Field(default=None, ge=0, le=6)
    start_date: Optional[date] = None


class BillUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=150)
    amount: Optional[Decimal] = Field(default=None, max_digits=12, decimal_places=2)
    due_day: Optional[int] = Field(default=None, ge=1, le=31)
    frequency: Optional[str] = Field(
        default=None,
        pattern="^(one_time|weekly|biweekly|semi_monthly|monthly|quarterly|annual|yearly)$",
    )
    category: Optional[str] = None
    auto_pay: Optional[bool] = None
    reminder_days: Optional[int] = Field(default=None, ge=0, le=30)
    is_active: Optional[bool] = None
    payment_mode: Optional[str] = Field(
        default=None, pattern="^(single|split)$"
    )
    assigned_member_id: Optional[UUID] = None
    day_of_week: Optional[int] = Field(default=None, ge=0, le=6)
    start_date: Optional[date] = None


class BillPayRequest(BaseModel):
    paid_amount: Optional[Decimal] = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    paid_date: Optional[datetime] = None


class BillResponse(BaseModel):
    id: UUID
    user_id: UUID
    household_id: Optional[UUID] = None
    name: Optional[str] = None
    amount: Optional[Decimal] = None
    due_day: Optional[int] = None
    frequency: Optional[str] = None
    category: Optional[str] = None
    auto_pay: bool = False
    reminder_days: int = 3
    is_paid: bool = False
    paid_date: Optional[datetime] = None
    paid_amount: Optional[Decimal] = None
    is_active: bool = True
    payment_mode: Optional[str] = "single"
    assigned_member_id: Optional[UUID] = None
    assigned_member_name: Optional[str] = None
    day_of_week: Optional[int] = None
    start_date: Optional[date] = None
    next_due_date: Optional[date] = None
    created_at: datetime
    updated_at: datetime
    is_household_bill: bool = False
    user_share: Optional[Decimal] = None
    is_user_responsible: bool = True
    member_count: Optional[int] = None

    model_config = {"from_attributes": True}


class MemberPaymentRequest(BaseModel):
    member_id: Optional[UUID] = None
    amount_paid: Optional[Decimal] = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    paid_at: Optional[datetime] = None


class MemberShareResponse(BaseModel):
    member_id: UUID
    member_name: str
    share: Decimal
    paid: Decimal
    balance: Decimal


class BillBreakdownResponse(BaseModel):
    bill: BillResponse
    total_paid: Decimal
    total_remaining: Decimal
    members: list[MemberShareResponse]
