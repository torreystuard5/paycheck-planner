from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class SavingsGoalCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    target_amount: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)
    target_date: date | None = None


class SavingsGoalUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    target_amount: Decimal | None = Field(
        default=None, gt=0, max_digits=12, decimal_places=2
    )
    current_amount: Decimal | None = Field(
        default=None, ge=0, max_digits=12, decimal_places=2
    )
    target_date: date | None = None
    is_active: bool | None = None


class SavingsGoalResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    target_amount: Decimal
    current_amount: Decimal
    target_date: date | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ContributionCreate(BaseModel):
    goal_id: UUID
    amount: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)
    pay_period_date: date


class ContributionResponse(BaseModel):
    id: UUID
    goal_id: UUID
    amount: Decimal
    pay_period_date: date
    created_at: datetime

    model_config = {"from_attributes": True}
