import json
import calendar
import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.bill import Bill
from app.models.bill_cycle_payment import BillCyclePayment
from app.models.bill_history import BillHistory
from app.models.bill_member_payment import BillMemberPayment
from app.models.paycheck_checklist import PaycheckChecklist
from app.models.transaction import Payment
from app.models.user import User
from app.schemas.bill import (
    BillBreakdownResponse,
    BillCreate,
    BillCycleGroup,
    BillCycleGroupsResponse,
    BillHistoryEntry,
    BillHistoryResponse,
    BillPayRequest,
    BillPostponeRequest,
    BillResponse,
    BillUpdate,
    HouseholdBillBreakdownsResponse,
    MemberPaymentRequest,
    MemberShareResponse,
)
from app.services.bill_cycles import (
    auto_generate_missing_cycle_rows,
    auto_generate_missing_cycle_rows_for_window,
    cycle_window_start,
    ensure_pending_cycle_row,
    get_cycle_payments,
    get_cycle_payments_for_month,
    local_today,
    mark_bill_cycle_paid,
    mark_bill_cycle_unpaid,
    next_due_date_after_bill,
    next_due_date_for_bill,
    occurrence_dates_for_bill,
    uses_global_paid_state,
)
from app.services.household_billing import batch_household_breakdown_dicts, get_bill_breakdown
from app.services.household_service import log_activity, resolve_valid_household_id
from app.utils.budget import apply_household_budget_filter, resolve_budget_id, validate_budget_ownership
from app.utils.security import get_current_user

logger = logging.getLogger(__name__)

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


def _compute_next_due_date(bill: Bill, today: date | None = None) -> date | None:
    """Compute the next due date for a bill based on its frequency."""
    return next_due_date_for_bill(bill, today)


