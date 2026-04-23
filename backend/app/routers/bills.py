import json
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.bill import Bill
from app.models.bill_history import BillHistory
from app.models.bill_member_payment import BillMemberPayment
from app.models.transaction import Payment
from app.models.user import User
from app.schemas.bill import (
    BillBreakdownResponse,
    BillCreate,
    BillHistoryEntry,
    BillHistoryResponse,
    BillPayRequest,
    BillPostponeRequest,
    BillResponse,
    BillUpdate,
    MemberPaymentRequest,
    MemberShareResponse,
)
from app.services.household_billing import get_bill_breakdown
from app.services.household_service import log_activity, resolve_valid_household_id
from app.utils.budget import resolve_budget_id, validate_budget_ownership
from app.utils.security import get_current_user

router = APIRouter(prefix="/bills", tags=["Bills"])


async def _get_household_member_count(db: AsyncSession, household_id: UUID | None) -> int:
    """Return the number of members in the household, or 1 if no household."""
    if not household_id:
        return 1
    result = await db.execute(
        select(func.count()).select_from(User).where(User.household_id == household_id)
    )
    count = result.scalar() or 1
    return max(count, 1)

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _compute_next_due_date(bill: Bill) -> date | None:
    """Compute the next due date for a bill based on its frequency."""
    today = date.today()
    freq = bill.frequency or "monthly"

    if freq == "one_time":
        if bill.start_date:
            return bill.start_date if bill.start_date >= today else None
        return None

    if freq in ("weekly", "biweekly"):
        dow = bill.day_of_week
        if dow is None:
            return None
        # Find next occurrence of this day-of-week
        days_ahead = dow - today.weekday()
        if days_ahead < 0:
            days_ahead += 7
        next_date = today + timedelta(days=days_ahead)

        if freq == "biweekly" and bill.start_date:
            # Ensure we're on the correct biweekly cadence
            anchor = bill.start_date
            delta_days = (next_date - anchor).days
            weeks_diff = delta_days // 7
            if weeks_diff % 2 != 0:
                next_date += timedelta(days=7)
        return next_date

    if freq == "monthly":
        due_day = bill.due_day or 1
        try:
            candidate = today.replace(day=min(due_day, 28))
        except ValueError:
            candidate = today.replace(day=28)
        if candidate < today:
            month = candidate.month + 1
            year = candidate.year
            if month > 12:
                month = 1
                year += 1
            try:
                candidate = candidate.replace(year=year, month=month, day=min(due_day, 28))
            except ValueError:
                candidate = candidate.replace(year=year, month=month, day=28)
        return candidate

    if freq == "quarterly":
        due_day = bill.due_day or 1
        current_quarter_month = ((today.month - 1) // 3) * 3 + 1
        for offset in [0, 3, 6, 9]:
            m = current_quarter_month + offset
            y = today.year
            if m > 12:
                m -= 12
                y += 1
            try:
                candidate = date(y, m, min(due_day, 28))
            except ValueError:
                candidate = date(y, m, 28)
            if candidate >= today:
                return candidate
        return None

    if freq in ("annual", "yearly"):
        due_day = bill.due_day or 1
        if bill.start_date:
            m = bill.start_date.month
        else:
            m = today.month
        try:
            candidate = date(today.year, m, min(due_day, 28))
        except ValueError:
            candidate = date(today.year, m, 28)
        if candidate < today:
            try:
                candidate = date(today.year + 1, m, min(due_day, 28))
            except ValueError:
                candidate = date(today.year + 1, m, 28)
        return candidate

    return None


def _bill_to_response(
    bill: Bill,
    current_user_id: UUID | None = None,
    household_member_count: int = 1,
) -> BillResponse:
    """Convert a Bill ORM object to BillResponse with computed user share."""
    assigned_name = None
    if bill.assigned_member_id and bill.assigned_member:
        m = bill.assigned_member
        assigned_name = f"{m.first_name or ''} {m.last_name or ''}".strip() or m.email

    amount = bill.amount or 0
    is_household = bill.household_id is not None
    member_count = household_member_count if is_household else 1

    # Compute user_share and is_user_responsible
    if bill.payment_mode == "split" and is_household and member_count > 0:
        from decimal import Decimal, ROUND_HALF_UP
        user_share = (Decimal(str(amount)) / member_count).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        is_user_responsible = True
    elif is_household and current_user_id:
        # Single-pay household bill or no payment_mode set
        if bill.assigned_member_id:
            is_user_responsible = bill.assigned_member_id == current_user_id
        else:
            is_user_responsible = bill.user_id == current_user_id
        from decimal import Decimal
        user_share = amount if is_user_responsible else Decimal("0")
    else:
        user_share = amount
        is_user_responsible = True

    return BillResponse(
        id=bill.id,
        user_id=bill.user_id,
        household_id=bill.household_id,
        name=bill.name,
        amount=bill.amount,
        due_day=bill.due_day,
        frequency=bill.frequency,
        category=bill.category,
        auto_pay=bill.auto_pay,
        reminder_days=bill.reminder_days,
        is_paid=bill.is_paid,
        paid_date=bill.paid_date,
        paid_amount=bill.paid_amount,
        is_active=bill.is_active,
        is_tax_deductible=bill.is_tax_deductible,
        tax_category=bill.tax_category,
        hidden_overdue=bill.hidden_overdue,
        payment_mode=bill.payment_mode,
        assigned_member_id=bill.assigned_member_id,
        assigned_member_name=assigned_name,
        day_of_week=bill.day_of_week,
        start_date=bill.start_date,
        next_due_date=_compute_next_due_date(bill),
        created_at=bill.created_at,
        updated_at=bill.updated_at,
        budget_id=bill.budget_id,
        is_household_bill=is_household,
        user_share=user_share,
        is_user_responsible=is_user_responsible,
        member_count=member_count if is_household else None,
    )


async def log_bill_action(db: AsyncSession, bill_id, bill_name, user_id, action_type, details=None):
    entry = BillHistory(
        bill_id=bill_id,
        bill_name=bill_name,
        user_id=user_id,
        action_type=action_type,
        details=json.dumps(details) if details else None,
    )
    db.add(entry)


@router.post("", response_model=BillResponse, status_code=status.HTTP_201_CREATED)
async def create_bill(
    data: BillCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    effective_household_id = await resolve_valid_household_id(db, current_user)
    budget_id = await resolve_budget_id(current_user, db, data.budget_id)
    try:
        bill = Bill(
            user_id=current_user.id,
            household_id=effective_household_id,
            name=data.name,
            amount=data.amount,
            due_day=data.due_day,
            frequency=data.frequency,
            category=data.category,
            auto_pay=data.auto_pay if data.auto_pay is not None else False,
            reminder_days=data.reminder_days if data.reminder_days is not None else 3,
            payment_mode=data.payment_mode,
            assigned_member_id=data.assigned_member_id,
            day_of_week=data.day_of_week,
            start_date=data.start_date,
            is_tax_deductible=data.is_tax_deductible,
            tax_category=data.tax_category,
            budget_id=budget_id,
        )
        db.add(bill)
        await db.flush()
        await db.refresh(bill)
        # Eagerly load assigned_member for response
        if bill.assigned_member_id:
            result = await db.execute(
                select(Bill).where(Bill.id == bill.id).options(selectinload(Bill.assigned_member))
            )
            bill = result.scalar_one()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not create bill: {exc}",
        )

    await log_bill_action(
        db, bill.id, bill.name, current_user.id, "created",
        {"amount": str(bill.amount)} if bill.amount else None,
    )

    if effective_household_id:
        try:
            await log_activity(
                household_id=effective_household_id,
                user_id=current_user.id,
                action="created",
                entity_type="bill",
                entity_name=bill.name or "Untitled",
                details=f"${bill.amount}" if bill.amount else None,
                db=db,
            )
        except Exception:
            pass

    member_count = await _get_household_member_count(db, effective_household_id)
    return _bill_to_response(bill, current_user.id, member_count)


BILL_SORT_FIELDS = {"name", "amount", "due_date", "category", "created_at"}


@router.get("", response_model=list[BillResponse])
async def list_bills(
    active_only: bool = True,
    status: str | None = Query(default=None, pattern="^(paid|unpaid)$"),
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    budget_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.household_id:
        # Get ALL user IDs in the household
        member_result = await db.execute(
            select(User.id).where(User.household_id == current_user.household_id)
        )
        household_member_ids = [row[0] for row in member_result.all()]
        query = select(Bill).where(Bill.user_id.in_(household_member_ids))
    else:
        query = select(Bill).where(Bill.user_id == current_user.id)
    if budget_id is not None:
        query = query.where(Bill.budget_id == budget_id)
    if active_only:
        query = query.where(Bill.is_active.is_(True))
    if status == "paid":
        query = query.where(Bill.is_paid.is_(True))
    elif status == "unpaid":
        query = query.where(Bill.is_paid.is_(False))
    query = query.options(selectinload(Bill.assigned_member))

    # Apply sorting
    if sort_by not in BILL_SORT_FIELDS:
        sort_by = "created_at"

    if sort_by == "due_date":
        # Sort in Python by computed next_due_date (calendar-correct)
        result = await db.execute(query.order_by(Bill.created_at.desc()))
        bills = result.scalars().all()
        member_count = await _get_household_member_count(db, current_user.household_id)
        responses = [_bill_to_response(b, current_user.id, member_count) for b in bills]
        far_future = date(9999, 12, 31)
        responses.sort(
            key=lambda r: r.next_due_date or far_future,
            reverse=(sort_order == "desc"),
        )
        return responses

    sort_col = getattr(Bill, sort_by, Bill.created_at)
    query = query.order_by(sort_col.desc() if sort_order == "desc" else sort_col.asc())
    result = await db.execute(query)
    bills = result.scalars().all()
    member_count = await _get_household_member_count(db, current_user.household_id)
    return [_bill_to_response(b, current_user.id, member_count) for b in bills]


@router.get("/history", response_model=BillHistoryResponse)
async def get_bill_history(
    filter: str = Query(default="all", pattern="^(all|payments|changes)$"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Get visible bill user IDs (same household logic)
    if current_user.household_id:
        member_result = await db.execute(
            select(User.id).where(User.household_id == current_user.household_id)
        )
        visible_user_ids = [row[0] for row in member_result.all()]
    else:
        visible_user_ids = [current_user.id]

    query = select(BillHistory).where(BillHistory.user_id.in_(visible_user_ids))

    if filter == "payments":
        query = query.where(
            BillHistory.action_type.in_(["payment_recorded", "payment_undone"])
        )
    elif filter == "changes":
        query = query.where(
            BillHistory.action_type.in_(["created", "updated", "deleted"])
        )

    # Get total count
    count_query = select(func.count()).select_from(
        query.subquery()
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Paginate and fetch
    query = query.order_by(BillHistory.created_at.desc())
    query = query.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    entries = result.scalars().all()

    # Fetch user names
    user_ids = list({e.user_id for e in entries})
    if user_ids:
        users_result = await db.execute(
            select(User.id, User.first_name, User.email).where(User.id.in_(user_ids))
        )
        user_map = {
            row[0]: row[1] or row[2] for row in users_result.all()
        }
    else:
        user_map = {}

    return BillHistoryResponse(
        entries=[
            BillHistoryEntry(
                id=e.id,
                bill_id=e.bill_id,
                bill_name=e.bill_name,
                user_name=user_map.get(e.user_id, "Unknown"),
                action_type=e.action_type,
                details=e.details,
                created_at=e.created_at,
            )
            for e in entries
        ],
        total=total,
        page=page,
    )


@router.get("/{bill_id}", response_model=BillResponse)
async def get_bill(
    bill_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id).options(selectinload(Bill.assigned_member))
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")
    # Verify access: own bill or same household
    if bill.user_id != current_user.id and (
        not current_user.household_id or bill.household_id != current_user.household_id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")
    member_count = await _get_household_member_count(db, current_user.household_id)
    return _bill_to_response(bill, current_user.id, member_count)


@router.get("/{bill_id}/breakdown", response_model=BillBreakdownResponse)
async def get_bill_breakdown_endpoint(
    bill_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id).options(selectinload(Bill.assigned_member))
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    # Verify access
    if bill.user_id != current_user.id and (
        not current_user.household_id or bill.household_id != current_user.household_id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    if not bill.household_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bill is not a household bill",
        )

    breakdown = await get_bill_breakdown(bill, db)
    member_count = await _get_household_member_count(db, current_user.household_id)

    return BillBreakdownResponse(
        bill=_bill_to_response(bill, current_user.id, member_count),
        total_paid=breakdown["total_paid"],
        total_remaining=breakdown["total_remaining"],
        members=[MemberShareResponse(**m) for m in breakdown["members"]],
    )


@router.post("/{bill_id}/member-payment", response_model=BillBreakdownResponse)
async def create_member_payment(
    bill_id: UUID,
    data: MemberPaymentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id).options(selectinload(Bill.assigned_member))
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    # Verify access
    if bill.user_id != current_user.id and (
        not current_user.household_id or bill.household_id != current_user.household_id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    if not bill.household_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bill is not a household bill",
        )

    # Determine paying member — default to current user
    member_id = data.member_id if data.member_id else current_user.id

    # Validate member is in the same household
    member_result = await db.execute(
        select(User).where(User.id == member_id)
    )
    member = member_result.scalar_one_or_none()
    if not member or member.household_id != bill.household_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Member is not in the same household as the bill",
        )

    payment = BillMemberPayment(
        bill_id=bill.id,
        member_id=member_id,
        amount_paid=data.amount_paid,
        paid_at=data.paid_at if data.paid_at else datetime.now(timezone.utc),
    )
    db.add(payment)
    await db.flush()

    # Log activity
    try:
        await log_activity(
            household_id=bill.household_id,
            user_id=current_user.id,
            action="paid",
            entity_type="bill",
            entity_name=bill.name or "Untitled",
            details=f"${data.amount_paid} by {member.first_name}",
            db=db,
        )
    except Exception:
        pass

    breakdown = await get_bill_breakdown(bill, db)
    member_count = await _get_household_member_count(db, current_user.household_id)

    return BillBreakdownResponse(
        bill=_bill_to_response(bill, current_user.id, member_count),
        total_paid=breakdown["total_paid"],
        total_remaining=breakdown["total_remaining"],
        members=[MemberShareResponse(**m) for m in breakdown["members"]],
    )


@router.put("/{bill_id}", response_model=BillResponse)
async def update_bill(
    bill_id: UUID,
    data: BillUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Allow editing if user owns the bill OR is in the same household
    if current_user.household_id:
        result = await db.execute(
            select(Bill).where(
                Bill.id == bill_id,
                or_(
                    Bill.user_id == current_user.id,
                    Bill.household_id == current_user.household_id,
                ),
            ).options(selectinload(Bill.assigned_member))
        )
    else:
        result = await db.execute(
            select(Bill).where(
                Bill.id == bill_id,
                Bill.user_id == current_user.id,
            ).options(selectinload(Bill.assigned_member))
        )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    update_data = data.model_dump(exclude_unset=True)

    # Capture old values for history logging
    old_values = {k: getattr(bill, k) for k in update_data}

    # Validate budget ownership if changing budget_id
    if "budget_id" in update_data and update_data["budget_id"] is not None:
        await validate_budget_ownership(current_user, db, update_data["budget_id"])

    # Validate assigned_member_id belongs to the same household
    if "assigned_member_id" in update_data and update_data["assigned_member_id"] is not None:
        member_result = await db.execute(
            select(User).where(User.id == update_data["assigned_member_id"])
        )
        member = member_result.scalar_one_or_none()
        if not member or (
            current_user.household_id and member.household_id != current_user.household_id
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assigned member must belong to the same household",
            )

    for field, value in update_data.items():
        setattr(bill, field, value)

    await db.flush()
    # Re-fetch with eager loading for assigned_member
    result = await db.execute(
        select(Bill).where(Bill.id == bill.id).options(selectinload(Bill.assigned_member))
    )
    bill = result.scalar_one()

    # Log changes to bill history
    changes = {}
    for k, old_val in old_values.items():
        new_val = update_data[k]
        old_str = str(old_val) if old_val is not None else None
        new_str = str(new_val) if new_val is not None else None
        if old_str != new_str:
            changes[k] = {"from": old_str, "to": new_str}
    if changes:
        await log_bill_action(
            db, bill.id, bill.name, current_user.id, "updated", changes,
        )

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="updated",
                entity_type="bill",
                entity_name=bill.name or "Untitled",
                details=None,
                db=db,
            )
        except Exception:
            pass

    member_count = await _get_household_member_count(db, current_user.household_id)
    return _bill_to_response(bill, current_user.id, member_count)


@router.delete("/{bill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bill(
    bill_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.household_id:
        result = await db.execute(
            select(Bill).where(
                Bill.id == bill_id,
                or_(
                    Bill.user_id == current_user.id,
                    Bill.household_id == current_user.household_id,
                ),
            )
        )
    else:
        result = await db.execute(
            select(Bill).where(Bill.id == bill_id, Bill.user_id == current_user.id)
        )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    bill_name = bill.name
    bill.is_active = False
    await db.flush()

    await log_bill_action(
        db, bill.id, bill_name, current_user.id, "deleted",
        {"name": bill_name},
    )

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="deleted",
                entity_type="bill",
                entity_name=bill_name or "Untitled",
                details=None,
                db=db,
            )
        except Exception:
            pass


@router.patch("/{bill_id}/pay", response_model=BillResponse)
async def pay_bill(
    bill_id: UUID,
    data: BillPayRequest | None = None,
    source: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.household_id:
        result = await db.execute(
            select(Bill).where(
                Bill.id == bill_id,
                or_(
                    Bill.user_id == current_user.id,
                    Bill.household_id == current_user.household_id,
                ),
            ).options(selectinload(Bill.assigned_member))
        )
    else:
        result = await db.execute(
            select(Bill).where(Bill.id == bill_id, Bill.user_id == current_user.id)
                .options(selectinload(Bill.assigned_member))
        )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    bill.is_paid = True
    bill.paid_date = (data.paid_date if data and data.paid_date else datetime.now(timezone.utc))
    bill.paid_amount = (data.paid_amount if data and data.paid_amount else bill.amount)

    await db.flush()
    await db.refresh(bill)

    await log_bill_action(
        db, bill.id, bill.name, current_user.id, "payment_recorded",
        {"amount": str(bill.paid_amount)},
    )

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="paid",
                entity_type="bill",
                entity_name=bill.name or "Untitled",
                details=f"${bill.paid_amount}",
                db=db,
            )
        except Exception:
            pass

    # Auto-log payment record
    try:
        auto_payment = Payment(
            user_id=current_user.id,
            bill_id=bill.id,
            amount=bill.paid_amount or bill.amount,
            paid_date=bill.paid_date or datetime.now(timezone.utc),
            source=source or "bills_page",
            auto_logged=True,
        )
        db.add(auto_payment)
        await db.flush()
    except Exception:
        pass

    member_count = await _get_household_member_count(db, current_user.household_id)
    return _bill_to_response(bill, current_user.id, member_count)


@router.patch("/{bill_id}/hide-overdue", response_model=BillResponse)
async def hide_overdue_bill(
    bill_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Hide an overdue bill from the dashboard assigned items list."""
    if current_user.household_id:
        result = await db.execute(
            select(Bill).where(
                Bill.id == bill_id,
                or_(
                    Bill.user_id == current_user.id,
                    Bill.household_id == current_user.household_id,
                ),
            ).options(selectinload(Bill.assigned_member))
        )
    else:
        result = await db.execute(
            select(Bill).where(Bill.id == bill_id, Bill.user_id == current_user.id)
                .options(selectinload(Bill.assigned_member))
        )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    bill.hidden_overdue = True
    await db.flush()
    await db.refresh(bill)

    member_count = await _get_household_member_count(db, current_user.household_id)
    return _bill_to_response(bill, current_user.id, member_count)


@router.patch("/{bill_id}/unhide-overdue", response_model=BillResponse)
async def unhide_overdue_bill(
    bill_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Unhide a previously hidden overdue bill."""
    if current_user.household_id:
        result = await db.execute(
            select(Bill).where(
                Bill.id == bill_id,
                or_(
                    Bill.user_id == current_user.id,
                    Bill.household_id == current_user.household_id,
                ),
            ).options(selectinload(Bill.assigned_member))
        )
    else:
        result = await db.execute(
            select(Bill).where(Bill.id == bill_id, Bill.user_id == current_user.id)
                .options(selectinload(Bill.assigned_member))
        )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    bill.hidden_overdue = False
    await db.flush()
    await db.refresh(bill)

    member_count = await _get_household_member_count(db, current_user.household_id)
    return _bill_to_response(bill, current_user.id, member_count)


@router.patch("/{bill_id}/unpay", response_model=BillResponse)
async def unpay_bill(
    bill_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.household_id:
        result = await db.execute(
            select(Bill).where(
                Bill.id == bill_id,
                or_(
                    Bill.user_id == current_user.id,
                    Bill.household_id == current_user.household_id,
                ),
            ).options(selectinload(Bill.assigned_member))
        )
    else:
        result = await db.execute(
            select(Bill).where(Bill.id == bill_id, Bill.user_id == current_user.id)
                .options(selectinload(Bill.assigned_member))
        )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    bill.is_paid = False
    bill.paid_date = None
    bill.paid_amount = None

    await db.flush()
    await db.refresh(bill)

    await log_bill_action(
        db, bill.id, bill.name, current_user.id, "payment_undone", None,
    )

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="unpaid",
                entity_type="bill",
                entity_name=bill.name or "Untitled",
                details=None,
                db=db,
            )
        except Exception:
            pass

    # Remove auto-logged payment record for this bill
    try:
        auto_result = await db.execute(
            select(Payment).where(
                Payment.bill_id == bill.id,
                Payment.user_id == current_user.id,
                Payment.auto_logged.is_(True),
            )
        )
        for auto_pay in auto_result.scalars().all():
            await db.delete(auto_pay)
        await db.flush()
    except Exception:
        pass

    member_count = await _get_household_member_count(db, current_user.household_id)
    return _bill_to_response(bill, current_user.id, member_count)


@router.patch("/{bill_id}/postpone", response_model=BillResponse)
async def postpone_bill(
    bill_id: UUID,
    body: BillPostponeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.household_id:
        result = await db.execute(
            select(Bill).where(
                Bill.id == bill_id,
                or_(
                    Bill.user_id == current_user.id,
                    Bill.household_id == current_user.household_id,
                ),
            ).options(selectinload(Bill.assigned_member))
        )
    else:
        result = await db.execute(
            select(Bill).where(Bill.id == bill_id, Bill.user_id == current_user.id)
                .options(selectinload(Bill.assigned_member))
        )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    bill.postpone_until = body.postpone_until
    await db.flush()
    await db.refresh(bill)

    action = "postponed" if body.postpone_until else "postpone_cleared"
    detail_str = str(body.postpone_until) if body.postpone_until else None
    await log_bill_action(db, bill.id, bill.name, current_user.id, action, detail_str)

    member_count = await _get_household_member_count(db, current_user.household_id)
    return _bill_to_response(bill, current_user.id, member_count)
