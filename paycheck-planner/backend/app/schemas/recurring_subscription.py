from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class RecurringSubscriptionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    amount: Decimal | None = Field(default=None, ge=0)
    frequency: str = Field(default="monthly", pattern="^(weekly|biweekly|monthly|quarterly|annual|custom)$")
    next_billing_date: date | None = None
    category: str | None = Field(None, max_length=80)
    notes: str | None = None


class RecurringSubscriptionUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    amount: Decimal | None = Field(default=None, ge=0)
    frequency: str | None = Field(None, pattern="^(weekly|biweekly|monthly|quarterly|annual|custom)$")
    next_billing_date: date | None = None
    category: str | None = Field(None, max_length=80)
    notes: str | None = None
    is_active: bool | None = None


class RecurringSubscriptionResponse(BaseModel):
    id: UUID
    user_id: UUID
    household_id: UUID | None
    name: str
    amount: Decimal | None
    frequency: str
    next_billing_date: date | None
    category: str | None
    notes: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
