"""Regression: household members must agree on assigned-item paid state."""

from __future__ import annotations

import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from app.services.paycheck_engine import assign_bills_to_paycheck


def _bill(
    *,
    household_id,
    frequency: str,
    is_paid: bool,
    paid_date: datetime | None,
    due_day: int = 15,
    day_of_week: int | None = None,
    start_date: date | None = None,
):
    bid = uuid4()
    return SimpleNamespace(
        id=bid,
        name="Test bill",
        amount=Decimal("100"),
        frequency=frequency,
        due_day=due_day,
        day_of_week=day_of_week,
        start_date=start_date,
        household_id=household_id,
        payment_mode="single",
        auto_pay=False,
        is_paid=is_paid,
        paid_date=paid_date,
        postpone_until=None,
        hidden_overdue=False,
        user_share_amount=Decimal("100"),
        split_member_count=1,
    )


class TestHouseholdBillPaidSync(unittest.TestCase):
    def test_household_weekly_paid_not_scoped_to_viewer_pay_window(self):
        """Recurring household bill: is_paid is shared; paid_date outside one member's
        pay window must not show unpaid for that member (regression).
        """
        hid = uuid4()
        paid_at = datetime(2026, 1, 5, 12, 0, tzinfo=timezone.utc)
        bill = _bill(
            household_id=hid,
            frequency="weekly",
            is_paid=True,
            paid_date=paid_at,
            due_day=1,
            day_of_week=1,
            start_date=date(2026, 1, 1),
        )
        # Pay window where paid_at is OUTSIDE but a weekly due still falls inside.
        window_a = (date(2026, 1, 20), date(2026, 1, 26))
        window_b = (date(2026, 1, 27), date(2026, 2, 2))
        today = date(2026, 1, 22)

        for ws, we in (window_a, window_b):
            with self.subTest(window=(ws, we)):
                items = assign_bills_to_paycheck(
                    [bill], [], ws, we, today, paid_debt_ids=set()
                )
                bill_rows = [i for i in items if i["item_type"] == "bill"]
                self.assertTrue(
                    any(i["is_paid"] for i in bill_rows),
                    "household weekly bill marked paid must show paid in every member window",
                )

    def test_personal_weekly_still_scopes_paid_date_to_window(self):
        """Personal recurring bill: paid_date outside the pay window stays unpaid."""
        paid_at = datetime(2026, 1, 5, 12, 0, tzinfo=timezone.utc)
        bill = _bill(
            household_id=None,
            frequency="weekly",
            is_paid=True,
            paid_date=paid_at,
            due_day=1,
            day_of_week=1,
            start_date=date(2026, 1, 1),
        )
        window = (date(2026, 1, 20), date(2026, 1, 26))
        today = date(2026, 1, 22)
        items = assign_bills_to_paycheck(
            [bill], [], window[0], window[1], today, paid_debt_ids=set()
        )
        for row in items:
            if row["item_type"] == "bill":
                self.assertFalse(
                    row["is_paid"],
                    "personal weekly must not treat old paid_date as this period",
                )


if __name__ == "__main__":
    unittest.main()
