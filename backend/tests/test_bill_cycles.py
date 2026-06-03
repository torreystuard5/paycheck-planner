from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from app.services.bill_cycles import (
    current_month_due_date,
    cycle_window_start,
    due_date_for_month,
    next_due_date_for_bill,
    occurrence_dates_for_bill,
)
from app.services.paycheck_engine import assign_bills_to_paycheck


def _bill(**overrides):
    data = {
        "id": uuid4(),
        "name": "Rent",
        "amount": Decimal("1200"),
        "frequency": "monthly",
        "due_day": 5,
        "day_of_week": None,
        "start_date": None,
        "household_id": None,
        "payment_mode": "single",
        "auto_pay": False,
        "postpone_until": None,
        "hidden_overdue": False,
        "user_share_amount": Decimal("1200"),
        "split_member_count": 1,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def test_paid_bill_map_uses_exact_cycle_due_date():
    bill_id = uuid4()
    bill = _bill(id=bill_id, due_day=5)
    paid_bill_map = {
        bill_id: [
            {
                "due_date": date(2026, 6, 5),
                "paid_date": datetime(2026, 6, 2, tzinfo=timezone.utc),
                "source": "bill_cycle_payments",
            }
        ]
    }

    june = assign_bills_to_paycheck(
        [bill],
        [],
        date(2026, 6, 1),
        date(2026, 6, 14),
        date(2026, 6, 2),
        paid_bill_map=paid_bill_map,
    )
    july = assign_bills_to_paycheck(
        [bill],
        [],
        date(2026, 7, 1),
        date(2026, 7, 14),
        date(2026, 7, 2),
        paid_bill_map=paid_bill_map,
    )

    assert [item["is_paid"] for item in june if item["item_type"] == "bill"] == [True]
    assert [item["is_paid"] for item in july if item["item_type"] == "bill"] == [False]


def test_semimonthly_bill_generates_two_monthly_occurrences():
    bill = _bill(frequency="semi_monthly", due_day=1)

    assert occurrence_dates_for_bill(bill, date(2026, 6, 1), date(2026, 6, 30)) == [
        date(2026, 6, 1),
        date(2026, 6, 16),
    ]


def test_quarterly_and_annual_do_not_repeat_every_month():
    quarterly = _bill(frequency="quarterly", due_day=10, start_date=date(2026, 1, 10))
    annual = _bill(frequency="annual", due_day=15, start_date=date(2026, 5, 15))

    assert occurrence_dates_for_bill(quarterly, date(2026, 1, 1), date(2026, 6, 30)) == [
        date(2026, 1, 10),
        date(2026, 4, 10),
    ]
    assert occurrence_dates_for_bill(annual, date(2026, 1, 1), date(2027, 6, 30)) == [
        date(2026, 5, 15),
        date(2027, 5, 15),
    ]


def test_next_due_uses_cycle_occurrence_not_global_paid_state():
    bill = _bill(frequency="one_time", start_date=date(2099, 3, 1), due_day=None)

    assert next_due_date_for_bill(bill, today=date(2099, 2, 1)) == date(2099, 3, 1)


def test_monthly_bill_appears_in_current_month_without_cycle_row():
    bill = _bill(due_day=5, frequency="monthly")
    window_start = cycle_window_start(date(2026, 6, 10))

    assert window_start == date(2026, 6, 1)
    assert occurrence_dates_for_bill(bill, window_start, date(2026, 6, 30)) == [date(2026, 6, 5)]
    assert current_month_due_date(bill, date(2026, 6, 10)) == date(2026, 6, 5)
    assert next_due_date_for_bill(bill, today=date(2026, 6, 10)) == date(2026, 6, 5)


def test_due_date_for_month_clamps_to_last_day_of_month():
    bill = _bill(due_day=31, frequency="monthly")

    assert due_date_for_month(bill, 2026, 2) == date(2026, 2, 28)
    assert due_date_for_month(bill, 2026, 4) == date(2026, 4, 30)


def test_assign_bills_includes_monthly_rent_in_june_window():
    from app.services.paycheck_engine import assign_bills_to_paycheck

    bill = _bill(due_day=5, frequency="monthly", name="Rent", amount=Decimal("800"))
    items = assign_bills_to_paycheck(
        [bill],
        [],
        date(2026, 6, 4),
        date(2026, 6, 17),
        date(2026, 6, 2),
        paid_bill_map={},
    )
    bill_items = [i for i in items if i["item_type"] == "bill" and i["name"] == "Rent"]
    assert len(bill_items) == 1
    assert bill_items[0]["due_date"] == date(2026, 6, 5)
    assert bill_items[0]["is_paid"] is False