def _bill_to_response(
    bill: Bill,
    current_user_id: UUID | None = None,
    household_member_count: int = 1,
    occurrence_due_date: date | None = None,
    cycle_payment: BillCyclePayment | None = None,
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

    cycle_due_date = occurrence_due_date or _compute_next_due_date(bill)
    legacy_is_paid = uses_global_paid_state(bill) and bool(getattr(bill, "is_paid", False))
    cycle_is_paid = bool(cycle_payment and cycle_payment.is_paid) or (
        cycle_payment is None and legacy_is_paid
    )
    next_due_date = cycle_due_date
    if cycle_is_paid and cycle_due_date is not None:
        # Once the current occurrence is paid, the list should advance to the
        # next scheduled occurrence instead of keeping the paid cycle's past
        # due date as the "next" due date.
        next_due_date = next_due_date_after_bill(bill, cycle_due_date)

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
        is_paid=cycle_is_paid,
        paid_date=(
            cycle_payment.paid_date
            if cycle_payment and cycle_is_paid
            else getattr(bill, "paid_date", None) if cycle_is_paid else None
        ),
        paid_amount=(
            cycle_payment.amount_paid
            if cycle_payment and cycle_is_paid
            else getattr(bill, "paid_amount", None) if cycle_is_paid else None
        ),
        is_active=bill.is_active,
        is_tax_deductible=bill.is_tax_deductible,
        tax_category=bill.tax_category,
        hidden_overdue=bill.hidden_overdue,
        payment_mode=bill.payment_mode,
        assigned_member_id=bill.assigned_member_id,
        assigned_member_name=assigned_name,
        day_of_week=bill.day_of_week,
        start_date=bill.start_date,
        next_due_date=next_due_date,
        created_at=bill.created_at,
        updated_at=bill.updated_at,
        budget_id=bill.budget_id,
        is_household_bill=is_household,
        user_share=user_share,
        is_user_responsible=is_user_responsible,
        member_count=member_count if is_household else None,
        occurrence_due_date=cycle_due_date,
        cycle_paid_date=(
            cycle_payment.paid_date
            if cycle_payment and cycle_is_paid
            else getattr(bill, "paid_date", None) if cycle_is_paid else None
        ),
        cycle_paid_amount=(
            cycle_payment.amount_paid
            if cycle_payment and cycle_is_paid
            else getattr(bill, "paid_amount", None) if cycle_is_paid else None
        ),
        cycle_amount_due=cycle_payment.amount_due if cycle_payment else amount,
        cycle_source=(
            cycle_payment.source
            if cycle_payment
            else "legacy_bill_status" if cycle_is_paid else None
        ),
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


def _select_bill_cycle_payment(
    today: date,
    cycle_payments: list[BillCyclePayment],
) -> BillCyclePayment | None:
    """Pick the single cycle row the Bills list should represent for this month."""
    if not cycle_payments:
        return None

    ordered = sorted(cycle_payments, key=lambda row: row.due_date)
    latest_row = ordered[-1]
    if latest_row.is_paid:
        # If the most recent occurrence in the current month is already paid,
        # represent the bill by that paid row so the response can advance to
        # the next scheduled occurrence instead of surfacing an older overdue
        # unpaid row from earlier in the month.
        return latest_row

    overdue_unpaid = [row for row in ordered if row.due_date < today and not row.is_paid]
    if overdue_unpaid:
        return overdue_unpaid[0]

    upcoming_unpaid = [row for row in ordered if row.due_date >= today and not row.is_paid]
    if upcoming_unpaid:
        return upcoming_unpaid[0]

    paid_rows = [row for row in ordered if row.is_paid]
    if paid_rows:
        return paid_rows[-1]

    return ordered[0]


def _select_legacy_paid_due_date(
    today: date,
    bill: Bill,
    cycle_payments: list[BillCyclePayment],
) -> date | None:
    """Map legacy global bill paid state onto the most likely current-cycle due date."""
    if not uses_global_paid_state(bill):
        return None
    if not bool(getattr(bill, "is_paid", False)):
        return None
    if cycle_payments:
        return None

    raw_paid_at = getattr(bill, "paid_date", None)
    paid_on = raw_paid_at.date() if isinstance(raw_paid_at, datetime) else raw_paid_at

    period_start = today.replace(day=1)
    period_end = date(today.year, today.month, calendar.monthrange(today.year, today.month)[1])
    dates = occurrence_dates_for_bill(bill, period_start, period_end)
    if not dates:
        return None
    if isinstance(paid_on, date):
        on_or_before = [due for due in dates if due <= paid_on]
        if on_or_before:
            return on_or_before[-1]
        on_or_after = [due for due in dates if due >= paid_on]
        if on_or_after:
            return on_or_after[0]
    due_so_far = [due for due in dates if due <= today]
    return due_so_far[-1] if due_so_far else dates[0]


def _legacy_paid_due_dates_for_current_month(
    today: date,
    bills: list[Bill],
    cycle_payments: dict[tuple[UUID, date], BillCyclePayment],
) -> dict[UUID, date]:
    """Map legacy Bill.is_paid state onto one current-month occurrence per bill."""
    current_month_payments_by_bill: dict[UUID, list[BillCyclePayment]] = {}
    for (bill_id, due_date), payment in cycle_payments.items():
        if due_date.year == today.year and due_date.month == today.month:
            current_month_payments_by_bill.setdefault(bill_id, []).append(payment)

    out: dict[UUID, date] = {}
    for bill in bills:
        legacy_paid_due_date = _select_legacy_paid_due_date(
            today,
            bill,
            current_month_payments_by_bill.get(bill.id, []),
        )
        if legacy_paid_due_date is not None:
            out[bill.id] = legacy_paid_due_date
    return out


async def _bill_responses_for_current_cycle(
    db: AsyncSession,
    bills: list[Bill],
    current_user: User,
) -> list[BillResponse]:
    member_count = await _get_household_member_count(db, current_user.household_id)
    today = local_today(current_user)
    cycle_year, cycle_month = today.year, today.month

    await auto_generate_missing_cycle_rows(db, bills, current_user, cycle_year, cycle_month)

    bill_ids = [b.id for b in bills]
    payments_by_key = await get_cycle_payments_for_month(
        db, bill_ids, cycle_year, cycle_month
    )
    month_payments_by_bill: dict[UUID, list[BillCyclePayment]] = {}
    selected_payment_by_bill: dict[UUID, BillCyclePayment] = {}
    due_dates_by_bill: dict[UUID, date] = {}
    for (bill_id, _due_date), payment in payments_by_key.items():
        month_payments_by_bill.setdefault(bill_id, []).append(payment)

    for bill in bills:
        legacy_paid_due_date = _select_legacy_paid_due_date(
            today,
            bill,
            month_payments_by_bill.get(bill.id, []),
        )
        if legacy_paid_due_date is not None:
            due_dates_by_bill[bill.id] = legacy_paid_due_date
            continue

        payment = _select_bill_cycle_payment(today, month_payments_by_bill.get(bill.id, []))
        if payment is None:
            continue
        due_dates_by_bill[bill.id] = payment.due_date
        selected_payment_by_bill[bill.id] = payment

    for bill in bills:
        if bill.id in due_dates_by_bill:
            continue
        due_date = _compute_next_due_date(bill, today)
        if due_date:
            due_dates_by_bill[bill.id] = due_date

    return [
        _bill_to_response(
            bill,
            current_user.id,
            member_count,
            occurrence_due_date=due_dates_by_bill.get(bill.id),
            cycle_payment=selected_payment_by_bill.get(bill.id),
        )
        for bill in bills
    ]


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
    query = apply_household_budget_filter(query, Bill, current_user, budget_id)
    if active_only:
        query = query.where(Bill.is_active.is_(True))
    query = query.options(selectinload(Bill.assigned_member))

    # Apply sorting
    if sort_by not in BILL_SORT_FIELDS:
        sort_by = "created_at"

    if sort_by == "due_date":
        # Sort in Python by computed next_due_date (calendar-correct)
        result = await db.execute(query.order_by(Bill.created_at.desc()))
        bills = result.scalars().all()
        responses = await _bill_responses_for_current_cycle(db, list(bills), current_user)
        if status == "paid":
            responses = [r for r in responses if r.is_paid]
        elif status == "unpaid":
            responses = [r for r in responses if not r.is_paid]
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
    responses = await _bill_responses_for_current_cycle(db, list(bills), current_user)
    if status == "paid":
        responses = [r for r in responses if r.is_paid]
    elif status == "unpaid":
        responses = [r for r in responses if not r.is_paid]
    return responses


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


@router.get("/household-breakdowns", response_model=HouseholdBillBreakdownsResponse)
async def list_household_bill_breakdowns(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """All active household-scoped bill breakdowns in one round trip (replaces N /breakdown calls)."""
    if not current_user.household_id:
        return HouseholdBillBreakdownsResponse(breakdowns={})

    hid = current_user.household_id
    result = await db.execute(
        select(Bill)
        .where(
            Bill.household_id == hid,
            Bill.is_active.is_(True),
        )
        .options(selectinload(Bill.assigned_member))
    )
    bills = list(result.scalars().all())
    if not bills:
        return HouseholdBillBreakdownsResponse(breakdowns={})

    member_count = await _get_household_member_count(db, hid)
    raw_by_id = await batch_household_breakdown_dicts(bills, hid, db)

    out: dict[str, BillBreakdownResponse] = {}
    for bill in bills:
        try:
            raw = raw_by_id.get(bill.id)
            if not raw:
                continue
            out[str(bill.id)] = BillBreakdownResponse(
                bill=_bill_to_response(bill, current_user.id, member_count),
                total_paid=raw["total_paid"],
                total_remaining=raw["total_remaining"],
                members=[MemberShareResponse(**m) for m in raw["members"]],
            )
        except Exception:
            logger.exception("household-breakdowns: skip bill %s", bill.id)
            continue

    return HouseholdBillBreakdownsResponse(breakdowns=out)


@router.get("/cycles", response_model=BillCycleGroupsResponse)
async def list_bill_cycles(
    months: int = Query(default=6, ge=1, le=24),
    status: str | None = Query(default=None, pattern="^(paid|unpaid)$"),
    budget_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Future bill occurrences grouped by cycle month.

    The recurring bill row is the template; each item in this response is a
    specific upcoming due date with its own paid state.
    """
    today = local_today(current_user)
    window_start = cycle_window_start(today)
    end_month = today.month - 1 + months
    end_date = date(today.year + end_month // 12, end_month % 12 + 1, 1) - timedelta(days=1)

    if current_user.household_id:
        member_result = await db.execute(
            select(User.id).where(User.household_id == current_user.household_id)
        )
        household_member_ids = [row[0] for row in member_result.all()]
        query = select(Bill).where(Bill.user_id.in_(household_member_ids))
    else:
        query = select(Bill).where(Bill.user_id == current_user.id)
    query = apply_household_budget_filter(query, Bill, current_user, budget_id)
    query = query.where(Bill.is_active.is_(True)).options(selectinload(Bill.assigned_member))

    result = await db.execute(query)
    bills = list(result.scalars().all())

    member_count = await _get_household_member_count(db, current_user.household_id)
    await auto_generate_missing_cycle_rows_for_window(
        db, bills, current_user, window_start, end_date
    )

    bill_ids = [b.id for b in bills]
    bill_by_id = {b.id: b for b in bills}
    payments = await get_cycle_payments(db, bill_ids, window_start, end_date)
    legacy_paid_due_dates = _legacy_paid_due_dates_for_current_month(
        today,
        bills,
        payments,
    )

    grouped: dict[tuple[int, int], list[BillResponse]] = {}
    seen: set[tuple[UUID, date]] = set()
    for (bill_id, due_date), payment in sorted(
        payments.items(), key=lambda item: (item[0][1], item[0][0])
    ):
        bill = bill_by_id.get(bill_id)
        if not bill:
            continue
        key = (bill_id, due_date)
        if key in seen:
            continue
        seen.add(key)
        response = _bill_to_response(
            bill,
            current_user.id,
            member_count,
            occurrence_due_date=due_date,
            cycle_payment=payment,
        )
        if status == "paid" and not response.is_paid:
            continue
        if status == "unpaid" and response.is_paid:
            continue
        grouped.setdefault((payment.cycle_year, payment.cycle_month), []).append(response)

    for bill in bills:
        for due_date in occurrence_dates_for_bill(bill, window_start, end_date):
            key = (bill.id, due_date)
            if key in seen:
                continue
            seen.add(key)
            if legacy_paid_due_dates.get(bill.id) == due_date:
                payment = None
            else:
                payment = await ensure_pending_cycle_row(db, bill, current_user, due_date)
            response = _bill_to_response(
                bill,
                current_user.id,
                member_count,
                occurrence_due_date=due_date,
                cycle_payment=payment,
            )
            if status == "paid" and not response.is_paid:
                continue
            if status == "unpaid" and response.is_paid:
                continue
            grouped.setdefault((due_date.year, due_date.month), []).append(response)

    groups: list[BillCycleGroup] = []
    for (year, month), responses in sorted(grouped.items()):
        period_start = date(year, month, 1)
        period_end = date(year, month, calendar.monthrange(year, month)[1])
        responses.sort(key=lambda b: (b.occurrence_due_date or period_end, b.name or ""))
        total_due = sum((Decimal(str(b.user_share or b.amount or 0)) for b in responses), Decimal("0"))
        total_paid = sum(
            (Decimal(str(b.user_share or b.amount or 0)) for b in responses if b.is_paid),
            Decimal("0"),
        )
        groups.append(
            BillCycleGroup(
                label=period_start.strftime("%B %Y"),
                period_start=period_start,
                period_end=period_end,
                total_due=total_due,
                total_paid=total_paid,
                item_count=len(responses),
                paid_count=sum(1 for b in responses if b.is_paid),
                bills=responses,
            )
        )

    return BillCycleGroupsResponse(groups=groups)


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
    if breakdown is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bill is not a household bill",
        )
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
    if breakdown is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bill is not a household bill",
        )
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
    occurrence_due_date: date | None = Query(default=None),
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

    due_date = occurrence_due_date or (data.occurrence_due_date if data else None)
    if not due_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="occurrence_due_date is required to mark a bill cycle paid.",
        )

    cycle_payment = await mark_bill_cycle_paid(
        db=db,
        bill=bill,
        user=current_user,
        due_date=due_date,
        amount_paid=data.paid_amount if data and data.paid_amount else None,
        paid_date=data.paid_date if data and data.paid_date else None,
        source=source,
    )
    await db.refresh(bill)

    await log_bill_action(
        db, bill.id, bill.name, current_user.id, "payment_recorded",
        {"amount": str(cycle_payment.amount_paid), "due_date": str(due_date)},
    )

    if current_user.household_id:
        try:
            await log_activity(
                household_id=current_user.household_id,
                user_id=current_user.id,
                action="paid",
                entity_type="bill",
                entity_name=bill.name or "Untitled",
                details=f"${cycle_payment.amount_paid}",
                db=db,
            )
        except Exception:
            pass

    # Auto-log payment record
    try:
        auto_payment = Payment(
            user_id=current_user.id,
            bill_id=bill.id,
            amount=cycle_payment.amount_paid or bill.amount,
            paid_date=(cycle_payment.paid_date.date() if cycle_payment.paid_date else due_date),
            pay_period_date=due_date,
            source=source or "bills_page",
            auto_logged=True,
            budget_id=bill.budget_id,
        )
        db.add(auto_payment)
        await db.flush()
    except Exception:
        pass

    member_count = await _get_household_member_count(db, current_user.household_id)
    return _bill_to_response(
        bill,
        current_user.id,
        member_count,
        occurrence_due_date=due_date,
        cycle_payment=cycle_payment,
    )


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
    occurrence_due_date: date = Query(...),
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

    if occurrence_due_date is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="occurrence_due_date is required to mark a bill cycle unpaid.",
        )
    due_date = occurrence_due_date
    await mark_bill_cycle_unpaid(db, bill, due_date, current_user.id)

    # Dashboard merges paycheck checklist with plan items; stale checked rows
    # would keep showing "paid" for this user after Bills unpay clears Bill.is_paid.
    await db.execute(
        delete(PaycheckChecklist).where(
            PaycheckChecklist.item_type == "bill",
            PaycheckChecklist.item_id == bill_id,
            PaycheckChecklist.occurrence_due_date == due_date,
        )
    )

    await db.refresh(bill)

    await log_bill_action(
        db, bill.id, bill.name, current_user.id, "payment_undone", {"due_date": str(due_date)},
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
                or_(
                    Payment.pay_period_date == due_date,
                    Payment.paid_date == due_date,
                ),
            )
        )
        for auto_pay in auto_result.scalars().all():
            await db.delete(auto_pay)
        await db.flush()
    except Exception:
        pass

    member_count = await _get_household_member_count(db, current_user.household_id)
    return _bill_to_response(bill, current_user.id, member_count, occurrence_due_date=due_date)


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
