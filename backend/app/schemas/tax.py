from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


TAX_CATEGORIES = [
    "Medical",
    "Charitable",
    "Business",
    "Education",
    "Home Office",
    "State/Local Taxes",
    "Other",
]


class TaxDeductionCreate(BaseModel):
    name: str = Field(max_length=255)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    category: str = Field(max_length=50)
    date: date
    tax_year: int = Field(ge=2000, le=2100)
    receipt_note: Optional[str] = None
    bill_id: Optional[UUID] = None
    budget_id: Optional[UUID] = None


class TaxDeductionUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=255)
    amount: Optional[Decimal] = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    category: Optional[str] = Field(default=None, max_length=50)
    date: Optional[date] = None
    tax_year: Optional[int] = Field(default=None, ge=2000, le=2100)
    receipt_note: Optional[str] = None
    budget_id: Optional[UUID] = None


class TaxDeductionResponse(BaseModel):
    id: UUID
    user_id: UUID
    household_id: Optional[UUID] = None
    name: str
    amount: Decimal
    category: str
    date: date
    tax_year: int
    receipt_note: Optional[str] = None
    budget_id: Optional[UUID] = None
    bill_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MonthlyBreakdown(BaseModel):
    month: int
    total: Decimal


class TaxSummaryResponse(BaseModel):
    tax_year: int
    total_deductions: Decimal
    by_category: dict[str, Decimal]
    deduction_count: int
    monthly_breakdown: list[MonthlyBreakdown]
