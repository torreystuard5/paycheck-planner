"""Business reporting — trends using shared profit calculations."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.business import BusinessDeduction, BusinessFund, BusinessFundTransaction, BusinessSale
from app.models.user import User
from app.services.business_profit import compute_net_profit
from app.services.business_context import BusinessContext, get_business_ctx

router = APIRouter(prefix="/business/reports", tags=["Business Reports"])


@router.get("/overview")
async def reports_overview(
    range_key: str = Query("month", alias="range"),
    db: AsyncSession = Depends(get_db),
    ctx: BusinessContext = Depends(get_business_ctx),
):
    today = date.today()
    rk = (range_key or "month").lower()
    if rk == "week":
        d0 = today - timedelta(days=today.weekday())
    elif rk == "year":
        d0 = date(today.year, 1, 1)
    else:
        d0 = date(today.year, today.month, 1)
    d1 = today

    profit = await compute_net_profit(db, ctx.owner_id, d0, d1)

    sales_by_day = await db.execute(
        select(BusinessSale.sale_date, func.coalesce(func.sum(BusinessSale.amount), 0))
        .where(
            BusinessSale.user_id == ctx.owner_id,
            BusinessSale.is_active.is_(True),
            BusinessSale.sale_date >= d0,
            BusinessSale.sale_date <= d1,
        )
        .group_by(BusinessSale.sale_date)
        .order_by(BusinessSale.sale_date)
    )
    ded_by_cat = await db.execute(
        select(BusinessDeduction.category, func.coalesce(func.sum(BusinessDeduction.amount), 0))
        .where(
            BusinessDeduction.user_id == ctx.owner_id,
            BusinessDeduction.is_active.is_(True),
            BusinessDeduction.deduction_date >= d0,
            BusinessDeduction.deduction_date <= d1,
        )
        .group_by(BusinessDeduction.category)
    )
    funds = await db.execute(
        select(BusinessFund).where(
            BusinessFund.user_id == ctx.owner_id, BusinessFund.is_active.is_(True)
        )
    )
    fund_balances = [
        {
            "fund_type": f.fund_type,
            "balance": str(f.current_balance or 0),
            "target_amount": str(f.target_amount or 0),
        }
        for f in funds.scalars().all()
    ]

    return {
        "range_start": d0.isoformat(),
        "range_end": d1.isoformat(),
        "profit": {k: str(v) for k, v in profit.items()},
        "sales_trend": [
            {"date": r[0].isoformat(), "amount": str(r[1])} for r in sales_by_day.all()
        ],
        "deductions_by_category": [
            {"category": r[0] or "uncategorized", "amount": str(r[1])} for r in ded_by_cat.all()
        ],
        "fund_balances": fund_balances,
    }
