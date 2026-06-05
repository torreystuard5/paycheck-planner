"""Pay-period item assignment: pull-forward overrides and effective lists.

Neutral module — no imports from pay_period_planner or paycheck_planning_state
so planning state and calendar builder can share assignment logic safely.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from app.models.pay_period_item_override import PayPeriodItemOverride
from app.services.paycheck_engine import normalize_paycheck_line_item, occurrence_key


def parse_item_due_date(item: dict) -> date:
    d = item["due_date"]
    if isinstance(d, date):
        return d
    if isinstance(d, datetime):
        return d.date()
    return date.fromisoformat(str(d)[:10])


def enrich_assigned_item(
    item: dict,
    *,
    natural_period_start: date,
    effective_period_start: date,
    pulled_forward: bool,
    override_row: PayPeriodItemOverride | None = None,
    can_pull_forward: bool = False,
) -> dict:
    out = dict(item)
    due = parse_item_due_date(item)
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
    return normalize_paycheck_line_item(out)


def override_map(
    overrides: list[PayPeriodItemOverride],
) -> dict[str, PayPeriodItemOverride]:
    return {
        occurrence_key(o.item_type, o.item_id, o.occurrence_due_date): o
        for o in overrides
    }


def apply_effective_lists(
    natural_current: list[dict],
    natural_next: list[dict],
    current_start: date,
    next_start: date | None,
    overrides: list[PayPeriodItemOverride],
) -> tuple[list[dict], list[dict]]:
    """Build effective current and next item lists (no double counting)."""
    omap = override_map(overrides)
    pulled_keys = {
        k
        for k, o in omap.items()
        if o.effective_period_start == current_start
        and o.natural_period_start == next_start
    }

    current_effective: list[dict] = []
    for item in natural_current:
        key = occurrence_key(item["item_type"], item["id"], parse_item_due_date(item))
        if key in pulled_keys:
            continue
        current_effective.append(
            enrich_assigned_item(
                item,
                natural_period_start=current_start,
                effective_period_start=current_start,
                pulled_forward=False,
            )
        )

    for item in natural_next:
        key = occurrence_key(item["item_type"], item["id"], parse_item_due_date(item))
        if key in pulled_keys:
            current_effective.append(
                enrich_assigned_item(
                    item,
                    natural_period_start=next_start,
                    effective_period_start=current_start,
                    pulled_forward=True,
                    override_row=omap.get(key),
                )
            )

    next_effective: list[dict] = []
    for item in natural_next:
        key = occurrence_key(item["item_type"], item["id"], parse_item_due_date(item))
        if key in pulled_keys:
            continue
        next_effective.append(
            enrich_assigned_item(
                item,
                natural_period_start=next_start,
                effective_period_start=next_start,
                pulled_forward=False,
                can_pull_forward=True,
            )
        )

    return current_effective, next_effective
