"""TEMPORARY: simulate Amanda Car dashboard overdue paths."""

from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from app.services.bill_cycles import next_due_date_for_bill
from app.services.debug_bill_dates import snapshot_amanda_car_bill
from app.services.paycheck_engine import (
    assign_bills_to_paycheck,
    generate_pay_dates,
    get_pay_period_window,
    previous_period_bounds,
)


def _bill(start_date: date):
    return SimpleNamespace(
        id=uuid4(),
        name="Amanda Car",
        amount=Decimal("100"),
        frequency="biweekly",
        day_of_week=4,
        start_date=start_date,
        due_day=None,
        auto_pay=False,
        household_id=None,
        payment_mode="single",
        is_active=True,
        postpone_until=None,
        hidden_overdue=False,
        is_paid=False,
        paid_date=None,
    )


def _simulate_carryover(paycheck_anchor: date, today: date, start_date: date) -> dict:
    bill = _bill(start_date)
    dates = generate_pay_dates(paycheck_anchor, "biweekly", 6)
    current_start = dates[0]
    while current_start < today and len(dates) > 1:
        dates = dates[1:]
        current_start = dates[0]
    current_end = get_pay_period_window(dates[0], dates[1])[1]
    bounds = previous_period_bounds(current_start, "biweekly", anchor_pay_date=paycheck_anchor)

    assigned = []
    if bounds:
        prev_start, prev_end = bounds
        for raw in assign_bills_to_paycheck(
            [bill], [], prev_start, prev_end, today, paid_bill_map={}
        ):
            if raw.get("is_paid"):
                continue
            due = raw.get("due_date")
            if due and due >= current_start:
                continue
            carry = dict(raw)
            carry["is_overdue"] = True
            assigned.append(carry)

    assigned.extend(
        assign_bills_to_paycheck(
            [bill], [], current_start, current_end, today, paid_bill_map={}
        )
    )

    return snapshot_amanda_car_bill(
        bill,
        today,
        ctx={
            "current_start": current_start,
            "current_end": current_end,
            "_debug_prev_bounds": bounds,
        },
        assigned_items=assigned,
        source="test_debug_amanda_car_sim",
    )


def test_amanda_car_next_due_june5_when_today_june3(capsys):
    start_date = date(2026, 5, 22)
    snap = _simulate_carryover(date(2026, 5, 22), date(2026, 6, 3), start_date)

    assert snap["next_due_date"] == "2026-06-05"
    assert snap["first_biweekly_on_or_after_today"] == "2026-06-05"

    rows = snap["dashboard_assigned_rows"]
    # Two rows: May 22 carryover (overdue) + June 5 current period (not overdue)
    assert len(rows) == 2
    assert rows[0]["due_date"] == "2026-05-22"
    assert rows[0]["is_overdue"] is True
    assert rows[1]["due_date"] == "2026-06-05"
    assert rows[1]["is_overdue"] is False

    print("\n--- Amanda Car debug (today=2026-06-03) ---")
    for key in (
        "next_due_date",
        "first_biweekly_on_or_after_today",
        "pay_period_current",
        "pay_period_previous",
        "dashboard_assigned_rows",
    ):
        print(f"{key}: {snap.get(key)}")


def test_amanda_car_overdue_when_may22_carryover_unpaid(capsys):
    """May 22 unpaid in previous period is injected as overdue carryover."""
    start_date = date(2026, 5, 22)
    snap = _simulate_carryover(date(2026, 5, 22), date(2026, 6, 3), start_date)

    prev = snap.get("pay_period_previous") or {}
    assert prev.get("occurrences") == ["2026-05-22"]

    rows = snap["dashboard_assigned_rows"]
    overdue_rows = [r for r in rows if r.get("is_overdue")]
    assert overdue_rows, "expected at least one overdue carryover row when May 22 unpaid"

    print("\n--- Amanda Car overdue carryover case ---")
    print(f"next_due_date: {snap['next_due_date']}")
    print(f"dashboard_assigned_rows: {rows}")
