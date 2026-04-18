from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.transaction import Payment
from app.models.user import User
from app.services.household_service import get_household_members
from app.utils.security import get_current_user

router = APIRouter(prefix="/reports", tags=["Reports"])


class SpendingMonthRow(BaseModel):
    month: str
    total: Decimal


class SpendingCategoryRow(BaseModel):
    category: str
    total: Decimal


class SpendingReportResponse(BaseModel):
    by_month: list[SpendingMonthRow]
    by_category: list[SpendingCategoryRow]


@router.get("/spending", response_model=SpendingReportResponse)
async def spending_report(
    months: int = Query(default=6, ge=1, le=24),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregate recorded payments over recent months (household-aware)."""
    if current_user.household_id:
        members = await get_household_members(current_user.household_id, db)
        member_ids = [m.id for m in members]
        q = select(Payment).where(Payment.user_id.in_(member_ids))
    else:
        q = select(Payment).where(Payment.user_id == current_user.id)

    start = date.today().replace(day=1) - timedelta(days=32 * (months - 1))
    q = q.where(Payment.paid_date.isnot(None), Payment.paid_date >= start)
    q = q.options(selectinload(Payment.bill), selectinload(Payment.debt))

    result = await db.execute(q)
    payments = list(result.scalars().all())

    by_month: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    by_category: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))

    for p in payments:
        amt = Decimal(str(p.amount or 0))
        if p.paid_date:
            key = p.paid_date.isoformat()[:7]
            by_month[key] += amt
        cat = "Other"
        if p.bill_id and p.bill:
            cat = p.bill.category or "Other"
        elif p.debt_id and p.debt:
            cat = p.debt.name or "Debt payment"
        elif p.debt_id:
            cat = "Debt payment"
        by_category[cat] += amt

    month_rows = [
        SpendingMonthRow(month=m, total=by_month[m])
        for m in sorted(by_month.keys())
    ]
    cat_rows = [
        SpendingCategoryRow(category=c, total=by_category[c])
        for c in sorted(by_category.keys(), key=lambda x: by_category[x], reverse=True)
    ]

    return SpendingReportResponse(by_month=month_rows, by_category=cat_rows)
