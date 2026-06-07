"""Dashboard assigned-item consolidation for weekly/biweekly bills."""

from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from app.services.paycheck_engine import (
    _most_recent_pay_date,
    generate_pay_dates,
    get_pay_period_window,
    pay_period_index_containing,
)
from app.services.paycheck_planning_state import consolidate_cadence_bill_assignments


def _amanda_car(start_date: date = date(2026, 5, 22)):
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
        ),
        bill_id,
    )


def test_pay_period_index_contains_today_between_paychecks():
    anchor = date(2026, 5, 22)
    today = date(2026, 6, 6)
    most_recent = _most_recent_pay_date(anchor, "biweekly", today)
    pay_dates = generate_pay_dates(most_recent, "biweekly", 6)
    idx = pay_period_index_containing(pay_dates, today)

    assert most_recent == date(2026, 6, 5)
    assert idx == 0
    window = get_pay_period_window(pay_dates[0], pay_dates[1])
    assert window == (date(2026, 6, 5), date(2026, 6, 18))


def test_consolidate_amanda_car_drops_phantom_june5_when_next_due_june19():
    bill, bill_id = _amanda_car()
    today = date(2026, 6, 6)
    items = [
        {
            "id": bill_id,
            "name": "Amanda Car",
            "item_type": "bill",
            "due_date": date(2026, 6, 5),
            "is_paid": False,
            "is_overdue": True,
            "amount": Decimal("100"),
        },
        {
            "id": bill_id,
            "name": "Amanda Car",
            "item_type": "bill",
            "due_date": date(2026, 6, 19),
            "is_paid": False,
            "is_overdue": False,
            "amount": Decimal("100"),
        },
    ]

    out = consolidate_cadence_bill_assignments(items, {bill_id: bill}, today)

    assert len(out) == 1
    assert out[0]["due_date"] == date(2026, 6, 19)
    assert out[0]["is_overdue"] is False


def test_consolidate_amanda_car_keeps_june5_when_still_upcoming():
    bill, bill_id = _amanda_car()
    today = date(2026, 6, 3)
    items = [
        {
            "id": bill_id,
            "name": "Amanda Car",
            "item_type": "bill",
            "due_date": date(2026, 5, 22),
            "is_paid": False,
            "is_overdue": True,
            "amount": Decimal("100"),
        },
        {
            "id": bill_id,
            "name": "Amanda Car",
            "item_type": "bill",
            "due_date": date(2026, 6, 5),
            "is_paid": False,
            "is_overdue": False,
            "amount": Decimal("100"),
        },
    ]

    out = consolidate_cadence_bill_assignments(items, {bill_id: bill}, today)

    assert len(out) == 1
    assert out[0]["due_date"] == date(2026, 6, 5)
    assert out[0]["is_overdue"] is False
