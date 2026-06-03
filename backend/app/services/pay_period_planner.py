"""Central pay-period planning: calendar, natural/effective assignment, pull-forward."""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pay_period_item_override import PayPeriodItemOverride
from app.models.paycheck_checklist import PaycheckChecklist
from app.models.user import User
from app.services.pay_period_constants import OVERRIDE_PULL_FORWARD
from app.services.paycheck_data import (
    fetch_paycheck_entries,
    fetch_scoped_bills_debts,
    fetch_widget_bills,
    get_paid_bill_map,
    get_paid_debt_ids_in_window,
    household_member_ids,
    resolve_anchor_income,
)
from app.services.bill_cycles import (
    auto_generate_missing_cycle_rows,
    auto_generate_missing_cycle_rows_for_window,
    get_cycle_payments,
    local_today,
)
from app.services.paycheck_engine import (
    assign_bills_to_paycheck,
    build_paycheck_plan,
    generate_pay_dates,
    get_pay_period_window,
    _add_months,
)


def occurrence_key(item_type: str, item_id: UUID, occurrence_due_date: date) -> str:
    return f"{item_type}:{item_id}:{occurrence_due_date.isoformat()}"


def _parse_due(item: dict) -> date:
    d = item["due_date"]
    if isinstance(d, date):
        return d
    if isinstance(d, datetime):
        return d.date()
    return date.fromisoformat(str(d)[:10])


def _enrich_item(
    item: dict,
    *,
    natural_period_start: date,
    effective_period_start: date,
    pulled_forward: bool,
    override_row: PayPeriodItemOverride | None = None,
    can_pull_forward: bool = False,
) -> dict:
    out = dict(item)
    due = _parse_due(item)
    out["occurrence_due_date"] = due
    out["natural_period_start"] = natural_period_start
    out["effective_period_start"] = effective_period_start
    out["pulled_forward"] = pulled_forward
    out["pay_period_start"] = effective_period_start
    out["is_overridden"] = pulled_forward
    out["original_pay_period_start"] = natural_period_start if pulled_forward else None
    out["override_id"] = override_row.id if override_row else None
    out["can_revert_override"] = pulled_forward and override_row is not None
    out["can_pull_forward"] = (
        can_pull_forward
        and not pulled_forward
        and not bool(item.get("is_paid"))
        and not bool(item.get("is_overdue"))
    )
    return out


async def load_active_overrides(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
) -> list[PayPeriodItemOverride]:
    clauses = [
        PayPeriodItemOverride.revoked_at.is_(None),
        PayPeriodItemOverride.budget_id == budget_id,
    ]
    if user.household_id:
        clauses.append(PayPeriodItemOverride.household_id == user.household_id)
    else:
        clauses.append(PayPeriodItemOverride.household_id.is_(None))
        clauses.append(PayPeriodItemOverride.created_by_user_id == user.id)

    result = await db.execute(select(PayPeriodItemOverride).where(and_(*clauses)))
    return list(result.scalars().all())


def _override_map(
    overrides: list[PayPeriodItemOverride],
) -> dict[str, PayPeriodItemOverride]:
    return {
        occurrence_key(o.item_type, o.item_id, o.occurrence_due_date): o
        for o in overrides
    }


def _apply_effective_lists(
    natural_current: list[dict],
    natural_next: list[dict],
    current_start: date,
    next_start: date,
    overrides: list[PayPeriodItemOverride],
) -> tuple[list[dict], list[dict]]:
    """Build effective current and next item lists (no double counting)."""
    omap = _override_map(overrides)
    pulled_keys = {
        k
        for k, o in omap.items()
        if o.effective_period_start == current_start
        and o.natural_period_start == next_start
    }

    current_effective: list[dict] = []
    for item in natural_current:
        key = occurrence_key(item["item_type"], item["id"], _parse_due(item))
        if key in pulled_keys:
            continue
        current_effective.append(
            _enrich_item(
                item,
                natural_period_start=current_start,
                effective_period_start=current_start,
                pulled_forward=False,
            )
        )

    for item in natural_next:
        key = occurrence_key(item["item_type"], item["id"], _parse_due(item))
        if key in pulled_keys:
            current_effective.append(
                _enrich_item(
                    item,
                    natural_period_start=next_start,
                    effective_period_start=current_start,
                    pulled_forward=True,
                    override_row=omap.get(key),
                )
            )

    next_effective: list[dict] = []
    for item in natural_next:
        key = occurrence_key(item["item_type"], item["id"], _parse_due(item))
        if key in pulled_keys:
            continue
        next_effective.append(
            _enrich_item(
                item,
                natural_period_start=next_start,
                effective_period_start=next_start,
                pulled_forward=False,
                can_pull_forward=True,
            )
        )

    return current_effective, next_effective


