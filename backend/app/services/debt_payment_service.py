"""Debt period payment sync — single source of truth for mark-paid / checklist."""

from __future__ import annotations

from calendar import monthrange
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.debt import Debt
from app.models.debt_payment import DebtPayment
from app.models.transaction import Payment
from app.models.user import User


async def fetch_period_debt_payments(
    db: AsyncSession,
    debt_id: UUID,
    *,
    month: int,
    year: int,
) -> list[DebtPayment]:
    result = await db.execute(
        select(DebtPayment).where(
            DebtPayment.debt_id == debt_id,
            DebtPayment.period_month == month,
            DebtPayment.period_year == year,
        )
    )
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
        key = str(row.user_id)
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
) -> DebtPayment:
    """Record a period payment, reduce balance, and auto-log a Payment row."""
    today = today or date.today()
    current_balance = Decimal(str(debt.balance or 0))
    pay_amount = amount
    if pay_amount > current_balance and current_balance > 0:
        pay_amount = current_balance

    payment = DebtPayment(
        debt_id=debt.id,
        user_id=user.id,
        amount=pay_amount,
        period_month=today.month,
        period_year=today.year,
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
            month_start = date(today.year, today.month, 1)
            _, last_day = monthrange(today.year, today.month)
            month_end = date(today.year, today.month, last_day)
            auto_result = await db.execute(
                select(Payment).where(
                    Payment.debt_id == debt.id,
                    Payment.user_id == user.id,
                    Payment.auto_logged.is_(True),
                    Payment.paid_date >= month_start,
                    Payment.paid_date <= month_end,
                )
            )
            for auto_pay in auto_result.scalars().all():
                await db.delete(auto_pay)
        except Exception:
            pass

    return restore_total
