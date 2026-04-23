from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class PaymentCreate(BaseModel):
    bill_id: Optional[UUID] = None
    debt_id: Optional[UUID] = None
    amount: Optional[Decimal] = Field(default=None, max_digits=12, decimal_places=2)
    paid_date: Optional[date] = None
    pay_period_date: Optional[date] = None
    is_extra: bool = False
    source: Optional[str] = None
    auto_logged: bool = False


class PaymentResponse(BaseModel):
    id: UUID
    user_id: UUID
    bill_id: Optional[UUID] = None
    debt_id: Optional[UUID] = None
    amount: Optional[Decimal] = None
    paid_date: Optional[date] = None
    pay_period_date: Optional[date] = None
    derived_pay_period_date: Optional[date] = None
    is_extra: bool = False
    source: Optional[str] = None
    auto_logged: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}
