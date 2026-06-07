"""TEMPORARY debug helpers for Amanda Car biweekly overdue investigation."""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from app.services.bill_cycles import (
    _as_date,
    biweekly_anchor,
    first_biweekly_on_or_after,
    next_due_date_for_bill,
    occurrence_dates_for_bill,
)

DEBUG_BILL_NAME = "Amanda Car"
logger = logging.getLogger("paydrift.debug.amanda_car")


def is_amanda_car(name: str | None) -> bool:
    return (name or "").strip().lower() == DEBUG_BILL_NAME.lower()


def log_amanda_car(event: str, **payload: Any) -> None:
    logger.warning("AMANDA_CAR_DEBUG | %s | %s", event, payload)
    print(f"AMANDA_CAR_DEBUG | {event} | {payload}", flush=True)


def snapshot_amanda_car_bill(
    bill: Any,
    today: date,
    *,
    ctx: dict[str, Any] | None = None,
    assigned_items: list[dict] | None = None,
    source: str = "unknown",
) -> dict[str, Any]:
    """Build a JSON-serializable debug snapshot for Amanda Car."""
    start = _as_date(getattr(bill, "start_date", None))
    dow = getattr(bill, "day_of_week", None)
    anchor = biweekly_anchor(start, dow) if start is not None and dow is not None else None
    next_on_or_after_today = (
        str(first_biweekly_on_or_after(anchor, today)) if anchor is not None else None
    )

    snap: dict[str, Any] = {
        "source": source,
        "bill_id": str(getattr(bill, "id", "")),
        "name": getattr(bill, "name", None),
        "frequency": getattr(bill, "frequency", None),
        "day_of_week": dow,
        "start_date_raw": str(getattr(bill, "start_date", None)),
        "start_date_parsed": str(start) if start else None,
        "biweekly_anchor_computed": str(anchor) if anchor else None,
        "first_biweekly_on_or_after_today": next_on_or_after_today,
        "today": str(today),
        "next_due_date": str(next_due_date_for_bill(bill, today)),
        "is_paid_global": bool(getattr(bill, "is_paid", False)),
        "paid_date_global": str(getattr(bill, "paid_date", None)),
    }

    if ctx:
        current_start = ctx.get("current_start")
        current_end = ctx.get("current_end")
        if current_start and current_end:
            snap["pay_period_current"] = {
                "start": str(current_start),
                "end": str(current_end),
                "occurrences": [
                    str(d)
                    for d in occurrence_dates_for_bill(bill, current_start, current_end)
                ],
            }
        prev = ctx.get("_debug_prev_bounds")
        if prev:
            prev_start, prev_end = prev
            snap["pay_period_previous"] = {
                "start": str(prev_start),
                "end": str(prev_end),
                "occurrences": [
                    str(d)
                    for d in occurrence_dates_for_bill(bill, prev_start, prev_end)
                ],
            }

    if assigned_items is not None:
        snap["dashboard_assigned_rows"] = [
            {
                "due_date": str(item.get("due_date")),
                "is_overdue": item.get("is_overdue"),
                "is_paid": item.get("is_paid"),
                "days_until_due": item.get("days_until_due"),
                "status": item.get("status"),
                "planning_key": item.get("planning_key"),
                "natural_period_start": str(item.get("natural_period_start")),
                "effective_period_start": str(item.get("effective_period_start")),
            }
            for item in assigned_items
            if is_amanda_car(item.get("name"))
        ]

    log_amanda_car("snapshot", **snap)
    return snap
