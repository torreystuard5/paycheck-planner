import logging
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bill import Bill
from app.models.debt import Debt
from app.models.user import User
from app.services.email_service import send_bill_reminder, send_debt_reminder
from app.utils.due_dates import next_monthly_due_date

logger = logging.getLogger(__name__)


async def check_and_send_reminders(
    db: AsyncSession, user_id=None
) -> dict:
    """Check all active bills and debts and send reminders where appropriate.

    If user_id is provided, only check for that user.
    """
    today = date.today()
    bills_reminded = 0
    debts_reminded = 0
    errors: list[str] = []

    # --- Bill reminders ---
    bill_query = select(Bill).where(Bill.is_active.is_(True))
    if user_id:
        bill_query = bill_query.where(Bill.user_id == user_id)
    result = await db.execute(bill_query)
    bills = result.scalars().all()

    for bill in bills:
        try:
            next_due = next_monthly_due_date(bill.due_day, today=today)
            if next_due is None:
                continue
            days_until = (next_due - today).days
            if days_until == bill.reminder_days:
                # Fetch user for email
                user_result = await db.execute(
                    select(User).where(User.id == bill.user_id)
                )
                user = user_result.scalar_one_or_none()
                if not user:
                    continue

                sent = await send_bill_reminder(
                    user_email=user.email,
                    user_name=f"{user.first_name} {user.last_name}",
                    bill_name=bill.name,
                    amount=Decimal(str(bill.amount)),
                    due_date=next_due,
                    days_until_due=days_until,
                )
                if sent:
                    bills_reminded += 1
                else:
                    errors.append(f"Failed to send reminder for bill: {bill.name}")
        except Exception as e:
            logger.exception("Error processing bill reminder for %s", bill.name)
            errors.append(f"Error processing bill {bill.name}: {str(e)}")

    # --- Debt reminders ---
    debt_query = select(Debt).where(Debt.is_active.is_(True))
    if user_id:
        debt_query = debt_query.where(Debt.user_id == user_id)
    result = await db.execute(debt_query)
    debts = result.scalars().all()

    for debt in debts:
        try:
            next_due = next_monthly_due_date(debt.due_day, today=today)
            if next_due is None:
                continue
            days_until = (next_due - today).days
            if days_until == debt.reminder_days:
                user_result = await db.execute(
                    select(User).where(User.id == debt.user_id)
                )
                user = user_result.scalar_one_or_none()
                if not user:
                    continue

                sent = await send_debt_reminder(
                    user_email=user.email,
                    user_name=f"{user.first_name} {user.last_name}",
                    debt_name=debt.name,
                    minimum_payment=Decimal(str(debt.minimum_payment)),
                    due_date=next_due,
                    days_until_due=days_until,
                )
                if sent:
                    debts_reminded += 1
                else:
                    errors.append(f"Failed to send reminder for debt: {debt.name}")
        except Exception as e:
            logger.exception("Error processing debt reminder for %s", debt.name)
            errors.append(f"Error processing debt {debt.name}: {str(e)}")

    return {
        "bills_reminded": bills_reminded,
        "debts_reminded": debts_reminded,
        "errors": errors,
    }