async def _build_natural_for_period(
    bills: list[Any],
    debts: list[Any],
    window_start: date,
    window_end: date,
    current_date: date,
    paid_bill_map: dict,
    paid_debt_ids: set[UUID],
) -> list[dict]:
    return assign_bills_to_paycheck(
        bills,
        debts,
        window_start,
        window_end,
        current_date,
        paid_debt_ids=paid_debt_ids,
        paid_bill_map=paid_bill_map,
    )


async def build_pay_calendar_context(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
) -> dict[str, Any]:
    """Resolve anchor income, pay dates, and period windows for current + next."""
    income = await resolve_anchor_income(db, user, budget_id)
    entries = await fetch_paycheck_entries(db, user, budget_id)
    bills, debts = await fetch_scoped_bills_debts(db, user, budget_id)
    member_ids = await household_member_ids(db, user)

    income_sources = [income] if income else []
    plan = await build_paycheck_plan(
        user=user,
        income_sources=income_sources,
        bills=bills,
        debts=debts,
        num_periods=2,
        paycheck_entries=entries,
        paid_debt_ids=set(),
        db=db,
        user_ids=member_ids,
        get_paid_bill_ids_fn=get_paid_bill_map,
    )

    paychecks = plan.get("paychecks") or []
    if len(paychecks) < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No pay periods available. Add an income source with a pay date for this budget.",
        )

    current_pc = paychecks[0]
    current_start = current_pc["paycheck_date"]
    next_start = paychecks[1]["paycheck_date"] if len(paychecks) > 1 else None

    pay_dates = generate_pay_dates(current_start, plan["pay_frequency"], 3)
    if len(pay_dates) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to compute pay period boundaries.",
        )

    current_end = get_pay_period_window(pay_dates[0], pay_dates[1])[1]
    next_end = (
        get_pay_period_window(pay_dates[1], pay_dates[2])[1]
        if len(pay_dates) > 2 and next_start
        else current_end
    )

    overall_end = next_end if next_start else current_end
    paid_bill_map = await get_paid_bill_map(
        db,
        member_ids,
        [b.id for b in bills],
        current_start,
        overall_end,
        bills=bills,
        user=user,
    )

    return {
        "budget_id": budget_id,
        "pay_frequency": plan["pay_frequency"],
        "currency": plan.get("currency", "USD"),
        "bills": bills,
        "debts": debts,
        "entries": entries,
        "income_sources": income_sources,
        "current_start": current_start,
        "current_end": current_end,
        "next_start": next_start,
        "next_end": next_end,
        "current_paycheck_amount": current_pc["paycheck_amount"],
        "next_paycheck_amount": paychecks[1]["paycheck_amount"] if len(paychecks) > 1 else None,
        "paid_bill_map": paid_bill_map,
        "member_ids": member_ids,
    }


def _period_totals(items: list[dict], paycheck_amount: Decimal) -> dict[str, Any]:
    total_due = sum((Decimal(str(i["amount"])) for i in items), Decimal("0"))
    paid_amount = sum(
        (Decimal(str(i["amount"])) for i in items if i.get("is_paid")),
        Decimal("0"),
    )
    still_owed = total_due - paid_amount
    remaining = paycheck_amount - still_owed
    paid_count = sum(1 for i in items if i.get("is_paid"))
    return {
        "total_due": total_due,
        "total_paid": paid_amount,
        "total_still_owed": still_owed,
        "remaining": remaining,
        "paid_count": paid_count,
        "item_count": len(items),
        "status": "on_track" if remaining >= 0 else "over_budget",
    }


