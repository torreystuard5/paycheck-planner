from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class SavingsGoalCreate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=150)
    target_amount: Optional[Decimal] = Field(default=None, max_digits=12, decimal_places=2)
    target_date: Optional[date] = None


class SavingsGoalUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=150)
    target_amount: Optional[Decimal] = Field(
        default=None, max_digits=12, decimal_places=2
    )
    current_amount: Optional[Decimal] = Field(
        default=None, ge=0, max_digits=12, decimal_places=2
    )
    target_date: Optional[date] = None
    is_active: Optional[bool] = None


class SavingsGoalResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: Optional[str] = None
    target_amount: Optional[Decimal] = None
    current_amount: Optional[Decimal] = None
    target_date: Optional[date] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ContributionCreate(BaseModel):
    goal_id: UUID
    amount: Optional[Decimal] = Field(default=None, max_digits=12, decimal_places=2)
    pay_period_date: Optional[date] = None


class ContributionResponse(BaseModel):
    id: UUID
    goal_id: UUID
    amount: Optional[Decimal] = None
    pay_period_date: Optional[date] = None
    created_at: datetime

    model_config = {"from_attributes": True}
