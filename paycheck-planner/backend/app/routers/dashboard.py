from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.bill import Bill
from app.models.user import User
from app.routers.bills import _bill_to_response, _compute_next_due_date, _get_household_member_count
from app.utils.security import get_current_user

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


class UpcomingBillOut(BaseModel):
    id: UUID
    name: str | None
    amount: Decimal | None
    next_due_date: date | None
    category: str | None
    is_paid: bool
    hidden_overdue: bool


@router.get("/upcoming-bills", response_model=list[UpcomingBillOut])
async def upcoming_bills(
    days: int = Query(default=14, ge=1, le=90),
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Unpaid bills with a next due date within the next `days` days (inclusive of today)."""
    if current_user.household_id:
        member_result = await db.execute(
            select(User.id).where(User.household_id == current_user.household_id)
        )
        household_member_ids = [row[0] for row in member_result.all()]
        query = select(Bill).where(Bill.user_id.in_(household_member_ids))
    else:
        query = select(Bill).where(Bill.user_id == current_user.id)

    query = query.where(
        Bill.is_active.is_(True),
        Bill.is_paid.is_(False),
    ).options(selectinload(Bill.assigned_member))

    result = await db.execute(query)
    bills = list(result.scalars().all())
    member_count = await _get_household_member_count(db, current_user.household_id)

    today = date.today()
    horizon = today + timedelta(days=days)
    rows: list[UpcomingBillOut] = []

    for bill in bills:
        nd = _compute_next_due_date(bill)
        if nd is None or nd > horizon:
            continue
        br = _bill_to_response(bill, current_user.id, member_count)
        rows.append(
            UpcomingBillOut(
                id=bill.id,
                name=br.name,
                amount=br.amount,
                next_due_date=nd,
                category=br.category,
                is_paid=bool(bill.is_paid),
                hidden_overdue=bool(bill.hidden_overdue),
            )
        )

    rows.sort(key=lambda r: (r.next_due_date or today, r.name or ""))
    return rows[:limit]
