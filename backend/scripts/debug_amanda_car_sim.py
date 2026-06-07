"""TEMPORARY: simulate Amanda Car date math without a database."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from app.services.bill_cycles import next_due_date_for_bill, occurrence_dates_for_bill
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


def simulate(paycheck_anchor: date, today: date, start_date: date) -> None:
    bill = _bill(start_date)
    dates = generate_pay_dates(paycheck_anchor, "biweekly", 4)
    current_start = dates[0]
    while current_start <= today and len(dates) > 1:
        dates = dates[1:]
        current_start = dates[0]
    current_end = get_pay_period_window(dates[0], dates[1])[1] if len(dates) > 1 else dates[0]
    bounds = previous_period_bounds(current_start, "biweekly", anchor_pay_date=paycheck_anchor)

    print("=" * 72)
    print(
        f"today={today} start_date={start_date} paycheck_anchor={paycheck_anchor} "
        f"current_period={current_start}..{current_end}"
    )
    print(f"next_due_date_for_bill: {next_due_date_for_bill(bill, today)}")

    if bounds:
        prev_start, prev_end = bounds
        prev_items = assign_bills_to_paycheck(
            [bill], [], prev_start, prev_end, today, paid_bill_map={}
        )
        print(f"prev period {prev_start}..{prev_end} items: {prev_items}")

    curr_items = assign_bills_to_paycheck(
        [bill], [], current_start, current_end, today, paid_bill_map={}
    )
    print(f"current period items: {curr_items}")

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
    assigned.extend(curr_items)

    snap = snapshot_amanda_car_bill(
        bill,
        today,
        ctx={
            "current_start": current_start,
            "current_end": current_end,
            "_debug_prev_bounds": bounds,
        },
        assigned_items=assigned,
        source="debug_amanda_car_sim",
    )
    print("snapshot next_due_date:", snap["next_due_date"])
    print("dashboard_assigned_rows:", snap.get("dashboard_assigned_rows"))


if __name__ == "__main__":
    today = date.today()
    start_date = date(2026, 5, 22)
    simulate(paycheck_anchor=date(2026, 5, 22), today=today, start_date=start_date)
    simulate(paycheck_anchor=date(2026, 5, 22), today=date(2026, 6, 3), start_date=start_date)
