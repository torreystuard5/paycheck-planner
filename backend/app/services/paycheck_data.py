"""Shared data loading for paycheck / pay-period planning (budget-scoped)."""

from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bill import Bill
from app.models.bill_cycle_payment import BillCyclePayment
from app.services.bill_cycles import (
    auto_generate_missing_cycle_rows,
    auto_generate_missing_cycle_rows_for_window,
    local_today,
)
from app.models.debt import Debt
from app.models.debt_payment import DebtPayment
from app.models.income import IncomeSource
from app.models.paycheck_entry import PaycheckEntry
from app.models.transaction import Payment
from app.models.user import User
from app.utils.budget import apply_household_budget_filter, validate_budget_ownership


async def household_member_ids(db: AsyncSession, user: User) -> list[UUID]:
    if not user.household_id:
        return [user.id]
    result = await db.execute(
        select(User.id).where(User.household_id == user.household_id)
    )
    return [row[0] for row in result.all()]


async def resolve_anchor_income(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
) -> IncomeSource | None:
    """Household-shared pay calendar: earliest active income for this budget among members."""
    member_ids = await household_member_ids(db, user)
    result = await db.execute(
        select(IncomeSource)
        .where(
            IncomeSource.user_id.in_(member_ids),
            IncomeSource.budget_id == budget_id,
            IncomeSource.is_active.is_(True),
        )
        .order_by(IncomeSource.created_at.asc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def fetch_paycheck_entries(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
) -> list[PaycheckEntry]:
    member_ids = await household_member_ids(db, user)
    result = await db.execute(
        select(PaycheckEntry)
        .where(
            PaycheckEntry.user_id.in_(member_ids),
            PaycheckEntry.budget_id == budget_id,
        )
        .order_by(PaycheckEntry.pay_date.desc())
    )
    return list(result.scalars().all())


async def fetch_scoped_bills_debts(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
) -> tuple[list[Bill], list[Debt]]:
    """Bills/debts for planning — same visibility as GET /bills, budget-scoped."""
    await validate_budget_ownership(user, db, budget_id)

    all_bills, member_count = await fetch_widget_bills(db, user, budget_id)
    today = local_today(user)
    await auto_generate_missing_cycle_rows(db, all_bills, user, today.year, today.month)

    bills: list[Bill] = list(all_bills)

    debts_q = select(Debt).where(Debt.is_active.is_(True))
    if user.household_id:
        debts_q = debts_q.where(
            or_(
                Debt.user_id == user.id,
                Debt.household_id == user.household_id,
            )
        )
    else:
        debts_q = debts_q.where(Debt.user_id == user.id)

    debts_q = apply_household_budget_filter(debts_q, Debt, user, budget_id)
    debts = list((await db.execute(debts_q)).scalars().all())

    filtered_debts: list[Debt] = []
    for debt in debts:
        min_payment = Decimal(str(debt.minimum_payment or 0))
        debt.user_share_amount = min_payment
        debt.split_member_count = 1
        debt.is_split = False

        if min_payment > 0:
            filtered_debts.append(debt)

    return bills, filtered_debts


def _annotate_bill_for_user(bill: Bill, user: User, member_count: int) -> None:
    """Set user_share_amount and is_user_responsible (matches GET /bills logic)."""
    amount = Decimal(str(bill.amount or 0))
    is_household = bill.household_id is not None
    if bill.payment_mode == "split" and is_household and member_count > 0:
        share = (amount / member_count).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        bill.user_share_amount = share
        bill.is_user_responsible = True
    elif is_household:
        if bill.assigned_member_id:
            bill.is_user_responsible = bill.assigned_member_id == user.id
        else:
            bill.is_user_responsible = bill.user_id == user.id
        bill.user_share_amount = amount if bill.is_user_responsible else Decimal("0")
    else:
        bill.user_share_amount = amount
        bill.is_user_responsible = True


async def fetch_widget_bills(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
) -> tuple[list[Bill], int]:
    """All active household bills visible on GET /bills, with share annotations."""
    await validate_budget_ownership(user, db, budget_id)

    if user.household_id:
        member_result = await db.execute(
            select(User.id).where(User.household_id == user.household_id)
        )
        household_member_ids = [row[0] for row in member_result.all()]
        bills_q = select(Bill).where(
            Bill.user_id.in_(household_member_ids),
            Bill.is_active.is_(True),
        )
    else:
        bills_q = select(Bill).where(
            Bill.user_id == user.id,
            Bill.is_active.is_(True),
        )
    bills_q = apply_household_budget_filter(bills_q, Bill, user, budget_id)
    all_bills = list((await db.execute(bills_q)).scalars().all())

    member_count = 1
    if user.household_id:
        count_result = await db.execute(
            select(func.count()).select_from(User).where(
                User.household_id == user.household_id
            )
        )
        member_count = max(count_result.scalar() or 1, 1)

    for bill in all_bills:
        _annotate_bill_for_user(bill, user, member_count)

    return all_bills, member_count


async def get_paid_bill_map(
    db: AsyncSession,
    user_ids: list[UUID],
    bill_ids: list[UUID],
    overall_start: date,
    overall_end: date,
    *,
    bills: list[Bill] | None = None,
    user: User | None = None,
) -> dict[UUID, list[Any]]:
    if not bill_ids or not user_ids:
        return {}

    if bills and user:
        await auto_generate_missing_cycle_rows_for_window(
            db, bills, user, overall_start, overall_end
        )

    cycle_result = await db.execute(
        select(BillCyclePayment.bill_id, BillCyclePayment.due_date, BillCyclePayment.paid_date).where(
            BillCyclePayment.bill_id.in_(bill_ids),
            BillCyclePayment.due_date >= overall_start,
            BillCyclePayment.due_date <= overall_end,
            BillCyclePayment.is_paid.is_(True),
        )
    )
    mapping: dict[UUID, list[Any]] = {}
    for bill_id, due_date, paid_date in cycle_result.all():
        mapping.setdefault(bill_id, []).append(
            {"due_date": due_date, "paid_date": paid_date, "source": "bill_cycle_payments"}
        )

    result = await db.execute(
        select(Payment.bill_id, Payment.paid_date).where(
            Payment.bill_id.in_(bill_ids),
            Payment.user_id.in_(user_ids),
            Payment.paid_date.isnot(None),
            Payment.paid_date >= overall_start,
            Payment.paid_date <= overall_end,
        )
    )
    for row in result.all():
        mapping.setdefault(row[0], []).append(row[1])
    return mapping


async def get_paid_debt_ids_in_window(
    db: AsyncSession,
    debt_ids: list[UUID],
    window_start: date,
    window_end: date,
) -> set[UUID]:
    """Debts with payment rows scoped to this due-date/pay-period window."""
    if not debt_ids:
        return set()

    result = await db.execute(
        select(DebtPayment.debt_id).where(
            DebtPayment.debt_id.in_(debt_ids),
            or_(
                DebtPayment.pay_period_start == window_start,
                (DebtPayment.due_date >= window_start) & (DebtPayment.due_date <= window_end),
            ),
        )
    )
    return {row[0] for row in result.all()}
