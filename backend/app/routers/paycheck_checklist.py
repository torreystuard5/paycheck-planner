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

    # ── Sync debt paid status with DebtPayment table ──
    if body.item_type == "debt":
        await _sync_debt_payment(db, current_user, body.item_id, body.is_checked)

    # ── Sync bill paid status with Bill table ──
    if body.item_type == "bill":
        await _sync_bill_payment(db, current_user, body.item_id, body.is_checked)

    await db.flush()
    await db.refresh(item)
    return item


async def _sync_debt_payment(
    db: AsyncSession, user: User, debt_id, is_checked: bool
):
    """Create or remove a DebtPayment record to stay in sync."""
    today = date.today()
    existing_result = await db.execute(
        select(DebtPayment).where(
            DebtPayment.debt_id == debt_id,
            DebtPayment.user_id == user.id,
            DebtPayment.period_month == today.month,
            DebtPayment.period_year == today.year,
        )
    )
    existing = existing_result.scalar_one_or_none()

    # Fetch the debt to get the minimum_payment amount
    debt_result = await db.execute(select(Debt).where(Debt.id == debt_id))
    debt = debt_result.scalar_one_or_none()
    if not debt:
        return

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
    elif not is_checked and existing:
        # Restore balance
        current_balance = Decimal(str(debt.balance or 0))
        debt.balance = current_balance + Decimal(str(existing.amount))
        await db.delete(existing)


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
    else:
        bill.is_paid = False
        bill.paid_date = None
        bill.paid_amount = None


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
