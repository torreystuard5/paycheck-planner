from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class PaycheckEntryCreate(BaseModel):
    income_source_id: Optional[UUID] = None
    pay_date: date
    gross_amount: Optional[Decimal] = Field(default=None, max_digits=12, decimal_places=2)
    net_amount: Decimal = Field(..., max_digits=12, decimal_places=2)
    memo: Optional[str] = Field(default=None, max_length=255)


class PaycheckEntryUpdate(BaseModel):
    income_source_id: Optional[UUID] = None
    pay_date: Optional[date] = None
    gross_amount: Optional[Decimal] = Field(default=None, max_digits=12, decimal_places=2)
    net_amount: Optional[Decimal] = Field(default=None, max_digits=12, decimal_places=2)
    memo: Optional[str] = Field(default=None, max_length=255)


class PaycheckEntryResponse(BaseModel):
    id: UUID
    user_id: UUID
    income_source_id: Optional[UUID] = None
    pay_date: date
    gross_amount: Optional[Decimal] = None
    net_amount: Decimal
    memo: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class MonthlyIncomeSummary(BaseModel):
    year: int
    month: int
    total_net: Decimal
    total_gross: Optional[Decimal] = None
    paycheck_count: int
