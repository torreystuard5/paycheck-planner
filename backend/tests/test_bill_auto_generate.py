"""Tests for auto-generating missing bill_cycle_payment rows."""

from __future__ import annotations

import asyncio
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.models.bill_cycle_payment import BillCyclePayment
from app.services.bill_cycles import auto_generate_missing_cycle_rows


def _bill(**overrides):
    data = {
        "id": uuid4(),
        "user_id": uuid4(),
        "household_id": None,
        "budget_id": None,
        "name": "Rent",
        "amount": Decimal("800"),
        "frequency": "monthly",
        "due_day": 5,
        "day_of_week": None,
        "start_date": None,
        "postpone_until": None,
        "assigned_member_id": None,
        "assigned_member": None,
        "payment_mode": "single",
        "category": "Housing",
        "auto_pay": False,
        "reminder_days": 3,
        "is_active": True,
        "is_tax_deductible": False,
        "tax_category": None,
        "hidden_overdue": False,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def _user(**overrides):
    data = {"id": uuid4(), "household_id": None, "timezone": "America/Chicago"}
    data.update(overrides)
    return SimpleNamespace(**data)


class TestAutoGenerateMissingCycleRows(unittest.TestCase):
    def test_monthly_bill_without_cycle_row_is_inserted(self):
        bill = _bill()
        user = _user()
        cycle_year, cycle_month = 2026, 6

        async def run():
            db = AsyncMock()
            db.flush = AsyncMock()

            with patch(
                "app.services.bill_cycles.get_cycle_payments_for_month",
                new_callable=AsyncMock,
                return_value={},
            ) as mock_existing:
                inserted = await auto_generate_missing_cycle_rows(
                    db, [bill], user, cycle_year, cycle_month
                )

            self.assertEqual(inserted, 1)
            mock_existing.assert_awaited_once_with(
                db, [bill.id], cycle_year, cycle_month
            )
            db.execute.assert_awaited_once()
            stmt = db.execute.await_args.args[0]
            self.assertIn("bill_cycle_payments", str(stmt))

        asyncio.run(run())

    def test_existing_cycle_row_is_not_duplicated(self):
        bill = _bill()
        user = _user()
        due_date = date(2026, 6, 5)
        existing_payment = BillCyclePayment(
            bill_id=bill.id,
            user_id=bill.user_id,
            due_date=due_date,
            cycle_year=2026,
            cycle_month=6,
            amount_due=Decimal("800"),
            amount_paid=Decimal("0"),
            is_paid=False,
            source="manual",
        )

        async def run():
            db = AsyncMock()
            db.flush = AsyncMock()

            with patch(
                "app.services.bill_cycles.get_cycle_payments_for_month",
                new_callable=AsyncMock,
                return_value={(bill.id, due_date): existing_payment},
            ):
                inserted = await auto_generate_missing_cycle_rows(
                    db, [bill], user, 2026, 6
                )

            self.assertEqual(inserted, 0)
            db.execute.assert_not_awaited()

        asyncio.run(run())

    def test_list_bills_includes_bill_after_auto_generate(self):
        from app.routers.bills import _bill_responses_for_current_cycle

        bill = _bill(name="Rent", amount=Decimal("800"), due_day=5)
        user = _user(id=bill.user_id)
        due_date = date(2026, 6, 5)
        cycle_payment = BillCyclePayment(
            bill_id=bill.id,
            user_id=bill.user_id,
            due_date=due_date,
            cycle_year=2026,
            cycle_month=6,
            amount_due=Decimal("800"),
            amount_paid=Decimal("0"),
            is_paid=False,
            source="auto_generated",
        )

        async def run():
            db = AsyncMock()

            with patch(
                "app.routers.bills.auto_generate_missing_cycle_rows",
                new_callable=AsyncMock,
                return_value=1,
            ), patch(
                "app.routers.bills.get_cycle_payments_for_month",
                new_callable=AsyncMock,
                return_value={(bill.id, due_date): cycle_payment},
            ), patch(
                "app.routers.bills._get_household_member_count",
                new_callable=AsyncMock,
                return_value=1,
            ), patch(
                "app.routers.bills.local_today",
                return_value=date(2026, 6, 2),
            ):
                responses = await _bill_responses_for_current_cycle(db, [bill], user)

            self.assertEqual(len(responses), 1)
            self.assertEqual(responses[0].name, "Rent")
            self.assertFalse(responses[0].is_paid)
            self.assertEqual(responses[0].occurrence_due_date, due_date)
            self.assertEqual(responses[0].cycle_source, "auto_generated")

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
