"""Single source of truth for current-paycheck assigned + pull-forward widget."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pay_period_item_override import PayPeriodItemOverride
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
    compute_available_to_pull,
)


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

    def _label_items(items: list[dict]) -> list[dict]:
        return [
            apply_planning_due_labels(
                item,
                today=today,
                cycle_year=cycle_year,
                cycle_month=cycle_month,
            )
            for item in items
        ]

    current_assigned = _label_items(current_assigned)
    next_period = _label_items(next_period)

    available, remaining, total_due_visible = compute_available_to_pull(
        next_period,
        current_assigned,
    )

    bill_by_id = {b.id: b for b in bills}
    debt_by_id = {d.id: d for d in debts}

    def _enrich_widget_row(item: dict) -> dict:
        row = dict(item)
        if item["item_type"] == "bill":
            bill = bill_by_id.get(item["id"])
            if bill:
                row["category"] = bill.category
        elif item["item_type"] == "debt":
            debt = debt_by_id.get(item["id"])
            if debt:
                row["category"] = getattr(debt, "type", None) or "Debt/Loan"
            else:
                row["category"] = "Debt/Loan"
        return row

    available_items = [_enrich_widget_row(i) for i in available]

    paid_count = sum(1 for i in current_assigned if i.get("is_paid"))
    total_count = len(current_assigned)
    progress_percent = (
        round(100.0 * paid_count / total_count, 1) if total_count else 0.0
    )

    return {
        "assigned_items": current_assigned,
        "next_period_items": next_period,
        "available_items": available_items,
        "available_remaining_count": remaining,
        "available_total_due": total_due_visible,
        "paid_bill_map": paid_bill_map,
        "progress_percent": progress_percent,
        "paid_count": paid_count,
        "total_assigned_count": total_count,
    }


def build_pull_forward_widget_payload(
    planning: dict[str, Any],
    *,
    next_paycheck_date: date | None,
) -> dict[str, Any]:
    """Shape canonical planning state for the dashboard pull-forward widget."""
    available = planning["available_items"]
    remaining = planning["available_remaining_count"]
    return {
        "next_paycheck_date": next_paycheck_date,
        "total_due_for_visible_items": planning["available_total_due"],
        "remaining_count": remaining,
        "unpaid_count": len(available) + remaining,
        "progress_percent": planning["progress_percent"],
        "available_items": available,
        "visible_items": available,
    }
