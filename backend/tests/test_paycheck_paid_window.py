"""Tests for per-cycle bill payment detection via paid_bill_map.

Validates that the paycheck engine determines bill paid state from a
payment-window map (payments table) rather than the global Bill.is_paid flag.
"""

from __future__ import annotations

import asyncio
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from app.services.paycheck_engine import assign_bills_to_paycheck, build_paycheck_plan


def _bill(
    *,
    bill_id=None,
    household_id=None,
    frequency: str = "monthly",
    is_paid: bool = False,
    paid_date=None,
    due_day: int = 15,
    day_of_week: int | None = None,
    start_date: date | None = None,
    amount: Decimal = Decimal("100"),
):
    bid = bill_id or uuid4()
    return SimpleNamespace(
        id=bid,
        name="Test bill",
        amount=amount,
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
        user_share_amount=amount,
        split_member_count=1,
    )


def _user(user_id=None, household_id=None):
    return SimpleNamespace(
        id=user_id or uuid4(),
        household_id=household_id,
        net_pay_amount=Decimal("2000"),
        pay_frequency="biweekly",
        next_pay_date=date(2026, 5, 1),
        currency="USD",
    )


class TestBillPaidInPeriodAUnpaidInPeriodB(unittest.TestCase):
    """Test 1: Bill paid in period A appears unpaid in period B."""

    def test_bill_paid_in_period_a_unpaid_in_period_b(self):
        bid = uuid4()
        bill = _bill(bill_id=bid, due_day=10)

        # Payment exists with paid_date in period A (May 1-14)
        paid_bill_map = {bid: [date(2026, 5, 8)]}

        # Period A: May 1 – May 14
        items_a = assign_bills_to_paycheck(
            [bill], [], date(2026, 5, 1), date(2026, 5, 14),
            date(2026, 5, 7), paid_debt_ids=set(), paid_bill_map=paid_bill_map,
        )
        bill_rows_a = [i for i in items_a if i["item_type"] == "bill"]
        self.assertTrue(
            any(i["is_paid"] for i in bill_rows_a),
            "Bill with payment in period A must show as paid in period A",
        )

        # Period B: May 15 – May 28
        items_b = assign_bills_to_paycheck(
            [bill], [], date(2026, 5, 15), date(2026, 5, 28),
            date(2026, 5, 20), paid_debt_ids=set(), paid_bill_map=paid_bill_map,
        )
        bill_rows_b = [i for i in items_b if i["item_type"] == "bill"]
        # Bill due_day=10 doesn't fall in May 15-28, so no rows expected.
        # But let's also test with a bill that appears in both periods.
        # Use due_day=20 to appear in period B.
        bid2 = uuid4()
        bill2 = _bill(bill_id=bid2, due_day=20)
        paid_bill_map2 = {bid2: [date(2026, 5, 5)]}  # paid in period A only

        items_b2 = assign_bills_to_paycheck(
            [bill2], [], date(2026, 5, 15), date(2026, 5, 28),
            date(2026, 5, 20), paid_debt_ids=set(), paid_bill_map=paid_bill_map2,
        )
        bill_rows_b2 = [i for i in items_b2 if i["item_type"] == "bill"]
        self.assertTrue(len(bill_rows_b2) > 0, "Bill due_day=20 must appear in period B")
        for row in bill_rows_b2:
            self.assertFalse(
                row["is_paid"],
                "Bill paid in period A must show as UNPAID in period B",
            )


