from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


# ── Payoff simulation ──────────────────────────────────────────────


class DebtPayoffRequest(BaseModel):
    extra_payment: Decimal = Field(default=Decimal("0"), ge=0, max_digits=12, decimal_places=2)
    strategy: str | None = Field(
        default=None,
        pattern="^(snowball|avalanche)$",
        description="Optional — used for single-strategy run only",
    )


class PerDebtSummary(BaseModel):
    name: str
    original_balance: Decimal
    interest_paid: Decimal
    payoff_month: int
    payoff_date: date


class DebtPayoffResult(BaseModel):
    strategy: str
    months_to_payoff: int
    total_interest_paid: Decimal
    total_amount_paid: Decimal
    payoff_date: date
    per_debt_summary: list[PerDebtSummary]


class StrategyComparison(BaseModel):
    snowball: DebtPayoffResult
    avalanche: DebtPayoffResult
    interest_savings: Decimal
    faster_strategy: str
    months_saved: int


# ── Extra-payment simulation ──────────────────────────────────────


class ExtraPaymentRequest(BaseModel):
    extra_amounts: list[Decimal] = Field(
        default=[Decimal("0"), Decimal("50"), Decimal("100"), Decimal("200"), Decimal("500")],
    )


class ExtraPaymentSimulation(BaseModel):
    extra_amount: Decimal
    months_to_payoff: int
    total_interest: Decimal
    interest_saved_vs_minimum: Decimal


class ExtraPercentPaymentRequest(BaseModel):
    extra_percents: list[Decimal] = Field(
        default=[Decimal("0"), Decimal("10"), Decimal("25"), Decimal("50")],
    )


class ExtraPercentPaymentSimulation(BaseModel):
    extra_percent: Decimal
    effective_extra_amount: Decimal
    months_to_payoff: int
    total_interest: Decimal
    interest_saved_vs_minimum: Decimal
    months_saved_vs_minimum: int


# ── Credit efficiency ──────────────────────────────────────────────


class CreditCard(BaseModel):
    id: UUID
    name: str
    balance: Decimal
    credit_limit: Decimal
    utilization_pct: Decimal
    tier: str
    color: str


class CreditEfficiencyResponse(BaseModel):
    cards: list[CreditCard]
    total_balance: Decimal
    total_limit: Decimal
    overall_utilization_pct: Decimal
    overall_tier: str
    overall_color: str


# ── Paydown recommendation ────────────────────────────────────────


class PaydownRecommendRequest(BaseModel):
    available_amount: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)


class PaydownRecommendation(BaseModel):
    card_name: str
    current_utilization: Decimal
    projected_utilization: Decimal
    utilization_drop: Decimal
    recommended_payment: Decimal


# ── Interest projection ───────────────────────────────────────────


class InterestProjection(BaseModel):
    month: int
    monthly_interest: Decimal
    cumulative_interest: Decimal
    total_remaining_balance: Decimal
