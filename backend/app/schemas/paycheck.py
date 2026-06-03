from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class PaycheckItem(BaseModel):
    id: UUID
    item_id: Optional[UUID] = None
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
    postpone_until: Optional[str] = None
    occurrence_due_date: Optional[date] = None
    natural_period_start: Optional[date] = None
    effective_period_start: Optional[date] = None
    pulled_forward: bool = False
    pay_period_start: Optional[date] = None
    is_overridden: bool = False
    original_pay_period_start: Optional[date] = None
    override_id: Optional[UUID] = None
    can_pull_forward: bool = False
    can_revert_override: bool = False


class PaycheckPlan(BaseModel):
    paycheck_date: date
    paycheck_amount: Decimal
    assigned_items: list[PaycheckItem]
    total_due: Decimal
    remaining: Decimal
    status: str
    pay_period_start: Optional[date] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    is_current: bool = False
    is_next: bool = False


class PaycheckUpcomingResponse(BaseModel):
    budget_id: UUID
    pay_frequency: Optional[str] = None
    currency: Optional[str] = None
    current: Optional[PaycheckPlan] = None
    upcoming: list[PaycheckPlan] = []


class PaycheckContext(BaseModel):
    pay_period_start: date
    pay_period_end: Optional[date] = None
    next_paycheck_date: Optional[date] = None
    budget_id: Optional[UUID] = None
    household_id: Optional[UUID] = None
    user_id: Optional[UUID] = None


class CurrentPaycheckPlan(BaseModel):
    paycheck_context: PaycheckContext
    paycheck_date: date
    pay_period_start: date
    pay_period_end: Optional[date] = None
    next_paycheck_date: Optional[date] = None
    paycheck_amount: Decimal
    total_due: Decimal
    remaining: Decimal
    status: str
    assigned_items: list[PaycheckItem]
    assigned_paid_count: int = 0
    assigned_total_count: int = 0
    assigned_paid_amount: Decimal = Decimal("0")
    assigned_total_amount: Decimal = Decimal("0")
    assigned_still_owed: Decimal = Decimal("0")
    assigned_progress_percent: float = 0.0


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
    budget_id: Optional[UUID] = None
    current_paycheck: Optional[CurrentPaycheckPlan] = None
