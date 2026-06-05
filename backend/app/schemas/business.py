from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

LIST_LIMIT = 500


# ── Sales ──────────────────────────────────────────────────────────


class SaleCreate(BaseModel):
    date: date
    amount: Decimal = Field(..., ge=0, max_digits=12, decimal_places=2)
    source: Optional[str] = Field(None, max_length=255)
    category: Optional[str] = Field(None, max_length=100)
    payment_method: Optional[str] = Field(None, max_length=80)
    notes: Optional[str] = None
    is_taxable: bool = True
    customer_id: Optional[UUID] = None


class SaleUpdate(BaseModel):
    date: Optional[date] = None
    amount: Optional[Decimal] = Field(None, ge=0, max_digits=12, decimal_places=2)
    source: Optional[str] = Field(None, max_length=255)
    category: Optional[str] = Field(None, max_length=100)
    payment_method: Optional[str] = Field(None, max_length=80)
    notes: Optional[str] = None
    is_taxable: Optional[bool] = None
    customer_id: Optional[UUID] = None


class SaleResponse(BaseModel):
    id: UUID
    date: date
    amount: Decimal
    source: Optional[str] = None
    category: Optional[str] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None
    is_taxable: bool = True
    customer_id: Optional[UUID] = None
    customer_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=False)

    @classmethod
    def from_orm_sale(cls, s: Any, customer_name: Optional[str] = None) -> SaleResponse:
        cid = getattr(s, "customer_id", None)
        return cls(
            id=s.id,
            date=s.sale_date,
            amount=Decimal(str(s.amount)),
            source=s.source,
            category=s.category,
            payment_method=s.payment_method,
            notes=s.notes,
            is_taxable=bool(s.is_taxable),
            customer_id=cid,
            customer_name=customer_name,
            created_at=s.created_at,
            updated_at=s.updated_at,
        )


class SaleSummary(BaseModel):
    total: Decimal
    by_category: dict[str, Decimal]
    by_month: list[dict]


# ── Deductions ─────────────────────────────────────────────────────


class DeductionCreate(BaseModel):
    date: date
    amount: Decimal = Field(..., ge=0, max_digits=12, decimal_places=2)
    category: str = Field(..., max_length=100)
    vendor: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    receipt_url: Optional[str] = Field(None, max_length=500)
    is_mileage: bool = False
    miles: Optional[Decimal] = Field(None, ge=0, max_digits=10, decimal_places=2)


class DeductionUpdate(BaseModel):
    date: Optional[date] = None
    amount: Optional[Decimal] = Field(None, ge=0, max_digits=12, decimal_places=2)
    category: Optional[str] = Field(None, max_length=100)
    vendor: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    receipt_url: Optional[str] = Field(None, max_length=500)
    is_mileage: Optional[bool] = None
    miles: Optional[Decimal] = Field(None, ge=0, max_digits=10, decimal_places=2)


class DeductionResponse(BaseModel):
    id: UUID
    date: date
    amount: Decimal
    category: str
    vendor: Optional[str] = None
    description: Optional[str] = None
    receipt_url: Optional[str] = None
    is_mileage: bool = False
    miles: Optional[Decimal] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=False)

    @classmethod
    def from_orm_row(cls, d: Any) -> DeductionResponse:
        return cls(
            id=d.id,
            date=d.deduction_date,
            amount=Decimal(str(d.amount)),
            category=d.category,
            vendor=d.vendor,
            description=d.description,
            receipt_url=d.receipt_url,
            is_mileage=bool(d.is_mileage),
            miles=Decimal(str(d.miles)) if d.miles is not None else None,
            created_at=d.created_at,
            updated_at=d.updated_at,
        )


class DeductionSummary(BaseModel):
    total: Decimal
    by_category: dict[str, Decimal]
    total_miles: Decimal


# ── Staff ──────────────────────────────────────────────────────────


class StaffCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    role: Optional[str] = Field(None, max_length=120)
    pay_type: str = Field(default="hourly", pattern="^(hourly|salary|contractor)$")
    pay_rate: Optional[Decimal] = Field(None, ge=0, max_digits=12, decimal_places=2)
    pay_frequency: Optional[str] = Field(
        None, pattern="^(weekly|biweekly|semi_monthly|monthly)$"
    )
    anchor_date: Optional[date] = None
    tax_rate: Optional[Decimal] = Field(None, ge=0, le=100, max_digits=5, decimal_places=2)


class StaffUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    role: Optional[str] = Field(None, max_length=120)
    pay_type: Optional[str] = Field(None, pattern="^(hourly|salary|contractor)$")
    pay_rate: Optional[Decimal] = Field(None, ge=0, max_digits=12, decimal_places=2)
    pay_frequency: Optional[str] = Field(
        None, pattern="^(weekly|biweekly|semi_monthly|monthly)$"
    )
    anchor_date: Optional[date] = None
    tax_rate: Optional[Decimal] = Field(None, ge=0, le=100, max_digits=5, decimal_places=2)
    is_active: Optional[bool] = None


class StaffResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    role: Optional[str] = None
    pay_type: str
    pay_rate: Optional[Decimal] = None
    pay_frequency: Optional[str] = None
    anchor_date: Optional[date] = None
    tax_rate: Optional[Decimal] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


# ── Pay runs ───────────────────────────────────────────────────────