async def build_period_view(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
    label: Literal["current", "next"],
) -> dict[str, Any]:
    ctx = await build_pay_calendar_context(db, user, budget_id)
    today = date.today()

    if label == "next" and not ctx["next_start"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No next pay period is available for this budget.",
        )

    current_start = ctx["current_start"]
    current_end = ctx["current_end"]
    next_start = ctx["next_start"]
    next_end = ctx["next_end"]

    paid_current = await get_paid_debt_ids_in_window(
        db, [d.id for d in ctx["debts"]], current_start, current_end
    )
    natural_current = await _build_natural_for_period(
        ctx["bills"],
        ctx["debts"],
        current_start,
        current_end,
        today,
        ctx["paid_bill_map"],
        paid_current,
    )

    natural_next: list[dict] = []
    if next_start:
        paid_next = await get_paid_debt_ids_in_window(
            db, [d.id for d in ctx["debts"]], next_start, next_end
        )
        natural_next = await _build_natural_for_period(
            ctx["bills"],
            ctx["debts"],
            next_start,
            next_end,
            today,
            ctx["paid_bill_map"],
            paid_next,
        )

    overrides = await load_active_overrides(db, user, budget_id)
    current_items, next_items = _apply_effective_lists(
        natural_current,
        natural_next,
        current_start,
        next_start or current_start,
        overrides,
    )

    if label == "current":
        items = current_items
        period_start, period_end = current_start, current_end
        paycheck_amount = Decimal(str(ctx["current_paycheck_amount"]))
    else:
        items = next_items
        period_start, period_end = next_start, next_end
        paycheck_amount = Decimal(str(ctx["next_paycheck_amount"] or 0))

    totals = _period_totals(items, paycheck_amount)
    return {
        "meta": {
            "period_start": period_start,
            "period_end": period_end,
            "paycheck_date": period_start,
            "label": label,
        },
        "paycheck_amount": paycheck_amount,
        "assigned_items": items,
        **totals,
    }


async def get_period_summary(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
) -> dict[str, Any]:
    ctx = await build_pay_calendar_context(db, user, budget_id)
    return {
        "budget_id": budget_id,
        "pay_frequency": ctx["pay_frequency"],
        "current": {
            "period_start": ctx["current_start"],
            "period_end": ctx["current_end"],
            "paycheck_date": ctx["current_start"],
            "label": "current",
        },
        "next": (
            {
                "period_start": ctx["next_start"],
                "period_end": ctx["next_end"],
                "paycheck_date": ctx["next_start"],
                "label": "next",
            }
            if ctx["next_start"]
            else None
        ),
    }


async def _clear_checklist_for_occurrence(
    db: AsyncSession,
    item_type: str,
    item_id: UUID,
) -> None:
    await db.execute(
        delete(PaycheckChecklist).where(
            PaycheckChecklist.item_type == item_type,
            PaycheckChecklist.item_id == item_id,
        )
    )


