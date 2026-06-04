"""Single source of truth for current-paycheck assigned item state."""

from __future__ import annotations

import calendar as _calendar
from datetime import date, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pay_period_item_override import PayPeriodItemOverride
from app.models.paycheck_checklist import PaycheckChecklist
from app.models.user import User
from app.services.bill_cycles import auto_generate_missing_cycle_rows
from app.services.paycheck_data import (
    fetch_widget_bills,
    get_paid_bill_map,
    get_paid_debt_ids_in_window,
)
from app.services.bill_cycles import occurrence_dates_for_bill
from app.services.paycheck_engine import (
    apply_planning_due_labels,
    assign_bills_to_paycheck,
    normalize_paycheck_line_item,
    normalize_planning_item,
    occurrence_key,
)


def _prev_period_start(current_start: date, pay_freq: str) -> date | None:
    """Return the pay-period start that immediately precedes *current_start*.

    Used to carry forward unpaid-overdue items (e.g. Rent due before the
    current window) into the current paycheck plan.
    """
    if pay_freq == "biweekly":
        return current_start - timedelta(days=14)
    if pay_freq == "weekly":
        return current_start - timedelta(days=7)
    if pay_freq == "semi_monthly":
        # Semi-monthly periods are ~15 days; use 15 as a safe step.
        return current_start - timedelta(days=15)
    if pay_freq == "monthly":
        m = current_start.month - 1 or 12
        y = current_start.year - (1 if current_start.month == 1 else 0)
        d = min(current_start.day, _calendar.monthrange(y, m)[1])
        return date(y, m, d)
    return None


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
    from app.services.pay_period_planner import _apply_effective_lists

    bills = ctx["bills"]
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

    current_assigned, next_period = _apply_effective_lists(
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
            normalized = normalize_planning_item(
                apply_planning_due_labels(
                    item,
                    today=today,
                    cycle_year=cycle_year,
                    cycle_month=cycle_month,
                )
            )
            if (normalized["item_type"], normalized["item_id"]) in checked_items:
                normalized["is_paid"] = True
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
                    apply_planning_due_labels(
                        normalize_paycheck_line_item(raw),
                        today=today,
                        cycle_year=cycle_year,
                        cycle_month=cycle_month,
                    )
                )
                if (normalized["item_type"], normalized["item_id"]) in checked_items:
                    normalized["is_paid"] = True
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
    prev_start = _prev_period_start(current_start, pay_freq)
    if prev_start is not None and prev_start < current_start:
        prev_end = current_start - timedelta(days=1)
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
        for raw in prev_natural:
            # Only carry forward items that were NOT paid in the previous period
            # and that assign_bills_to_paycheck already flagged as overdue.
            if not (raw.get("is_overdue") and not raw.get("is_paid")):
                continue
            normalized = normalize_planning_item(
                apply_planning_due_labels(
                    raw,
                    today=today,
                    cycle_year=cycle_year,
                    cycle_month=cycle_month,
                )
            )
            # Preserve the overdue flag even if active_cycle_overdue returns False
            # (e.g. a bill due in the previous calendar month).
            normalized["is_overdue"] = True
            # Honour the current-period checklist so the user can tick it off.
            if (normalized["item_type"], normalized["item_id"]) in checked_items:
                normalized["is_paid"] = True
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
