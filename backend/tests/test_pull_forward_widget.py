"""Tests for paycheck pull-forward widget rolling list."""

from __future__ import annotations

import asyncio
import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from app.models.bill_cycle_payment import BillCyclePayment
from app.services.pay_period_planner import (
    _active_cycle_overdue,
    _widget_relevant_due,
)


def _bill(**overrides):
    data = {
        "id": uuid4(),
        "user_id": uuid4(),
        "household_id": None,
        "name": "Rent",
        "amount": Decimal("800"),
        "frequency": "monthly",
        "due_day": 5,
        "category": "Housing",
        "auto_pay": False,
        "payment_mode": "single",
        "user_share_amount": Decimal("800"),
        "is_user_responsible": True,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def _user(**overrides):
    data = {"id": uuid4(), "household_id": None, "pay_frequency": "biweekly"}
    data.update(overrides)
    return SimpleNamespace(**data)


class TestPullForwardWidget(unittest.TestCase):
    def test_may_due_date_is_not_active_cycle_overdue_in_june(self):
        today = date(2026, 6, 2)
        self.assertFalse(_active_cycle_overdue(date(2026, 5, 22), today, 2026, 6))
        self.assertFalse(
            _widget_relevant_due(
                date(2026, 5, 22),
                today,
                in_planning_window=True,
                cycle_year=2026,
                cycle_month=6,
            )
        )
        self.assertTrue(_active_cycle_overdue(date(2026, 6, 1), today, 2026, 6))

    def test_widget_limits_to_seven_visible_unpaid(self):
        from app.services.pay_period_planner import build_pull_forward_widget

        bill = _bill()
        user = _user(id=bill.user_id)
        due = date(2026, 6, 5)
        row = BillCyclePayment(
            bill_id=bill.id,
            user_id=bill.user_id,
            due_date=due,
            cycle_year=2026,
            cycle_month=6,
            amount_due=Decimal("800"),
            amount_paid=Decimal("0"),
            is_paid=False,
            source="auto_generated",
        )

        async def run():
            db = AsyncMock()
            ctx = {
                "current_start": date(2026, 5, 22),
                "current_end": date(2026, 6, 4),
                "next_start": date(2026, 6, 5),
                "next_end": date(2026, 6, 18),
                "member_ids": [user.id],
            }
            extras = []
            for i in range(10):
                extras.append(
                    _bill(
                        name=f"Bill{i}",
                        id=uuid4(),
                        user_id=bill.user_id,
                        due_day=10 + i,
                    )
                )
            all_bills = [bill, *extras]

            def fake_cycle_payments(db, bill_ids, year, month):
                out = {(bill.id, due): row}
                for idx, b in enumerate(extras):
                    d = date(2026, 6, 6 + idx)
                    out[(b.id, d)] = BillCyclePayment(
                        bill_id=b.id,
                        user_id=b.user_id,
                        due_date=d,
                        cycle_year=2026,
                        cycle_month=6,
                        amount_due=Decimal("50"),
                        amount_paid=Decimal("0"),
                        is_paid=False,
                    )
                return out

            with patch(
                "app.services.pay_period_planner.build_pay_calendar_context",
                new_callable=AsyncMock,
                return_value=ctx,
            ), patch(
                "app.services.pay_period_planner.fetch_widget_bills",
                new_callable=AsyncMock,
                return_value=(all_bills, 1),
            ), patch(
                "app.services.pay_period_planner.fetch_scoped_bills_debts",
                new_callable=AsyncMock,
                return_value=([], []),
            ), patch(
                "app.services.pay_period_planner.auto_generate_missing_cycle_rows",
                new_callable=AsyncMock,
            ), patch(
                "app.services.pay_period_planner.get_cycle_payments_for_month",
                side_effect=fake_cycle_payments,
            ), patch(
                "app.services.pay_period_planner.load_active_overrides",
                new_callable=AsyncMock,
                return_value=[],
            ), patch(
                "app.services.pay_period_planner.assign_bills_to_paycheck",
                return_value=[],
            ), patch(
                "app.services.pay_period_planner.get_paid_debt_ids_in_window",
                new_callable=AsyncMock,
                return_value=set(),
            ), patch(
                "app.services.pay_period_planner.local_today",
                return_value=date(2026, 6, 2),
            ):
                result = await build_pull_forward_widget(
                    db, user, uuid4(), visible_limit=7
                )

            self.assertEqual(len(result["visible_items"]), 7)
            self.assertEqual(result["remaining_count"], 4)
            names = [i["name"] for i in result["visible_items"]]
            self.assertIn("Rent", names)
            for item in result["visible_items"]:
                self.assertFalse(item["is_overdue"])

        asyncio.run(run())

    def test_stale_may_assign_rows_are_excluded(self):
        from app.services.pay_period_planner import build_pull_forward_widget

        bill = _bill(name="NDR", due_day=22)
        user = _user(id=bill.user_id)

        async def run():
            db = AsyncMock()
            ctx = {
                "current_start": date(2026, 5, 22),
                "current_end": date(2026, 6, 4),
                "next_start": date(2026, 6, 5),
                "next_end": date(2026, 6, 18),
                "member_ids": [user.id],
            }

            stale_assign = [
                {
                    "id": bill.id,
                    "name": "NDR",
                    "item_type": "bill",
                    "amount": Decimal("100"),
                    "due_date": date(2026, 5, 22),
                    "is_paid": False,
                }
            ]

            with patch(
                "app.services.pay_period_planner.build_pay_calendar_context",
                new_callable=AsyncMock,
                return_value=ctx,
            ), patch(
                "app.services.pay_period_planner.fetch_widget_bills",
                new_callable=AsyncMock,
                return_value=([bill], 1),
            ), patch(
                "app.services.pay_period_planner.fetch_scoped_bills_debts",
                new_callable=AsyncMock,
                return_value=([], []),
            ), patch(
                "app.services.pay_period_planner.auto_generate_missing_cycle_rows",
                new_callable=AsyncMock,
            ), patch(
                "app.services.pay_period_planner.get_cycle_payments_for_month",
                new_callable=AsyncMock,
                return_value={},
            ), patch(
                "app.services.pay_period_planner.load_active_overrides",
                new_callable=AsyncMock,
                return_value=[],
            ), patch(
                "app.services.pay_period_planner.assign_bills_to_paycheck",
                return_value=stale_assign,
            ), patch(
                "app.services.pay_period_planner.get_paid_debt_ids_in_window",
                new_callable=AsyncMock,
                return_value=set(),
            ), patch(
                "app.services.pay_period_planner.local_today",
                return_value=date(2026, 6, 2),
            ):
                result = await build_pull_forward_widget(db, user, uuid4())

            names = [i["name"] for i in result["visible_items"]]
            self.assertNotIn("NDR", names)

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
