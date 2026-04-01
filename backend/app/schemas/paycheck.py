from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class PaycheckItem(BaseModel):
    id: UUID
    name: str
    item_type: str
    amount: Decimal
    full_amount: Optional[Decimal] = None
    due_date: date
    days_until_due: int
    status: str
    auto_pay: bool
    is_split: bool = False
    split_count: int = 1
    is_paid: bool = False
    is_overdue: bool = False
    hidden_overdue: bool = False


class PaycheckPlan(BaseModel):
    paycheck_date: date
    paycheck_amount: Decimal
    assigned_items: list[PaycheckItem]
    total_due: Decimal
    remaining: Decimal
    status: str


class PaycheckPlanResponse(BaseModel):
    pay_frequency: str
    currency: str
    num_periods: int
    paychecks: list[PaycheckPlan]
    total_income: Decimal
    total_obligations: Decimal
    overall_status: str
    current_paycheck_date: Optional[date] = None
    next_paycheck_date: Optional[date] = None
