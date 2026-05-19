"""Business tax prep — Schedule C style grouping and accountant export."""

from __future__ import annotations

import csv
import io
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.business import BusinessDeduction, BusinessStaffPayRun
from app.models.user import User
from app.services.business_context import BusinessContext, get_business_ctx

router = APIRouter(prefix="/business/tax-prep", tags=["Business Tax Prep"])

SCHEDULE_C_CATEGORIES = [
    "advertising",
    "contract_labor",
    "rent_lease",
    "supplies",
    "utilities",
    "wages",
    "repairs_maintenance",
    "insurance",
    "office_expense",
    "meals",
    "mileage",
    "other",
]

CATEGORY_LABELS = {
    "advertising": "Advertising",
    "contract_labor": "Contract labor",
    "rent_lease": "Rent or lease",
    "supplies": "Supplies",
    "utilities": "Utilities",
    "wages": "Wages",
    "repairs_maintenance": "Repairs and maintenance",
    "insurance": "Insurance",
    "office_expense": "Office expense",
    "meals": "Meals",
    "mileage": "Mileage",
    "other": "Other expenses",
}


def _year_bounds(year: int) -> tuple[date, date]:
    return date(year, 1, 1), date(year, 12, 31)


async def _build_tax_summary(db: AsyncSession, ctx: BusinessContext, year: int) -> dict:
    ctx.require("view_tax_prep")
    owner_id = ctx.owner_id
    d0, d1 = _year_bounds(year)

    by_cat: dict[str, Decimal] = {c: Decimal("0") for c in SCHEDULE_C_CATEGORIES}
    r = await db.execute(
        select(
            BusinessDeduction.tax_schedule_c_category,
            func.coalesce(func.sum(BusinessDeduction.amount), 0),
        )
        .where(
            BusinessDeduction.user_id == owner_id,
            BusinessDeduction.is_active.is_(True),
            BusinessDeduction.deduction_date >= d0,
            BusinessDeduction.deduction_date <= d1,
        )
        .group_by(BusinessDeduction.tax_schedule_c_category)
    )
    for cat, total in r.all():
        key = (cat or "other").lower()
        if key not in by_cat:
            key = "other"
        by_cat[key] += Decimal(str(total))

    wages_r = await db.execute(
        select(func.coalesce(func.sum(BusinessStaffPayRun.net_pay), 0)).where(
            BusinessStaffPayRun.user_id == owner_id,
            BusinessStaffPayRun.is_active.is_(True),
            BusinessStaffPayRun.period_end >= d0,
            BusinessStaffPayRun.period_end <= d1,
        )
    )
    wages_total = Decimal(str(wages_r.scalar() or 0))
    by_cat["wages"] = by_cat.get("wages", Decimal("0")) + wages_total

    contractors_r = await db.execute(
        select(
            BusinessDeduction.vendor,
            func.coalesce(func.sum(BusinessDeduction.amount), 0),
        )
        .where(
            BusinessDeduction.user_id == owner_id,
            BusinessDeduction.is_active.is_(True),
            BusinessDeduction.is_1099_contractor.is_(True),
            BusinessDeduction.deduction_date >= d0,
            BusinessDeduction.deduction_date <= d1,
        )
        .group_by(BusinessDeduction.vendor)
    )
    contractors = []
    threshold = Decimal("600")
    for name, total in contractors_r.all():
        amt = Decimal(str(total))
        contractors.append(
            {
                "vendor": name or "Unknown",
                "total": str(amt),
                "requires_1099": amt >= threshold,
            }
        )

    categories = [
        {
            "key": k,
            "label": CATEGORY_LABELS.get(k, k),
            "total": str(by_cat.get(k, Decimal("0"))),
        }
        for k in SCHEDULE_C_CATEGORIES
    ]
    grand = sum(by_cat.values(), Decimal("0"))

    return {
        "year": year,
        "categories": categories,
        "total_deductions": str(grand),
        "contractors_1099": contractors,
        "disclaimer": (
            "PayDrift organizes your business records for tax preparation. "
            "PayDrift does not file taxes or provide tax advice."
        ),
    }


@router.get("/summary")
async def tax_prep_summary(
    year: int = Query(..., ge=2000, le=2100),
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    return await _build_tax_summary(db, ctx, year)


@router.get("/export.csv")
async def export_tax_csv(
    year: int = Query(..., ge=2000, le=2100),
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    data = await _build_tax_summary(db, ctx, year)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["PayDrift Business Tax Export", f"Year {year}"])
    w.writerow([])
    w.writerow(["Category", "Amount"])
    for row in data["categories"]:
        w.writerow([row["label"], row["total"]])
    w.writerow([])
    w.writerow(["Total", data["total_deductions"]])
    w.writerow([])
    w.writerow(["1099 contractors (>= $600)"])
    w.writerow(["Vendor", "Total", "Requires 1099"])
    for c in data["contractors_1099"]:
        w.writerow([c["vendor"], c["total"], "yes" if c["requires_1099"] else "no"])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="business-tax-{year}.csv"'},
    )
