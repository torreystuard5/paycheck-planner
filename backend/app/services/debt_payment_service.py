"""Debt period payment sync — single source of truth for mark-paid / checklist."""

from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.debt import Debt
from app.models.debt_payment import DebtPayment
from app.models.transaction import Payment
from app.models.user import User
from app.utils.due_dates import next_monthly_due_date


def _valid_date(value: object) -> date | None:
    if all(hasattr(value, attr) for attr in ("year", "month", "day")):
        return value  # type: ignore[return-value]
    return None


def debt_due_date_for_period(debt: Debt, target: date | None = None) -> date | None:
    """Return the debt due date on or after target using the monthly due day."""
    target = target or date.today()
    return next_monthly_due_date(debt.due_day or 1, today=target)


def next_debt_due_date_after(due_date: date, debt: Debt) -> date | None:
    return next_monthly_due_date(debt.due_day or 1, today=due_date + timedelta(days=1))


async def fetch_period_debt_payments(
    db: AsyncSession,
    debt_id: UUID,
    *,
    month: int,
    year: int,
    due_date: date | None = None,
    pay_period_start: date | None = None,
    user_id: UUID | None = None,
) -> list[DebtPayment]:
    due_date = _valid_date(due_date)
    pay_period_start = _valid_date(pay_period_start)
    conditions = [DebtPayment.debt_id == debt_id]
    if due_date is not None:
        conditions.append(DebtPayment.due_date == due_date)
    elif pay_period_start is not None:
        conditions.append(DebtPayment.pay_period_start == pay_period_start)
    else:
        conditions.extend(
            [
                DebtPayment.period_month == month,
                DebtPayment.period_year == year,
            ]
        )
    if user_id is not None:
        conditions.append(DebtPayment.user_id == user_id)
    result = await db.execute(select(DebtPayment).where(*conditions))
    return list(result.scalars().all())


async def dedupe_period_debt_payments(
    db: AsyncSession,
    debt: Debt,
    rows: list[DebtPayment],
) -> list[DebtPayment]:
    """Self-heal duplicate rows per user; restore balance for removed duplicates."""
    if len(rows) <= 1:
        return rows

    seen: dict[str, DebtPayment] = {}
    for row in sorted(rows, key=lambda r: getattr(r, "created_at", None) or getattr(r, "payment_date", date.today())):
        scoped_due = getattr(row, "due_date", None)
        scoped_period = getattr(row, "pay_period_start", None)
        key = f"{row.user_id}:{scoped_due}:{scoped_period}"
        if key not in seen:
            seen[key] = row
        else:
            dup_amt = Decimal(str(row.amount))
            debt.balance = Decimal(str(debt.balance or 0)) + dup_amt
            await db.delete(row)
    await db.flush()
    return list(seen.values())


async def create_period_debt_payment(
    db: AsyncSession,
    user: User,
    debt: Debt,
    amount: Decimal,
    *,
    auto_log_source: str,
    today: date | None = None,
    due_date: date | None = None,
    pay_period_start: date | None = None,
) -> DebtPayment:
    """Record a period payment, reduce balance, and auto-log a Payment row."""
    today = today or date.today()
    due_date = _valid_date(due_date)
    pay_period_start = _valid_date(pay_period_start)
    due_date = due_date or debt_due_date_for_period(debt, today)
    pay_period_start = pay_period_start or today.replace(day=1)
    current_balance = Decimal(str(debt.balance or 0))
    pay_amount = amount
    if pay_amount > current_balance and current_balance > 0:
        pay_amount = current_balance

    payment = DebtPayment(
        debt_id=debt.id,
        user_id=user.id,
        amount=pay_amount,
        due_date=due_date,
        pay_period_start=pay_period_start,
        period_month=(due_date.month if due_date else today.month),
        period_year=(due_date.year if due_date else today.year),
    )
    db.add(payment)
    debt.balance = max(current_balance - pay_amount, Decimal("0"))

    try:
        db.add(
            Payment(
                user_id=user.id,
                debt_id=debt.id,
                amount=pay_amount,
                paid_date=today,
                pay_period_date=pay_period_start,
                source=auto_log_source,
                auto_logged=True,
            )
        )
    except Exception:
        pass

    return payment


async def remove_period_debt_payments(
    db: AsyncSession,
    user: User,
    debt: Debt,
    payments: list[DebtPayment],
    *,
    remove_auto_logged: bool = True,
    today: date | None = None,
) -> Decimal:
    """Delete period payments, restore balance, optionally remove auto-logged rows."""
    today = today or date.today()
    restore_total = sum(Decimal(str(getattr(p, "amount", 0) or 0)) for p in payments)
    current_balance = Decimal(str(debt.balance or 0))
    debt.balance = current_balance + restore_total

    for payment in payments:
        await db.delete(payment)

    if remove_auto_logged and payments:
        try:
            period_starts = [
                getattr(payment, "pay_period_start", None)
                for payment in payments
                if getattr(payment, "pay_period_start", None) is not None
            ]
            conditions = [
                Payment.debt_id == debt.id,
                Payment.user_id == user.id,
                Payment.auto_logged.is_(True),
            ]
            if period_starts:
                conditions.append(Payment.pay_period_date.in_(period_starts))
            else:
                month_start = date(today.year, today.month, 1)
                _, last_day = monthrange(today.year, today.month)
                month_end = date(today.year, today.month, last_day)
                conditions.extend(
                    [
                        Payment.paid_date >= month_start,
                        Payment.paid_date <= month_end,
                    ]
                )
            auto_result = await db.execute(
                select(Payment).where(*conditions)
            )
            for auto_pay in auto_result.scalars().all():
                await db.delete(auto_pay)
        except Exception:
            pass

    return restore_total
