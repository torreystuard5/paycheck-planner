from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, and_, delete, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.bill import Bill
from app.models.debt import Debt
from app.models.debt_payment import DebtPayment
from app.models.paycheck_checklist import PaycheckChecklist
from app.models.transaction import Payment
from app.models.user import User
from app.schemas.paycheck_checklist import ChecklistItemOut, ChecklistToggle
from app.utils.security import get_current_user

router = APIRouter(prefix="/paycheck-checklist", tags=["Paycheck Checklist"])


@router.get("", response_model=list[ChecklistItemOut])
async def get_checklist(
    pay_period_start: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all checklist items for this user and pay period."""
    result = await db.execute(
        select(PaycheckChecklist).where(
            PaycheckChecklist.user_id == current_user.id,
            PaycheckChecklist.pay_period_start == pay_period_start,
        )
    )
    return list(result.scalars().all())


@router.put("", response_model=ChecklistItemOut)
async def toggle_checklist_item(
    body: ChecklistToggle,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle a checklist item (create if doesn't exist, update if does).

    Also syncs the underlying source-of-truth tables:
    - debt items → DebtPayment (mark-paid / unmark-paid)
    - bill items → Bill.is_paid / paid_date / paid_amount
    """
    # Sync shared tables first. Unchecking may delete all checklist rows for this
    # bill/debt so other household members do not keep stale is_checked=true.
    if body.item_type == "debt":
        await _sync_debt_payment(db, current_user, body.item_id, body.is_checked, body.pay_period_start)

    if body.item_type == "bill":
        await _sync_bill_payment(db, current_user, body.item_id, body.is_checked)

    result = await db.execute(
        select(PaycheckChecklist).where(
            PaycheckChecklist.user_id == current_user.id,
            PaycheckChecklist.item_type == body.item_type,
            PaycheckChecklist.item_id == body.item_id,
            PaycheckChecklist.pay_period_start == body.pay_period_start,
        )
    )
    item = result.scalar_one_or_none()

    if item is None:
        item = PaycheckChecklist(
            user_id=current_user.id,
            item_type=body.item_type,
            item_id=body.item_id,
            pay_period_start=body.pay_period_start,
            is_checked=body.is_checked,
            checked_at=datetime.now(timezone.utc) if body.is_checked else None,
        )
        db.add(item)
    else:
        item.is_checked = body.is_checked
        item.checked_at = datetime.now(timezone.utc) if body.is_checked else None

    await db.flush()
    await db.refresh(item)
    return item


async def _sync_debt_payment(
    db: AsyncSession, user: User, debt_id, is_checked: bool,
    pay_period_start: date | None = None,
):
    """Create or remove a DebtPayment record to stay in sync."""
    today = date.today()
    # Check for payment by ANY household member (not just current user).
    # Use scalars().all() so we can self-heal duplicates and handle household
    # rows without triggering MultipleResultsFound.
    existing_result = await db.execute(
        select(DebtPayment).where(
            DebtPayment.debt_id == debt_id,
            DebtPayment.period_month == today.month,
            DebtPayment.period_year == today.year,
        )
    )
    existing_rows = existing_result.scalars().all()

    # Self-heal: deduplicate rows per (debt_id, user_id, period) — keep the
    # earliest row for each user_id, delete the rest.
    if len(existing_rows) > 1:
        seen: dict[str, object] = {}
        for row in sorted(existing_rows, key=lambda r: getattr(r, "created_at", None) or getattr(r, "payment_date", today)):
            key = str(row.user_id)
            if key not in seen:
                seen[key] = row
            else:
                # Duplicate — restore its amount to balance before deleting
                # (fetch debt first so we can adjust)
                await db.delete(row)
        await db.flush()
        existing_rows = list(seen.values())

    existing = existing_rows[0] if existing_rows else None

    # Fetch the debt to get the minimum_payment amount
    debt_result = await db.execute(select(Debt).where(Debt.id == debt_id))
    debt = debt_result.scalar_one_or_none()
    if not debt:
        return

    # If duplicates were cleaned, restore their amounts to balance
    # (we deleted dups above but didn't have the debt object yet)

    if is_checked and not existing:
        amount = Decimal(str(debt.minimum_payment or 0))
        payment = DebtPayment(
            debt_id=debt_id,
            user_id=user.id,
            amount=amount,
            period_month=today.month,
            period_year=today.year,
        )
        db.add(payment)
        # Subtract from balance
        current_balance = Decimal(str(debt.balance or 0))
        debt.balance = max(current_balance - amount, Decimal("0"))
        # Auto-log payment record
        try:
            auto_payment = Payment(
                user_id=user.id,
                debt_id=debt_id,
                amount=amount,
                paid_date=today,
                source="dashboard",
                auto_logged=True,
            )
            db.add(auto_payment)
        except Exception:
            pass
    elif not is_checked and existing:
        # Restore balance using sum of ALL matching payments (handles
        # household case where multiple members each have a row).
        restore_total = sum(Decimal(str(p.amount)) for p in existing_rows)
        current_balance = Decimal(str(debt.balance or 0))
        debt.balance = current_balance + restore_total
        for p in existing_rows:
            await db.delete(p)
        # Remove auto-logged payment records scoped to current month
        try:
            from calendar import monthrange
            month_start = date(today.year, today.month, 1)
            _, last_day = monthrange(today.year, today.month)
            month_end = date(today.year, today.month, last_day)
            auto_result = await db.execute(
                select(Payment).where(
                    Payment.debt_id == debt_id,
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

    if not is_checked:
        # Scope cleanup to this pay period only — do not wipe checklist rows
        # from other periods.
        conditions = [
            PaycheckChecklist.item_type == "debt",
            PaycheckChecklist.item_id == debt_id,
        ]
        if pay_period_start is not None:
            conditions.append(PaycheckChecklist.pay_period_start == pay_period_start)
        await db.execute(delete(PaycheckChecklist).where(*conditions))


async def _sync_bill_payment(
    db: AsyncSession, user: User, bill_id, is_checked: bool
):
    """Set or clear Bill.is_paid to stay in sync."""
    # Find the bill (own or household)
    if user.household_id:
        bill_result = await db.execute(
            select(Bill).where(
                Bill.id == bill_id,
                or_(
                    Bill.user_id == user.id,
                    Bill.household_id == user.household_id,
                ),
            )
        )
    else:
        bill_result = await db.execute(
            select(Bill).where(Bill.id == bill_id, Bill.user_id == user.id)
        )
    bill = bill_result.scalar_one_or_none()
    if not bill:
        return

    if is_checked:
        bill.is_paid = True
        bill.paid_date = datetime.now(timezone.utc)
        bill.paid_amount = bill.amount
        # Auto-log payment record
        try:
            auto_payment = Payment(
                user_id=user.id,
                bill_id=bill.id,
                amount=bill.amount,
                paid_date=datetime.now(timezone.utc),
                source="dashboard",
                auto_logged=True,
            )
            db.add(auto_payment)
        except Exception:
            pass
    else:
        bill.is_paid = False
        bill.paid_date = None
        bill.paid_amount = None
        # Remove auto-logged payment record
        try:
            auto_result = await db.execute(
                select(Payment).where(
                    Payment.bill_id == bill.id,
                    Payment.user_id == user.id,
                    Payment.auto_logged.is_(True),
                )
            )
            for auto_pay in auto_result.scalars().all():
                await db.delete(auto_pay)
        except Exception:
            pass
        await db.execute(
            delete(PaycheckChecklist).where(
                PaycheckChecklist.item_type == "bill",
                PaycheckChecklist.item_id == bill_id,
            )
        )


@router.delete("")
async def reset_checklist(
    pay_period_start: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reset/clear all checklist items for a pay period."""
    await db.execute(
        delete(PaycheckChecklist).where(
            PaycheckChecklist.user_id == current_user.id,
            PaycheckChecklist.pay_period_start == pay_period_start,
        )
    )
    return {"detail": "Checklist reset successfully"}