class TestHouseholdBillPaidByMemberAVisibleToMemberB(unittest.TestCase):
    """Test 2: Household bill paid by member A visible to member B for that period only."""

    def test_household_bill_paid_by_member_a_visible_to_member_b(self):
        hid = uuid4()
        bid = uuid4()
        member_a_id = uuid4()
        member_b_id = uuid4()

        bill = _bill(bill_id=bid, household_id=hid, due_day=10)

        # Member A paid the bill on May 8 — the paid_bill_map is built from
        # the payments table scoped to ALL household member user_ids, so both
        # members get the same map.
        paid_bill_map = {bid: [date(2026, 5, 8)]}

        # Period 1: May 1 – May 14 (contains the payment)
        items_p1 = assign_bills_to_paycheck(
            [bill], [], date(2026, 5, 1), date(2026, 5, 14),
            date(2026, 5, 7), paid_debt_ids=set(), paid_bill_map=paid_bill_map,
        )
        bill_rows_p1 = [i for i in items_p1 if i["item_type"] == "bill"]
        self.assertTrue(
            any(i["is_paid"] for i in bill_rows_p1),
            "Household bill paid by member A must show paid for member B in period 1",
        )

        # Period 2: May 15 – May 28 (no payment in this window)
        items_p2 = assign_bills_to_paycheck(
            [bill], [], date(2026, 5, 15), date(2026, 5, 28),
            date(2026, 5, 20), paid_debt_ids=set(), paid_bill_map=paid_bill_map,
        )
        # due_day=10 won't produce items in May 15-28, so check with a second bill
        bid2 = uuid4()
        bill2 = _bill(bill_id=bid2, household_id=hid, due_day=20)
        # Same map — bill2 has no payments at all
        items_p2b = assign_bills_to_paycheck(
            [bill2], [], date(2026, 5, 15), date(2026, 5, 28),
            date(2026, 5, 20), paid_debt_ids=set(), paid_bill_map=paid_bill_map,
        )
        bill_rows_p2b = [i for i in items_p2b if i["item_type"] == "bill"]
        for row in bill_rows_p2b:
            self.assertFalse(
                row["is_paid"],
                "Household bill with no payment in period 2 must show unpaid",
            )


class TestNewPaycheckEntryDoesNotCarryPaidStateForward(unittest.TestCase):
    """Test 3: New paycheck entry does not carry paid state forward."""

    def test_new_paycheck_entry_does_not_carry_paid_state_forward(self):
        bid = uuid4()
        user = _user()
        # Bill due on the 5th of each month
        bill = _bill(bill_id=bid, due_day=5, is_paid=True, paid_date=datetime(2026, 5, 5, tzinfo=timezone.utc))

        # Payment exists in period A (May 1-14)
        paid_bill_map = {bid: [date(2026, 5, 5)]}

        # Simulate a PaycheckEntry for period B
        entry_b = SimpleNamespace(
            pay_date=date(2026, 5, 15),
            net_amount=Decimal("2000"),
        )

        plan = asyncio.run(
            build_paycheck_plan(
                user=user,
                income_sources=[],
                bills=[bill],
                debts=[],
                num_periods=2,
                current_date=date(2026, 5, 3),
                paycheck_entries=[entry_b],
                paid_debt_ids=set(),
                paid_bill_map=paid_bill_map,
            )
        )

        # Period A (the first paycheck) should show bill as paid
        pc_a = plan["paychecks"][0]
        bill_items_a = [i for i in pc_a["assigned_items"] if i["id"] == bid]
        self.assertTrue(
            any(i["is_paid"] for i in bill_items_a),
            "Bill must be paid in period A where payment exists",
        )

        # Period B (second paycheck) should show bill as unpaid
        if len(plan["paychecks"]) > 1:
            pc_b = plan["paychecks"][1]
            bill_items_b = [i for i in pc_b["assigned_items"] if i["id"] == bid]
            for item in bill_items_b:
                self.assertFalse(
                    item["is_paid"],
                    "Bill must be UNPAID in period B — paid state must not carry forward",
                )


class TestEngineIgnoresGlobalBillIsPaidWhenNoPaymentRowExists(unittest.TestCase):
    """Test 4: Engine ignores global Bill.is_paid when no payment row exists."""

    def test_engine_ignores_global_bill_is_paid_when_no_payment_row_exists(self):
        bid = uuid4()
        # Bill has is_paid=True globally, but no payment row
        bill = _bill(
            bill_id=bid, due_day=10, is_paid=True,
            paid_date=datetime(2026, 5, 8, tzinfo=timezone.utc),
        )

        # Empty paid_bill_map — no payment rows exist
        paid_bill_map = {}

        items = assign_bills_to_paycheck(
            [bill], [], date(2026, 5, 1), date(2026, 5, 14),
            date(2026, 5, 7), paid_debt_ids=set(), paid_bill_map=paid_bill_map,
        )
        bill_rows = [i for i in items if i["item_type"] == "bill"]
        self.assertTrue(len(bill_rows) > 0, "Bill must appear in assigned items")
        for row in bill_rows:
            self.assertFalse(
                row["is_paid"],
                "Engine must report bill as UNPAID when no payment row exists, "
                "even though Bill.is_paid=True globally",
            )


if __name__ == "__main__":
    unittest.main()
