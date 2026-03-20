import logging
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bill import Bill
from app.models.debt import Debt
from app.models.user import User
from app.services.email_service import send_bill_reminder, send_debt_reminder

logger = logging.getLogger(__name__)


def _next_due_date(due_day: int, today: date) -> date:
    """Calculate the next due date for a given due_day from today."""
    try:
        candidate = today.replace(day=due_day)
    except ValueError:
        # due_day exceeds days in current month — use last day of month
        import calendar
        last_day = calendar.monthrange(today.year, today.month)[1]
        candidate = today.replace(day=min(due_day, last_day))

    if candidate < today:
        # Move to next month
        if today.month == 12:
            next_month = today.replace(year=today.year + 1, month=1, day=1)
        else:
            next_month = today.replace(month=today.month + 1, day=1)
        import calendar
        last_day = calendar.monthrange(next_month.year, next_month.month)[1]
        candidate = next_month.replace(day=min(due_day, last_day))

    return candidate


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
            next_due = _next_due_date(bill.due_day, today)
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
            next_due = _next_due_date(debt.due_day, today)
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
