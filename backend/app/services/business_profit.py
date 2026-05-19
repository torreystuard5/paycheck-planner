"""Central net profit calculation for Business Edition."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import (
    BusinessDeduction,
    BusinessFund,
    BusinessFundTransaction,
    BusinessSale,
    BusinessStaffPayRun,
)

# v1: Net = Sales - Deductions - Staff Pay - Contingency deposits - Upgrade deposits
# Withdrawals from funds are not expenses (money already counted when deposited).


async def sum_sales(db: AsyncSession, user_id, d0: date, d1: date) -> Decimal:
    r = await db.execute(
        select(func.coalesce(func.sum(BusinessSale.amount), 0)).where(
            BusinessSale.user_id == user_id,
            BusinessSale.is_active.is_(True),
            BusinessSale.sale_date >= d0,
            BusinessSale.sale_date <= d1,
        )
    )
    return Decimal(str(r.scalar() or 0))


async def sum_deductions(db: AsyncSession, user_id, d0: date, d1: date) -> Decimal:
    r = await db.execute(
        select(func.coalesce(func.sum(BusinessDeduction.amount), 0)).where(
            BusinessDeduction.user_id == user_id,
            BusinessDeduction.is_active.is_(True),
            BusinessDeduction.deduction_date >= d0,
            BusinessDeduction.deduction_date <= d1,
        )
    )
    return Decimal(str(r.scalar() or 0))


async def sum_staff_pay(db: AsyncSession, user_id, d0: date, d1: date) -> Decimal:
    r = await db.execute(
        select(func.coalesce(func.sum(BusinessStaffPayRun.net_pay), 0)).where(
            BusinessStaffPayRun.user_id == user_id,
            BusinessStaffPayRun.is_active.is_(True),
            BusinessStaffPayRun.period_end >= d0,
            BusinessStaffPayRun.period_end <= d1,
        )
    )
    return Decimal(str(r.scalar() or 0))


async def sum_fund_deposits(
    db: AsyncSession, user_id, d0: date, d1: date, fund_type: str
) -> Decimal:
    r = await db.execute(
        select(func.coalesce(func.sum(BusinessFundTransaction.amount), 0))
        .join(BusinessFund, BusinessFund.id == BusinessFundTransaction.fund_id)
        .where(
            BusinessFundTransaction.user_id == user_id,
            BusinessFundTransaction.is_active.is_(True),
            BusinessFund.fund_type == fund_type,
            BusinessFundTransaction.kind == "deposit",
            BusinessFundTransaction.amount > 0,
            BusinessFundTransaction.tx_date >= d0,
            BusinessFundTransaction.tx_date <= d1,
        )
    )
    return Decimal(str(r.scalar() or 0))


async def compute_net_profit(
    db: AsyncSession, user_id, d0: date, d1: date
) -> dict[str, Decimal]:
    sales = await sum_sales(db, user_id, d0, d1)
    deductions = await sum_deductions(db, user_id, d0, d1)
    staff_pay = await sum_staff_pay(db, user_id, d0, d1)
    contingency = await sum_fund_deposits(db, user_id, d0, d1, "contingency")
    upgrade = await sum_fund_deposits(db, user_id, d0, d1, "upgrade")
    fund_contributions = contingency + upgrade
    net = sales - deductions - staff_pay - fund_contributions
    return {
        "total_sales": sales,
        "total_deductions": deductions,
        "total_staff_pay": staff_pay,
        "contingency_contributions": contingency,
        "upgrade_contributions": upgrade,
        "total_fund_contributions": fund_contributions,
        "net_profit": net,
    }
