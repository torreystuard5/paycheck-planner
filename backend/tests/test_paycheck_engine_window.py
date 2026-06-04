"""Paycheck engine window assignment (no DB / Settings required)."""

from __future__ import annotations

import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from app.services.paycheck_engine import (
    _bill_due_dates_in_window,
    assign_bills_to_paycheck,
)


def _bill(**kw):
    base = {
        "id": uuid4(),
        "name": "Bill",
        "amount": Decimal("100"),
        "due_day": 1,
        "frequency": "monthly",
        "auto_pay": False,
        "household_id": None,
        "payment_mode": "single",
        "is_active": True,
        "postpone_until": None,
        "start_date": None,
        "day_of_week": None,
        "hidden_overdue": False,
    }
    base.update(kw)
    return SimpleNamespace(**base)


def _debt(**kw):
    base = {
        "id": uuid4(),
        "name": "Debt",
        "minimum_payment": Decimal("25"),
        "due_day": 7,
        "auto_pay": False,
        "is_active": True,
        "postpone_until": None,
        "is_split": False,
        "apr": Decimal("0"),
        "balance": Decimal("500"),
    }
    base.update(kw)
    return SimpleNamespace(**base)


class TestPaycheckEngineWindow(unittest.TestCase):
    def test_rent_jun5_in_jun4_17_window_despite_start_date_anchor(self):
        rent = _bill(name="Rent", amount=Decimal("800"), due_day=5, start_date=date(2026, 6, 10))
        self.assertEqual(
            _bill_due_dates_in_window(rent, date(2026, 6, 4), date(2026, 6, 17)),
            [date(2026, 6, 5)],
        )
        items = assign_bills_to_paycheck(
            [rent], [], date(2026, 6, 4), date(2026, 6, 17), date(2026, 6, 4)
        )
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["amount"], Decimal("800"))

    def test_monthly_bill_outside_window_excluded(self):
        bill = _bill(name="Perplexity Pro", due_day=20)
        self.assertEqual(
            _bill_due_dates_in_window(bill, date(2026, 6, 4), date(2026, 6, 17)),
            [],
        )

    def test_debt_uses_minimum_payment(self):
        debt = _debt(name="Capital One 9844", minimum_payment=Decimal("25"), due_day=7)
        items = assign_bills_to_paycheck(
            [], [debt], date(2026, 6, 4), date(2026, 6, 17), date(2026, 6, 4)
        )
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["amount"], Decimal("25"))
        self.assertEqual(items[0]["item_type"], "debt")

    def test_postponed_debt_skipped_until_postpone_date(self):
        debt = _debt(
            name="Torrey Car",
            minimum_payment=Decimal("602.29"),
            due_day=6,
            postpone_until=date(2026, 7, 6),
        )
        items = assign_bills_to_paycheck(
            [], [debt], date(2026, 6, 4), date(2026, 6, 17), date(2026, 6, 4)
        )
        self.assertEqual(items, [])


if __name__ == "__main__":
    unittest.main()
