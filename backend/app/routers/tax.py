"""Tax Prep & Deduction Tracking endpoints."""

import csv
import io
from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.tax_deduction import TaxDeduction
from app.models.user import User
from app.schemas.tax import (
    TaxDeductionCreate,
    TaxDeductionResponse,
    TaxDeductionUpdate,
    TaxSummaryResponse,
    MonthlyBreakdown,
)
from app.utils.budget import resolve_budget_id, validate_budget_ownership
from app.utils.security import get_current_user

router = APIRouter(prefix="/tax", tags=["Tax"])


# ── CRUD ──────────────────────────────────────────────────────────────


@router.post("/deductions", response_model=TaxDeductionResponse, status_code=status.HTTP_201_CREATED)
async def create_deduction(
    body: TaxDeductionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    budget_id = await resolve_budget_id(current_user, db, body.budget_id)
    deduction = TaxDeduction(
        user_id=current_user.id,
        household_id=current_user.household_id,
        name=body.name,
        amount=body.amount,
        category=body.category,
        date=body.date,
        tax_year=body.tax_year,
        receipt_note=body.receipt_note,
        bill_id=body.bill_id,
        budget_id=budget_id,
    )
    db.add(deduction)
    await db.commit()
    await db.refresh(deduction)
    return deduction


@router.get("/deductions", response_model=list[TaxDeductionResponse])
async def list_deductions(
    tax_year: int = Query(..., ge=2000, le=2100),
    category: str | None = Query(default=None),
    budget_id: Optional[UUID] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(TaxDeduction)
        .where(TaxDeduction.user_id == current_user.id, TaxDeduction.tax_year == tax_year)
        .order_by(TaxDeduction.date.desc())
    )
    if budget_id is not None:
        stmt = stmt.where(TaxDeduction.budget_id == budget_id)
    if category:
        stmt = stmt.where(TaxDeduction.category == category)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.put("/deductions/{deduction_id}", response_model=TaxDeductionResponse)
async def update_deduction(
    deduction_id: UUID,
    body: TaxDeductionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TaxDeduction).where(
            TaxDeduction.id == deduction_id, TaxDeduction.user_id == current_user.id
        )
    )
    deduction = result.scalar_one_or_none()
    if not deduction:
        raise HTTPException(status_code=404, detail="Deduction not found")

    updates = body.model_dump(exclude_unset=True)
    if "budget_id" in updates and updates["budget_id"] is not None:
        await validate_budget_ownership(current_user, db, updates["budget_id"])
    for field, value in updates.items():
        setattr(deduction, field, value)

    await db.commit()
    await db.refresh(deduction)
    return deduction


@router.delete("/deductions/{deduction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_deduction(
    deduction_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TaxDeduction).where(
            TaxDeduction.id == deduction_id, TaxDeduction.user_id == current_user.id
        )
    )
    deduction = result.scalar_one_or_none()
    if not deduction:
        raise HTTPException(status_code=404, detail="Deduction not found")

    await db.delete(deduction)
    await db.commit()


# ── Summary ───────────────────────────────────────────────────────────


@router.get("/summary", response_model=TaxSummaryResponse)
async def tax_summary(
    tax_year: int = Query(..., ge=2000, le=2100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TaxDeduction).where(
            TaxDeduction.user_id == current_user.id, TaxDeduction.tax_year == tax_year
        )
    )
    deductions = result.scalars().all()

    total = Decimal("0")
    by_category: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    by_month: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))

    for d in deductions:
        amt = Decimal(str(d.amount))
        total += amt
        by_category[d.category] += amt
        by_month[d.date.month] += amt

    monthly_breakdown = [
        MonthlyBreakdown(month=m, total=by_month[m])
        for m in sorted(by_month.keys())
    ]

    return TaxSummaryResponse(
        tax_year=tax_year,
        total_deductions=total,
        by_category=dict(by_category),
        deduction_count=len(deductions),
        monthly_breakdown=monthly_breakdown,
    )


# ── CSV Export ────────────────────────────────────────────────────────


@router.get("/export")
async def export_deductions(
    tax_year: int = Query(..., ge=2000, le=2100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TaxDeduction)
        .where(TaxDeduction.user_id == current_user.id, TaxDeduction.tax_year == tax_year)
        .order_by(TaxDeduction.date)
    )
    deductions = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Description", "Category", "Amount", "Notes"])
    for d in deductions:
        writer.writerow([
            d.date.isoformat(),
            d.name,
            d.category,
            f"{d.amount:.2f}",
            d.receipt_note or "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=tax_deductions_{tax_year}.csv"},
    )
