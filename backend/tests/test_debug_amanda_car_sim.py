"""TEMPORARY: simulate Amanda Car dashboard overdue paths."""

from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from app.services.bill_cycles import next_due_date_for_bill
from app.services.debug_bill_dates import snapshot_amanda_car_bill
from app.services.paycheck_engine import (
    _most_recent_pay_date,
    assign_bills_to_paycheck,
    generate_pay_dates,
    get_pay_period_window,
    pay_period_index_containing,
    previous_period_bounds,
)
from app.services.paycheck_planning_state import consolidate_cadence_bill_assignments


def _bill(start_date: date):
    bill_id = uuid4()
    return (
        SimpleNamespace(
            id=bill_id,
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
        ),
        bill_id,
    )


def _simulate_dashboard_rows(paycheck_anchor: date, today: date, start_date: date) -> dict:
    bill, bill_id = _bill(start_date)
    most_recent = _most_recent_pay_date(paycheck_anchor, "biweekly", today)
    pay_dates = generate_pay_dates(most_recent, "biweekly", 6)
    idx = pay_period_index_containing(pay_dates, today)
    current_start = pay_dates[idx]
    current_end = get_pay_period_window(pay_dates[idx], pay_dates[idx + 1])[1]
    bounds = previous_period_bounds(current_start, "biweekly", anchor_pay_date=paycheck_anchor)

    assigned = list(
        assign_bills_to_paycheck(
            [bill], [], current_start, current_end, today, paid_bill_map={}
        )
    )

    # Carryover skipped for cadence bills in production; simulate only non-cadence path.
    assigned = consolidate_cadence_bill_assignments(assigned, {bill_id: bill}, today)

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


def test_amanda_car_next_due_june5_when_today_june3():
    start_date = date(2026, 5, 22)
    snap = _simulate_dashboard_rows(date(2026, 5, 22), date(2026, 6, 3), start_date)

    assert snap["next_due_date"] == "2026-06-05"
    rows = snap["dashboard_assigned_rows"]
    assert len(rows) == 1
    assert rows[0]["due_date"] == "2026-06-05"
    assert rows[0]["is_overdue"] is False


def test_amanda_car_not_overdue_after_june5_when_next_due_june19():
    start_date = date(2026, 5, 22)
    snap = _simulate_dashboard_rows(date(2026, 5, 22), date(2026, 6, 6), start_date)

    assert snap["next_due_date"] == "2026-06-19"
    rows = snap["dashboard_assigned_rows"]
    assert len(rows) == 1
    assert rows[0]["due_date"] == "2026-06-19"
    assert rows[0]["is_overdue"] is False
