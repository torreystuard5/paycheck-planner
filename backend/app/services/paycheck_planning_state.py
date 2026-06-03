"""Single source of truth for current-paycheck assigned + pull-forward widget."""

from __future__ import annotations

from datetime import date
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
from app.services.paycheck_engine import (
    apply_planning_due_labels,
    assign_bills_to_paycheck,
    build_paycheck_widget_state,
    normalize_planning_item,
)


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
    """
    Compute assigned items, next-period pool, and available-to-pull from one pass.

    Bills use bill_cycle_payments (via paid_bill_map). Cycle rows are auto-generated
    before paid state is read so missing rows do not drift from the bills list.
    """
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
    current_candidates = _label_items(natural_current)

    widget_state = build_paycheck_widget_state(
        current_paycheck_date=current_start,
        next_paycheck_date=next_start,
        candidate_items=current_candidates,
        assigned_items=current_assigned,
    )

    bill_by_id = {b.id: b for b in bills}
    debt_by_id = {d.id: d for d in debts}

    def _enrich_widget_row(item: dict) -> dict:
        row = dict(item)
        if item["item_type"] == "bill":
            bill = bill_by_id.get(item["item_id"])
            if bill:
                row["category"] = bill.category
        elif item["item_type"] == "debt":
            debt = debt_by_id.get(item["item_id"])
            if debt:
                row["category"] = getattr(debt, "type", None) or "Debt/Loan"
            else:
                row["category"] = "Debt/Loan"
        return row

    available_for_pull = [
        _enrich_widget_row(i) for i in widget_state["widget_items"]
    ]
    available_visible = [
        _enrich_widget_row(i) for i in widget_state["widget_visible_items"]
    ]

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
        "available_items_for_pull": available_for_pull,
        "available_visible_items": available_visible,
        "available_remaining_count": widget_state["widget_remaining_count"],
        "available_unpaid_count": widget_state["widget_total_count"],
        "available_total_due": widget_state["widget_total_due"],
        "available_visible_total_due": widget_state["widget_visible_total_due"],
        "widget_items": available_for_pull,
        "widget_visible_items": available_visible,
        "widget_remaining_count": widget_state["widget_remaining_count"],
        "widget_total_count": widget_state["widget_total_count"],
        "widget_total_due": widget_state["widget_total_due"],
        "widget_visible_total_due": widget_state["widget_visible_total_due"],
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
        "available_items_for_pull": planning["available_items_for_pull"],
        "available_visible_items": planning["available_visible_items"],
        "available_remaining_count": planning["available_remaining_count"],
        "available_unpaid_count": planning["available_unpaid_count"],
        "available_total_due": planning["available_total_due"],
        "available_visible_total_due": planning["available_visible_total_due"],
        "widget_items": planning["widget_items"],
        "widget_visible_items": planning["widget_visible_items"],
        "widget_remaining_count": planning["widget_remaining_count"],
        "widget_total_count": planning["widget_total_count"],
        "widget_total_due": planning["widget_total_due"],
        "widget_visible_total_due": planning["widget_visible_total_due"],
    }


def build_pull_forward_widget_payload(
    current: dict[str, Any],
) -> dict[str, Any]:
    """Backward-compatible widget slice from current_paycheck."""
    visible = current["widget_visible_items"]
    return {
        "current_paycheck_date": current.get("paycheck_date"),
        "next_paycheck_date": current.get("next_paycheck_date"),
        "widget_total_due": current["widget_total_due"],
        "total_due_for_visible_items": current["widget_total_due"],
        "remaining_count": current["widget_remaining_count"],
        "unpaid_count": current["widget_total_count"],
        "widget_items": current["widget_items"],
        "widget_visible_items": visible,
        "available_items": visible,
        "visible_items": visible,
    }
