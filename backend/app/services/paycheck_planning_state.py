"""Single source of truth for current-paycheck assigned item state."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pay_period_item_override import PayPeriodItemOverride
from app.models.paycheck_checklist import PaycheckChecklist
from app.models.user import User
from app.services.bill_cycles import (
    auto_generate_missing_cycle_rows,
    is_cadence_recurring_bill,
    next_due_date_for_bill,
    occurrence_dates_for_bill,
)
from app.services.paycheck_data import (
    fetch_widget_bills,
    get_paid_bill_map,
    get_paid_debt_ids_in_window,
)
from app.services.paycheck_assignment import apply_effective_lists
from app.services.paycheck_engine import (
    _bill_due_dates_in_window,
    _most_recent_pay_date,
    apply_planning_due_labels,
    assign_bills_to_paycheck,
    generate_pay_dates,
    get_pay_period_window,
    normalize_paycheck_line_item,
    normalize_planning_item,
    occurrence_key,
    pay_period_index_containing,
    previous_period_bounds,
)
from app.services.debug_bill_dates import is_amanda_car, snapshot_amanda_car_bill


async def _checked_items_for_period(
    db: AsyncSession,
    user: User,
    pay_period_start: date,
) -> set[tuple[str, UUID]]:
    result = await db.execute(
        select(PaycheckChecklist).where(
            PaycheckChecklist.user_id == user.id,
            PaycheckChecklist.pay_period_start == pay_period_start,
            PaycheckChecklist.is_checked.is_(True),
        )
    )
    return {(row.item_type, row.item_id) for row in result.scalars().all()}


def _item_due_date(item: dict) -> date | None:
    raw = item.get("due_date")
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw
    if raw is None:
        return None
    try:
        return date.fromisoformat(str(raw)[:10])
    except (TypeError, ValueError):
        return None


def consolidate_cadence_bill_assignments(
    items: list[dict],
    bills_by_id: dict[UUID, Any],
    today: date,
) -> list[dict]:
    """Keep one dashboard row per weekly/biweekly bill — the next scheduled occurrence."""
    passthrough: list[dict] = []
    groups: dict[UUID, list[dict]] = {}

    for item in items:
        if item.get("item_type") != "bill":
            passthrough.append(item)
            continue
        bill_id = item.get("id") or item.get("item_id")
        bill = bills_by_id.get(bill_id)
        if bill is None or not is_cadence_recurring_bill(bill):
            passthrough.append(item)
            continue
        groups.setdefault(bill_id, []).append(item)

    consolidated = list(passthrough)
    for bill_id, group in groups.items():
        bill = bills_by_id[bill_id]
        target_due = next_due_date_for_bill(bill, today)
        chosen: dict | None = None
        if target_due is not None:
            for item in group:
                if _item_due_date(item) == target_due:
                    chosen = dict(item)
                    break
            if chosen is None and group:
                template = group[0]
                chosen = dict(template)
                chosen["due_date"] = target_due
                chosen["is_paid"] = False
        if chosen is None:
            unpaid = [it for it in group if not it.get("is_paid")]
            pool = unpaid or group
            future = [it for it in pool if (_item_due_date(it) or today) >= today]
            if future:
                chosen = dict(min(future, key=lambda it: _item_due_date(it) or today))
            elif pool:
                chosen = dict(max(pool, key=lambda it: _item_due_date(it) or date.min))

        if chosen is None:
            continue

        due = _item_due_date(chosen)
        if due is not None:
            chosen["days_until_due"] = (due - today).days
            chosen["status"] = (
                "overdue"
                if due < today and not chosen.get("is_paid")
                else "urgent"
                if chosen["days_until_due"] <= 1
                else "due_soon"
                if chosen["days_until_due"] <= 4
                else "upcoming"
            )
            chosen["is_overdue"] = due < today and not chosen.get("is_paid")
        consolidated.append(chosen)

    return consolidated


async def build_paycheck_planning_state(
    db: AsyncSession,
    user: User,
    budget_id: UUID,
    *,
    ctx: dict[str, Any],
    overrides: list[PayPeriodItemOverride],
    today: date,
) -> dict[str, Any]:
    """Compute assigned items and paid state for the current paycheck plan."""
    bills = [
        b
        for b in ctx["bills"]
        if getattr(b, "is_active", True) is not False
        and getattr(b, "is_user_responsible", True)
    ]
    debts = ctx["debts"]
    current_start = ctx["current_start"]
    current_end = ctx["current_end"]
    next_start = ctx.get("next_start")
    next_end = ctx.get("next_end")

    cycle_year = today.year
    cycle_month = today.month

    widget_bills, _ = await fetch_widget_bills(db, user, budget_id)
    responsible = [b for b in widget_bills if getattr(b, "is_user_responsible", True)]
    await auto_generate_missing_cycle_rows(
        db, responsible, user, cycle_year, cycle_month
    )

    overall_end = next_end if next_start else current_end
    paid_bill_map = await get_paid_bill_map(
        db,
        ctx["member_ids"],
        [b.id for b in bills],
        current_start,
        overall_end,
        bills=bills,
        user=user,
    )

    debt_ids = [d.id for d in debts]
    paid_current = await get_paid_debt_ids_in_window(
        db, debt_ids, current_start, current_end
    )
    paid_next = (
        await get_paid_debt_ids_in_window(db, debt_ids, next_start, next_end)
        if next_start
        else set()
    )

    natural_current = assign_bills_to_paycheck(
        bills,
        debts,
        current_start,
        current_end,
        today,
        paid_debt_ids=paid_current,
        paid_bill_map=paid_bill_map,
    )
    natural_next = (
        assign_bills_to_paycheck(
            bills,
            debts,
            next_start,
            next_end,
            today,
            paid_debt_ids=paid_next,
            paid_bill_map=paid_bill_map,
        )
        if next_start
        else []
    )

    current_assigned, next_period = apply_effective_lists(
        natural_current,
        natural_next,
        current_start,
        next_start,
        overrides,
    )
    checked_items = await _checked_items_for_period(db, user, current_start)

    def _label_items(items: list[dict]) -> list[dict]:
        labeled: list[dict] = []
        for item in items:
            normalized = normalize_planning_item(item)
            if (normalized["item_type"], normalized["item_id"]) in checked_items:
                normalized["is_paid"] = True
            normalized = normalize_planning_item(
                apply_planning_due_labels(
                    normalized,
                    today=today,
                    cycle_year=cycle_year,
                    cycle_month=cycle_month,
                )
            )
            labeled.append(normalized)
        return labeled

    current_assigned = _label_items(current_assigned)
    next_period = _label_items(next_period)

    # Backfill in-window bill occurrences missing from assignment (e.g. Rent).
    present_keys = {i.get("planning_key") for i in current_assigned}
    for bill in bills:
        if getattr(bill, "is_active", True) is False:
            continue
        for due_dt in occurrence_dates_for_bill(bill, current_start, current_end):
            key = occurrence_key("bill", bill.id, due_dt)
            if key in present_keys:
                continue
            extra = assign_bills_to_paycheck(
                [bill],
                [],
                current_start,
                current_end,
                today,
                paid_debt_ids=set(),
                paid_bill_map=paid_bill_map,
            )
            for raw in extra:
                if raw.get("due_date") != due_dt:
                    continue
                normalized = normalize_planning_item(
                    normalize_paycheck_line_item(raw)
                )
                if (normalized["item_type"], normalized["item_id"]) in checked_items:
                    normalized["is_paid"] = True
                normalized = normalize_planning_item(
                    apply_planning_due_labels(
                        normalized,
                        today=today,
                        cycle_year=cycle_year,
                        cycle_month=cycle_month,
                    )
                )
                normalized.update(
                    {
                        "natural_period_start": current_start,
                        "effective_period_start": current_start,
                        "pulled_forward": False,
                        "pay_period_start": current_start,
                        "is_overridden": False,
                        "original_pay_period_start": None,
                        "override_id": None,
                        "can_revert_override": False,
                        "can_pull_forward": False,
                    }
                )
                current_assigned.append(normalized)
                present_keys.add(key)

    # ── Carryover: include unpaid-overdue items from the preceding pay period ──
    # Bills whose due date falls *before* the current window (e.g. Rent due
    # Jun 1 when the current period starts Jun 4) are never returned by
    # assign_bills_to_paycheck for the current window.  Fetch the immediately
    # preceding period and inject any items that were not paid.
    pay_freq = ctx.get("pay_frequency", "biweekly")
    anchor = None
    income_sources = ctx.get("income_sources") or []
    if income_sources:
        raw_anchor = getattr(income_sources[0], "next_pay_date", None)
        if isinstance(raw_anchor, datetime):
            anchor = raw_anchor.date()
        elif isinstance(raw_anchor, date):
            anchor = raw_anchor
    bounds = previous_period_bounds(
        current_start,
        pay_freq,
        anchor_pay_date=anchor,
    )
    if bounds is not None:
        prev_start, prev_end = bounds
        prev_paid_bill_map = await get_paid_bill_map(
            db,
            ctx["member_ids"],
            [b.id for b in bills],
            prev_start,
            prev_end,
            bills=bills,
            user=user,
        )
        prev_paid_debts = await get_paid_debt_ids_in_window(
            db, debt_ids, prev_start, prev_end
        )
        prev_natural = assign_bills_to_paycheck(
            bills,
            debts,
            prev_start,
            prev_end,
            today,
            paid_debt_ids=prev_paid_debts,
            paid_bill_map=prev_paid_bill_map,
        )
        existing_planning_keys = {i.get("planning_key") for i in current_assigned}
        bills_by_id = {b.id: b for b in bills}
        for raw in prev_natural:
            if raw.get("is_paid"):
                continue
            bill_obj = bills_by_id.get(raw.get("id"))
            if bill_obj is not None and is_cadence_recurring_bill(bill_obj):
                continue
            due = raw.get("due_date")
            if isinstance(due, datetime):
                due = due.date()
            if isinstance(due, date) and due >= current_start:
                continue
            normalized = normalize_planning_item(
                apply_planning_due_labels(
                    raw,
                    today=today,
                    cycle_year=cycle_year,
                    cycle_month=cycle_month,
                )
            )
            # Honour the current-period checklist so the user can tick it off.
            if (normalized["item_type"], normalized["item_id"]) in checked_items:
                normalized["is_paid"] = True
                normalized = normalize_planning_item(
                    apply_planning_due_labels(
                        normalized,
                        today=today,
                        cycle_year=cycle_year,
                        cycle_month=cycle_month,
                    )
                )
            # Enrich with period metadata matching what _apply_effective_lists produces.
            normalized.update(
                {
                    "natural_period_start": prev_start,
                    "effective_period_start": current_start,
                    "pulled_forward": False,
                    "pay_period_start": current_start,
                    "is_overridden": False,
                    "original_pay_period_start": None,
                    "override_id": None,
                    "can_revert_override": False,
                    "can_pull_forward": False,
                }
            )
            if normalized.get("planning_key") not in existing_planning_keys:
                current_assigned.append(normalized)
                existing_planning_keys.add(normalized.get("planning_key"))

    # ── Early-in-month unpaid bills (fallback when period boundaries miss a due date) ──
    month_start = date(cycle_year, cycle_month, 1)
    if current_start > month_start:
        early_end = current_start - timedelta(days=1)
        early_paid_map = await get_paid_bill_map(
            db,
            ctx["member_ids"],
            [b.id for b in bills],
            month_start,
            early_end,
            bills=bills,
            user=user,
        )
        existing_planning_keys = {i.get("planning_key") for i in current_assigned}
        for bill in bills:
            if is_cadence_recurring_bill(bill):
                continue
            for due_dt in _bill_due_dates_in_window(bill, month_start, early_end):
                if due_dt >= current_start:
                    continue
                key = occurrence_key("bill", bill.id, due_dt)
                if key in existing_planning_keys:
                    continue
                paid_for_due = False
                for marker in early_paid_map.get(bill.id, []):
                    if isinstance(marker, dict) and marker.get("due_date") == due_dt:
                        paid_for_due = True
                        break
                if paid_for_due:
                    continue
                extra = assign_bills_to_paycheck(
                    [bill],
                    [],
                    month_start,
                    early_end,
                    today,
                    paid_debt_ids=set(),
                    paid_bill_map=early_paid_map,
                )
                for raw in extra:
                    if raw.get("due_date") != due_dt:
                        continue
                    normalized = normalize_planning_item(
                        normalize_paycheck_line_item(raw)
                    )
                    if (normalized["item_type"], normalized["item_id"]) in checked_items:
                        normalized["is_paid"] = True
                    normalized = normalize_planning_item(
                        apply_planning_due_labels(
                            normalized,
                            today=today,
                            cycle_year=cycle_year,
                            cycle_month=cycle_month,
                        )
                    )
                    normalized.update(
                        {
                            "natural_period_start": month_start,
                            "effective_period_start": current_start,
                            "pulled_forward": False,
                            "pay_period_start": current_start,
                            "is_overridden": False,
                            "original_pay_period_start": None,
                            "override_id": None,
                            "can_revert_override": False,
                            "can_pull_forward": False,
                        }
                    )
                    current_assigned.append(normalized)
                    existing_planning_keys.add(key)

    bills_by_id = {b.id: b for b in bills}
    current_assigned = consolidate_cadence_bill_assignments(
        current_assigned, bills_by_id, today
    )

    assigned_paid_count = sum(1 for i in current_assigned if i.get("is_paid"))
    assigned_total_count = len(current_assigned)
    assigned_total_amount = sum(
        (Decimal(str(i["amount"])) for i in current_assigned), Decimal("0")
    )
    assigned_paid_amount = sum(
        (Decimal(str(i["amount"])) for i in current_assigned if i.get("is_paid")),
        Decimal("0"),
    )
    assigned_still_owed = assigned_total_amount - assigned_paid_amount
    assigned_progress_percent = (
        round(100.0 * assigned_paid_count / assigned_total_count, 1)
        if assigned_total_count
        else 0.0
    )

    # TEMPORARY: debug Amanda Car overdue investigation
    debug_amanda_car = None
    for bill in bills:
        if is_amanda_car(getattr(bill, "name", None)):
            debug_ctx = dict(ctx)
            if bounds is not None:
                debug_ctx["_debug_prev_bounds"] = bounds
            debug_amanda_car = snapshot_amanda_car_bill(
                bill,
                today,
                ctx=debug_ctx,
                assigned_items=current_assigned,
                paid_bill_map=paid_bill_map,
                source="build_paycheck_planning_state",
            )
            break

    return {
        "paycheck_context": {
            "pay_period_start": current_start,
            "pay_period_end": current_end,
            "next_paycheck_date": next_start,
            "budget_id": budget_id,
            "household_id": user.household_id,
            "user_id": user.id,
        },
        "assigned_items": current_assigned,
        "next_period_items": next_period,
        "paid_bill_map": paid_bill_map,
        "assigned_paid_count": assigned_paid_count,
        "assigned_total_count": assigned_total_count,
        "assigned_paid_amount": assigned_paid_amount,
        "assigned_total_amount": assigned_total_amount,
        "assigned_still_owed": assigned_still_owed,
        "assigned_progress_percent": assigned_progress_percent,
        "_debug_amanda_car": debug_amanda_car,
    }


def build_current_paycheck_plan(
    planning: dict[str, Any],
    *,
    paycheck_meta: dict[str, Any],
    ctx: dict[str, Any],
) -> dict[str, Any]:
    """Unified current-paycheck object for dashboard assigned + pull widget."""
    return {
        "paycheck_context": planning["paycheck_context"],
        "paycheck_date": paycheck_meta["paycheck_date"],
        "pay_period_start": paycheck_meta.get("pay_period_start")
        or paycheck_meta["paycheck_date"],
        "pay_period_end": ctx.get("current_end"),
        "next_paycheck_date": ctx.get("next_start"),
        "paycheck_amount": paycheck_meta["paycheck_amount"],
        "total_due": paycheck_meta.get("total_due", Decimal("0")),
        "remaining": paycheck_meta.get("remaining", Decimal("0")),
        "status": paycheck_meta.get("status", "on_track"),
        "assigned_items": planning["assigned_items"],
        "assigned_paid_count": planning["assigned_paid_count"],
        "assigned_total_count": planning["assigned_total_count"],
        "assigned_paid_amount": planning["assigned_paid_amount"],
        "assigned_total_amount": planning["assigned_total_amount"],
        "assigned_still_owed": planning["assigned_still_owed"],
        "assigned_progress_percent": planning["assigned_progress_percent"],
    }
