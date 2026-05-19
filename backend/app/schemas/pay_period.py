from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.pay_period_constants import (
    ITEM_TYPE_BILL,
    ITEM_TYPE_DEBT,
    ITEM_TYPES,
    OVERRIDE_PULL_FORWARD,
    OVERRIDE_TYPES_V1,
)


class PayPeriodItemOverrideBase(BaseModel):
    item_type: Literal["bill", "debt"]
    item_id: UUID
    occurrence_due_date: date
    natural_period_start: date
    effective_period_start: date
    override_type: str = OVERRIDE_PULL_FORWARD
    budget_id: Optional[UUID] = None

    @field_validator("override_type")
    @classmethod
    def validate_override_type_v1(cls, v: str) -> str:
        if v not in OVERRIDE_TYPES_V1:
            raise ValueError(f"override_type must be one of {sorted(OVERRIDE_TYPES_V1)}")
        return v

    @field_validator("item_type")
    @classmethod
    def validate_item_type(cls, v: str) -> str:
        if v not in ITEM_TYPES:
            raise ValueError(f"item_type must be one of {sorted(ITEM_TYPES)}")
        return v


class PayPeriodPullForwardCreate(BaseModel):
    """v1: move one occurrence from next pay period into current."""

    item_type: Literal["bill", "debt"]
    item_id: UUID
    occurrence_due_date: date
    budget_id: Optional[UUID] = None
    target_pay_period_start: Optional[date] = Field(
        default=None,
        description="Optional client hint; must match server-resolved current period start.",
    )
    # Period boundaries are resolved server-side from IncomeSource calendar;
    # clients may omit these on create (Phase 2 will populate).
    natural_period_start: Optional[date] = None
    effective_period_start: Optional[date] = None


class PayPeriodRevertPullForwardRequest(BaseModel):
    item_type: Literal["bill", "debt"]
    item_id: UUID
    occurrence_due_date: date
    budget_id: Optional[UUID] = None


class PayPeriodItemOverrideOut(PayPeriodItemOverrideBase):
    id: UUID
    household_id: Optional[UUID] = None
    created_by_user_id: UUID
    created_at: datetime
    revoked_at: Optional[datetime] = None
    is_active: bool = Field(
        description="True when revoked_at is null (active override).",
    )

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_orm_row(cls, row) -> "PayPeriodItemOverrideOut":
        data = {
            "id": row.id,
            "household_id": row.household_id,
            "budget_id": row.budget_id,
            "item_type": row.item_type,
            "item_id": row.item_id,
            "occurrence_due_date": row.occurrence_due_date,
            "natural_period_start": row.natural_period_start,
            "effective_period_start": row.effective_period_start,
            "override_type": row.override_type,
            "created_by_user_id": row.created_by_user_id,
            "created_at": row.created_at,
            "revoked_at": row.revoked_at,
            "is_active": row.revoked_at is None,
        }
        return cls(**data)


class PayPeriodMeta(BaseModel):
    """Pay period boundary metadata (Phase 2 API)."""

    period_start: date
    period_end: date
    paycheck_date: date
    label: Literal["current", "next"]


class PayPeriodSummaryResponse(BaseModel):
    """Current + next period anchors for UI switcher (Phase 2)."""

    budget_id: Optional[UUID] = None
    pay_frequency: Optional[str] = None
    current: Optional[PayPeriodMeta] = None
    next: Optional[PayPeriodMeta] = None


class PayPeriodPlanItem(BaseModel):
    id: UUID
    name: str
    item_type: str
    amount: Decimal
    full_amount: Optional[Decimal] = None
    due_date: date
    occurrence_due_date: date
    days_until_due: int
    status: str
    auto_pay: bool = False
    is_split: bool = False
    split_count: int = 1
    is_paid: bool = False
    is_overdue: bool = False
    hidden_overdue: bool = False
    postpone_until: Optional[str] = None
    natural_period_start: date
    effective_period_start: date
    pulled_forward: bool = False
    pay_period_start: date
    is_overridden: bool = False
    original_pay_period_start: Optional[date] = None
    override_id: Optional[UUID] = None
    can_pull_forward: bool = False
    can_revert_override: bool = False


class PayPeriodViewResponse(BaseModel):
    meta: PayPeriodMeta
    paycheck_amount: Decimal
    assigned_items: list[PayPeriodPlanItem]
    total_due: Decimal
    total_paid: Decimal
    total_still_owed: Decimal
    remaining: Decimal
    paid_count: int
    item_count: int
    status: str