async def pull_forward(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
    item_type: str,
    item_id: UUID,
    occurrence_due_date: date,
) -> PayPeriodItemOverride:
    ctx = await build_pay_calendar_context(db, user, budget_id)
    if not ctx["next_start"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No next pay period is available.",
        )

    today = date.today()
    paid_next = await get_paid_debt_ids_in_window(
        db, [d.id for d in ctx["debts"]], ctx["next_start"], ctx["next_end"]
    )
    natural_next = await _build_natural_for_period(
        ctx["bills"],
        ctx["debts"],
        ctx["next_start"],
        ctx["next_end"],
        today,
        ctx["paid_bill_map"],
        paid_next,
    )

    key = occurrence_key(item_type, item_id, occurrence_due_date)
    natural_by_key = {
        occurrence_key(i["item_type"], i["id"], _parse_due(i)): i for i in natural_next
    }
    if key not in natural_by_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Item is not assigned to the next pay period for this occurrence.",
        )
    target_item = natural_by_key[key]
    if target_item.get("is_paid"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Paid items cannot be pulled into the current pay period.",
        )
    if target_item.get("is_overdue"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Overdue items cannot be pulled forward; they belong in the current period via carry-forward.",
        )

    existing = await db.execute(
        select(PayPeriodItemOverride).where(
            PayPeriodItemOverride.item_type == item_type,
            PayPeriodItemOverride.item_id == item_id,
            PayPeriodItemOverride.occurrence_due_date == occurrence_due_date,
            PayPeriodItemOverride.revoked_at.is_(None),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This occurrence is already pulled into the current period.",
        )

    row = PayPeriodItemOverride(
        household_id=user.household_id,
        budget_id=budget_id,
        item_type=item_type,
        item_id=item_id,
        occurrence_due_date=occurrence_due_date,
        natural_period_start=ctx["next_start"],
        effective_period_start=ctx["current_start"],
        override_type=OVERRIDE_PULL_FORWARD,
        created_by_user_id=user.id,
    )
    db.add(row)
    await _clear_checklist_for_occurrence(db, item_type, item_id)
    await db.flush()
    await db.refresh(row)
    return row


async def revert_pull_forward(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
    item_type: str,
    item_id: UUID,
    occurrence_due_date: date,
) -> PayPeriodItemOverride:
    result = await db.execute(
        select(PayPeriodItemOverride).where(
            PayPeriodItemOverride.item_type == item_type,
            PayPeriodItemOverride.item_id == item_id,
            PayPeriodItemOverride.occurrence_due_date == occurrence_due_date,
            PayPeriodItemOverride.budget_id == budget_id,
            PayPeriodItemOverride.revoked_at.is_(None),
            PayPeriodItemOverride.override_type == OVERRIDE_PULL_FORWARD,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active pull-forward override for this occurrence.",
        )
    if user.household_id and row.household_id != user.household_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Override not found.")
    if not user.household_id and row.created_by_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Override not found.")

    row.revoked_at = datetime.now(timezone.utc)
    await _clear_checklist_for_occurrence(db, item_type, item_id)
    await db.flush()
    await db.refresh(row)
    return row


async def revert_pull_forward_by_id(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
    override_id: UUID,
) -> PayPeriodItemOverride:
    result = await db.execute(
        select(PayPeriodItemOverride).where(
            PayPeriodItemOverride.id == override_id,
            PayPeriodItemOverride.budget_id == budget_id,
            PayPeriodItemOverride.revoked_at.is_(None),
            PayPeriodItemOverride.override_type == OVERRIDE_PULL_FORWARD,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Override not found.")
    return await revert_pull_forward(
        db,
        user,
        budget_id,
        row.item_type,
        row.item_id,
        row.occurrence_due_date,
    )


def _widget_bill_amount(bill: Bill, cycle_row: Any) -> Decimal:
    base = Decimal(str(cycle_row.amount_due if cycle_row.amount_due is not None else bill.amount or 0))
    share = getattr(bill, "user_share_amount", None)
    full = Decimal(str(bill.amount or 0))
    if share is None or full <= 0:
        return base
    if bill.payment_mode == "split" and bill.household_id:
        return Decimal(str(share))
    if full == base:
        return Decimal(str(share)) if share else base
    ratio = base / full
    return (Decimal(str(share)) * ratio).quantize(Decimal("0.01"))


def _widget_item_shell(
    *,
    item_id: UUID,
    name: str,
    item_type: str,
    amount: Decimal,
    due_date: date,
    today: date,
    category: str | None = None,
    is_paid: bool = False,
    can_pull_forward: bool = False,
    can_revert_override: bool = False,
    pulled_forward: bool = False,
    auto_pay: bool = False,
) -> dict[str, Any]:
    days = (due_date - today).days
    return {
        "id": item_id,
        "name": name,
        "item_type": item_type,
        "amount": amount,
        "due_date": due_date,
        "occurrence_due_date": due_date,
        "days_until_due": days,
        "status": "overdue" if days < 0 else ("due_soon" if days <= 7 else "upcoming"),
        "auto_pay": auto_pay,
        "is_paid": is_paid,
        "is_overdue": days < 0,
        "category": category or "Other",
        "can_pull_forward": can_pull_forward,
        "can_revert_override": can_revert_override,
        "pulled_forward": pulled_forward,
    }


async def build_pull_forward_widget(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
    visible_limit: int = 7,
) -> dict[str, Any]:
    """Strict rolling next-7 unpaid list for the dashboard pull-forward widget."""
    ctx = await build_pay_calendar_context(db, user, budget_id)
    all_bills, _member_count = await fetch_widget_bills(db, user, budget_id)
    responsible_bills = [
        b for b in all_bills if getattr(b, "is_user_responsible", True)
    ]
    _, debts = await fetch_scoped_bills_debts(db, user, budget_id)

    today = local_today(user)
    cycle_year, cycle_month = today.year, today.month
    horizon_start = date(cycle_year, cycle_month, 1)
    horizon_end = _add_months(horizon_start, 4)

    await auto_generate_missing_cycle_rows(
        db, responsible_bills, user, cycle_year, cycle_month
    )
    await auto_generate_missing_cycle_rows_for_window(
        db, responsible_bills, user, horizon_start, horizon_end
    )

    cycle_payments = await get_cycle_payments(
        db, [b.id for b in responsible_bills], horizon_start, horizon_end
    )
    bill_by_id = {b.id: b for b in responsible_bills}

    overrides = await load_active_overrides(db, user, budget_id)
    omap = _override_map(overrides)
    pulled_keys = {
        k
        for k, o in omap.items()
        if o.effective_period_start == ctx["current_start"]
        and o.natural_period_start == ctx.get("next_start")
    }

    next_start = ctx.get("next_start")
    next_end = ctx.get("next_end")

    candidates: dict[str, dict[str, Any]] = {}

    for (bill_id, due_date), row in cycle_payments.items():
        if row.is_paid:
            continue
        if row.cycle_year != cycle_year or row.cycle_month != cycle_month:
            continue
        bill = bill_by_id.get(bill_id)
        if bill is None:
            continue
        amount = _widget_bill_amount(bill, row)
        if amount <= 0:
            continue
        key = occurrence_key("bill", bill_id, due_date)
        in_next = bool(
            next_start and next_end and next_start <= due_date <= next_end
        )
        on_current = ctx["current_start"] <= due_date <= ctx["current_end"]
        candidates[key] = _widget_item_shell(
            item_id=bill_id,
            name=bill.name or "Bill",
            item_type="bill",
            amount=amount,
            due_date=due_date,
            today=today,
            category=getattr(bill, "category", None),
            auto_pay=bool(bill.auto_pay),
            can_pull_forward=bool(
                in_next and not on_current and key not in pulled_keys
            ),
            can_revert_override=key in pulled_keys,
            pulled_forward=key in pulled_keys,
        )

    paid_map_cycle_only: dict[UUID, list[Any]] = {}
    for (bill_id, due_date), row in cycle_payments.items():
        if row.is_paid:
            paid_map_cycle_only.setdefault(bill_id, []).append(
                {
                    "due_date": due_date,
                    "paid_date": row.paid_date,
                    "source": "bill_cycle_payments",
                }
            )

    current_bill_items = assign_bills_to_paycheck(
        responsible_bills,
        [],
        ctx["current_start"],
        ctx["current_end"],
        today,
        paid_bill_map=paid_map_cycle_only,
    )
    for item in current_bill_items:
        if item.get("item_type") != "bill" or item.get("is_paid"):
            continue
        bill = bill_by_id.get(item["id"])
        if bill is None:
            continue
        due = _parse_due(item)
        key = occurrence_key("bill", item["id"], due)
        if key in candidates:
            continue
        amount = Decimal(str(getattr(bill, "user_share_amount", None) or item["amount"]))
        if amount <= 0:
            continue
        in_next = bool(
            next_start and next_end and next_start <= due <= next_end
        )
        on_current = ctx["current_start"] <= due <= ctx["current_end"]
        candidates[key] = _widget_item_shell(
            item_id=item["id"],
            name=item["name"],
            item_type="bill",
            amount=amount,
            due_date=due,
            today=today,
            category=getattr(bill, "category", None),
            auto_pay=bool(bill.auto_pay),
            can_pull_forward=bool(
                in_next and not on_current and key not in pulled_keys
            ),
            can_revert_override=key in pulled_keys,
            pulled_forward=key in pulled_keys,
        )

    paid_debt_ids = await get_paid_debt_ids_in_window(
        db, [d.id for d in debts], ctx["current_start"], ctx["current_end"]
    )
    debt_items = assign_bills_to_paycheck(
        [],
        debts,
        ctx["current_start"],
        ctx["current_end"],
        today,
        paid_debt_ids=paid_debt_ids,
        paid_bill_map={},
    )
    for item in debt_items:
        if item.get("item_type") != "debt":
            continue
        if item.get("is_paid"):
            continue
        due = _parse_due(item)
        key = occurrence_key("debt", item["id"], due)
        if key in candidates:
            continue
        in_next = bool(
            next_start and next_end and next_start <= due <= next_end
        )
        on_current = ctx["current_start"] <= due <= ctx["current_end"]
        candidates[key] = _widget_item_shell(
            item_id=item["id"],
            name=item["name"],
            item_type="debt",
            amount=Decimal(str(item["amount"])),
            due_date=due,
            today=today,
            category="Debt/Loan",
            can_pull_forward=bool(
                in_next and not on_current and key not in pulled_keys
            ),
            can_revert_override=key in pulled_keys,
            pulled_forward=key in pulled_keys,
        )

    unpaid_sorted = sorted(
        candidates.values(),
        key=lambda x: (0 if x["is_overdue"] else 1, x["due_date"]),
    )
    visible = unpaid_sorted[:visible_limit]
    remaining = max(0, len(unpaid_sorted) - visible_limit)
    total_visible = sum(
        (Decimal(str(i["amount"])) for i in visible), Decimal("0")
    )

    paid_current = await get_paid_debt_ids_in_window(
        db, [d.id for d in debts], ctx["current_start"], ctx["current_end"]
    )
    current_cycle_paid = sum(
        1 for row in cycle_payments.values()
        if row.cycle_year == cycle_year
        and row.cycle_month == cycle_month
        and row.is_paid
    )
    current_cycle_total = sum(
        1 for (_, _), row in cycle_payments.items()
        if row.cycle_year == cycle_year and row.cycle_month == cycle_month
    )
    current_debt_total = len(
        [
            i
            for i in debt_items
            if i.get("item_type") == "debt"
        ]
    )
    current_debt_paid = len(paid_debt_ids)
    denom = current_cycle_total + current_debt_total
    numer = current_cycle_paid + current_debt_paid
    progress = (numer / denom * 100.0) if denom else 0.0

    return {
        "next_paycheck_date": next_start or ctx["current_start"],
        "total_due_for_visible_items": total_visible,
        "remaining_count": remaining,
        "unpaid_count": len(unpaid_sorted),
        "progress_percent": round(progress, 1),
        "visible_items": visible,
    }


async def build_upcoming_paycheck_response(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
    upcoming_count: int = 3,
) -> dict[str, Any]:
    """Current paycheck + next N periods with effective assignments."""
    periods = max(2, 1 + upcoming_count)
    plan = await build_full_paycheck_plan_response(db, user, budget_id, periods=periods)
    paychecks = plan.get("paychecks") or []
    current = paychecks[0] if paychecks else None
    upcoming = paychecks[1 : 1 + upcoming_count] if len(paychecks) > 1 else []
    return {
        "budget_id": budget_id,
        "pay_frequency": plan.get("pay_frequency"),
        "currency": plan.get("currency"),
        "current": current,
        "upcoming": upcoming,
    }


async def build_full_paycheck_plan_response(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
    periods: int = 4,
) -> dict[str, Any]:
    """Budget-scoped paycheck plan with effective assignments for period 0/1."""
    income = await resolve_anchor_income(db, user, budget_id)
    entries = await fetch_paycheck_entries(db, user, budget_id)
    bills, debts = await fetch_scoped_bills_debts(db, user, budget_id)
    member_ids = await household_member_ids(db, user)

    income_sources = [income] if income else []
    plan = await build_paycheck_plan(
        user=user,
        income_sources=income_sources,
        bills=bills,
        debts=debts,
        num_periods=periods,
        paycheck_entries=entries,
        paid_debt_ids=set(),
        db=db,
        user_ids=member_ids,
        get_paid_bill_ids_fn=get_paid_bill_map,
    )

    overrides = await load_active_overrides(db, user, budget_id)
    paychecks = plan.get("paychecks") or []
    if len(paychecks) >= 2:
        current_start = paychecks[0]["paycheck_date"]
        next_start = paychecks[1]["paycheck_date"]
        today = date.today()

        ctx = await build_pay_calendar_context(db, user, budget_id)
        paid_current = await get_paid_debt_ids_in_window(
            db, [d.id for d in debts], ctx["current_start"], ctx["current_end"]
        )
        natural_current = await _build_natural_for_period(
            bills,
            debts,
            ctx["current_start"],
            ctx["current_end"],
            today,
            ctx["paid_bill_map"],
            paid_current,
        )
        paid_next = await get_paid_debt_ids_in_window(
            db, [d.id for d in debts], ctx["next_start"], ctx["next_end"]
        )
        natural_next = await _build_natural_for_period(
            bills,
            debts,
            ctx["next_start"],
            ctx["next_end"],
            today,
            ctx["paid_bill_map"],
            paid_next,
        )
        current_items, next_items = _apply_effective_lists(
            natural_current,
            natural_next,
            current_start,
            next_start,
            overrides,
        )

        anchor = paychecks[0]["paycheck_date"]
        all_dates = generate_pay_dates(anchor, plan["pay_frequency"], len(paychecks) + 1)

        for i, pc in enumerate(paychecks):
            if i == 0:
                items = current_items
            elif i == 1:
                items = next_items
            else:
                if i + 1 >= len(all_dates):
                    items = []
                else:
                    ws, we = get_pay_period_window(all_dates[i], all_dates[i + 1])
                    paid_d = await get_paid_debt_ids_in_window(
                        db, [d.id for d in debts], ws, we
                    )
                    items = await _build_natural_for_period(
                        bills,
                        debts,
                        ws,
                        we,
                        today,
                        ctx["paid_bill_map"],
                        paid_d,
                    )
                    items = [
                        _enrich_item(
                            it,
                            natural_period_start=pc["paycheck_date"],
                            effective_period_start=pc["paycheck_date"],
                            pulled_forward=False,
                        )
                        for it in items
                    ]

            total_due = sum((Decimal(str(x["amount"])) for x in items), Decimal("0"))
            remaining = Decimal(str(pc["paycheck_amount"])) - total_due
            period_end = (
                get_pay_period_window(all_dates[i], all_dates[i + 1])[1]
                if i + 1 < len(all_dates)
                else ctx["current_end"]
            )
            paychecks[i] = {
                **pc,
                "assigned_items": items,
                "total_due": total_due,
                "remaining": remaining,
                "status": "on_track" if remaining >= 0 else "over_budget",
                "pay_period_start": pc["paycheck_date"],
                "period_start": pc["paycheck_date"],
                "period_end": period_end,
                "is_current": i == 0,
                "is_next": i == 1,
            }

        plan["paychecks"] = paychecks

    plan["budget_id"] = budget_id
    plan["pull_forward_widget"] = await build_pull_forward_widget(db, user, budget_id)
    return plan