class PayRunCreate(BaseModel):
    period_start: date
    period_end: date
    hours: Optional[Decimal] = Field(None, ge=0, max_digits=10, decimal_places=2)
    gross_pay: Decimal = Field(..., ge=0, max_digits=12, decimal_places=2)
    taxes_withheld: Decimal = Field(default=Decimal("0"), ge=0, max_digits=12, decimal_places=2)
    net_pay: Decimal = Field(..., ge=0, max_digits=12, decimal_places=2)
    paid_on: Optional[date] = None
    notes: Optional[str] = None


class PayRunUpdate(BaseModel):
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    hours: Optional[Decimal] = Field(None, ge=0, max_digits=10, decimal_places=2)
    gross_pay: Optional[Decimal] = Field(None, ge=0, max_digits=12, decimal_places=2)
    taxes_withheld: Optional[Decimal] = Field(None, ge=0, max_digits=12, decimal_places=2)
    net_pay: Optional[Decimal] = Field(None, ge=0, max_digits=12, decimal_places=2)
    paid_on: Optional[date] = None
    notes: Optional[str] = None


class PayRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    staff_id: UUID
    period_start: date
    period_end: date
    hours: Optional[Decimal] = None
    gross_pay: Decimal
    taxes_withheld: Decimal
    net_pay: Decimal
    paid_on: Optional[date] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class StaffPaySummary(BaseModel):
    total_paid: Decimal
    by_staff: dict[str, Decimal]
    by_period: list[dict]


# ── Funds ──────────────────────────────────────────────────────────


class FundCreate(BaseModel):
    fund_type: str = Field(..., pattern="^(contingency|upgrade)$")
    name: str = Field(..., min_length=1, max_length=150)
    target_amount: Optional[Decimal] = Field(None, ge=0, max_digits=12, decimal_places=2)
    monthly_contribution: Optional[Decimal] = Field(None, ge=0, max_digits=12, decimal_places=2)
    notes: Optional[str] = None


class FundUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    target_amount: Optional[Decimal] = Field(None, ge=0, max_digits=12, decimal_places=2)
    monthly_contribution: Optional[Decimal] = Field(None, ge=0, max_digits=12, decimal_places=2)
    notes: Optional[str] = None


class FundResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    fund_type: str
    name: str
    target_amount: Optional[Decimal] = None
    current_balance: Decimal
    monthly_contribution: Optional[Decimal] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class FundTransactionCreate(BaseModel):
    """amount is always positive for deposit and withdrawal; server stores signed."""

    date: date
    amount: Decimal = Field(..., max_digits=12, decimal_places=2)
    kind: str = Field(..., pattern="^(deposit|withdrawal|adjustment)$")
    note: Optional[str] = Field(None, max_length=500)

    @model_validator(mode="after")
    def check_amount_sign(self):
        if self.kind == "deposit" and self.amount <= 0:
            raise ValueError("Deposit amount must be positive")
        if self.kind == "withdrawal" and self.amount <= 0:
            raise ValueError("Withdrawal amount must be positive")
        # adjustment: any signed amount allowed
        return self


class StringListResponse(BaseModel):
    values: list[str]


class BusinessSettingsResponse(BaseModel):
    mileage_rate_per_mile: Decimal
    business_name: Optional[str] = None
    business_tagline: Optional[str] = None
    fiscal_year_start_month: int = 1


class BusinessSettingsUpdate(BaseModel):
    mileage_rate_per_mile: Optional[Decimal] = Field(None, gt=0, le=50, max_digits=8, decimal_places=4)
    business_name: Optional[str] = Field(None, max_length=255)
    business_tagline: Optional[str] = Field(None, max_length=500)
    fiscal_year_start_month: Optional[int] = Field(None, ge=1, le=12)


# ── Customers ────────────────────────────────────────────────────────


class CustomerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    address: Optional[str] = None
    company: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    address: Optional[str] = None
    company: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class CustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    company: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class FundTransactionResponse(BaseModel):
    id: UUID
    fund_id: UUID
    date: date
    amount: Decimal
    kind: str
    note: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=False)

    @classmethod
    def from_orm_row(cls, t: Any) -> FundTransactionResponse:
        return cls(
            id=t.id,
            fund_id=t.fund_id,
            date=t.tx_date,
            amount=Decimal(str(t.amount)),
            kind=t.kind,
            note=t.note,
            created_at=t.created_at,
            updated_at=t.updated_at,
        )


# ── Dashboard & net profit ───────────────────────────────────────────


class MonthlyBreakdownRow(BaseModel):
    month: str
    sales: Decimal
    deductions: Decimal
    staff_pay: Decimal
    net: Decimal


class NetProfitResponse(BaseModel):
    range_start: date
    range_end: date
    total_sales: Decimal
    total_deductions: Decimal
    total_staff_pay: Decimal
    total_fund_contributions: Decimal
    net_profit: Decimal
    monthly: list[MonthlyBreakdownRow]


class DashboardResponse(BaseModel):
    today_sales: Decimal = Decimal("0")
    week_sales: Decimal = Decimal("0")
    mtd_sales: Decimal
    mtd_deductions: Decimal
    mtd_staff_pay: Decimal
    mtd_net_profit: Decimal
    total_deductions_mtd: Decimal | None = None
    contingency_fund: Optional[FundResponse] = None
    upgrade_fund: Optional[FundResponse] = None
    recent_sales: list[SaleResponse]
    recent_deductions: list[DeductionResponse]
    recent_pay_runs: list[PayRunResponse]
