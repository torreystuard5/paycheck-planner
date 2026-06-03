"""Regression: paycheck plan response still loads when planning state is used."""

from __future__ import annotations

import asyncio
import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from app.schemas.paycheck import PaycheckPlanResponse
from app.services.pay_period_planner import build_full_paycheck_plan_response


def _user(**overrides):
    data = {
        "id": uuid4(),
        "household_id": None,
        "pay_frequency": "biweekly",
        "currency": "USD",
        "net_pay_amount": Decimal("2000"),
        "next_pay_date": date(2026, 5, 22),
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def _income(user_id):
    return SimpleNamespace(
        id=uuid4(),
        user_id=user_id,
        amount=Decimal("2000"),
        frequency="biweekly",
        next_pay_date=date(2026, 5, 22),
    )


class TestPaycheckPlanLoading(unittest.TestCase):
    def test_plan_response_valid_after_canonical_planning(self):
        user = _user()
        budget_id = uuid4()
        bill_id = uuid4()

        base_plan = {
            "pay_frequency": "biweekly",
            "currency": "USD",
            "num_periods": 4,
            "paychecks": [
                {
                    "paycheck_date": date(2026, 5, 22),
                    "paycheck_amount": Decimal("2000"),
                    "assigned_items": [],
                    "total_due": Decimal("0"),
                    "remaining": Decimal("2000"),
                    "status": "on_track",
                },
                {
                    "paycheck_date": date(2026, 6, 5),
                    "paycheck_amount": Decimal("2000"),
                    "assigned_items": [],
                    "total_due": Decimal("0"),
                    "remaining": Decimal("2000"),
                    "status": "on_track",
                },
            ],
            "total_income": Decimal("8000"),
            "total_obligations": Decimal("0"),
            "overall_status": "on_track",
            "current_paycheck_date": date(2026, 5, 22),
            "next_paycheck_date": date(2026, 6, 5),
        }

        assigned = [
            {
                "id": bill_id,
                "name": "Rent",
                "item_type": "bill",
                "amount": Decimal("800"),
                "due_date": date(2026, 5, 22),
                "days_until_due": 0,
                "status": "urgent",
                "auto_pay": False,
                "is_paid": False,
                "is_overdue": False,
                "can_pull_forward": False,
            }
        ]

        ctx = {
            "bills": [],
            "debts": [],
            "current_start": date(2026, 5, 22),
            "current_end": date(2026, 6, 4),
            "next_start": date(2026, 6, 5),
            "next_end": date(2026, 6, 18),
            "member_ids": [user.id],
        }

        planning = {
            "paycheck_context": {
                "pay_period_start": date(2026, 5, 22),
                "pay_period_end": date(2026, 6, 4),
                "next_paycheck_date": date(2026, 6, 5),
                "budget_id": budget_id,
                "household_id": None,
                "user_id": user.id,
            },
            "assigned_items": assigned,
            "next_period_items": [],
            "assigned_paid_count": 0,
            "assigned_total_count": 1,
            "assigned_paid_amount": Decimal("0"),
            "assigned_total_amount": Decimal("800"),
            "assigned_still_owed": Decimal("800"),
            "assigned_progress_percent": 0.0,
        }

        async def run():
            db = AsyncMock()
            with patch(
                "app.services.pay_period_planner.resolve_anchor_income",
                new_callable=AsyncMock,
                return_value=_income(user.id),
            ), patch(
                "app.services.pay_period_planner.fetch_paycheck_entries",
                new_callable=AsyncMock,
                return_value=[],
            ), patch(
                "app.services.pay_period_planner.fetch_scoped_bills_debts",
                new_callable=AsyncMock,
                return_value=([], []),
            ), patch(
                "app.services.pay_period_planner.household_member_ids",
                new_callable=AsyncMock,
                return_value=[user.id],
            ), patch(
                "app.services.pay_period_planner.build_paycheck_plan",
                new_callable=AsyncMock,
                return_value=base_plan,
            ), patch(
                "app.services.pay_period_planner.load_active_overrides",
                new_callable=AsyncMock,
                return_value=[],
            ), patch(
                "app.services.pay_period_planner.build_pay_calendar_context",
                new_callable=AsyncMock,
                return_value=ctx,
            ), patch(
                "app.services.pay_period_planner.build_paycheck_planning_state",
                new_callable=AsyncMock,
                return_value=planning,
            ), patch(
                "app.services.pay_period_planner.local_today",
                return_value=date(2026, 6, 2),
            ):
                plan = await build_full_paycheck_plan_response(
                    db, user, budget_id, periods=4
                )

            self.assertTrue(plan.get("paychecks"))
            self.assertEqual(len(plan["paychecks"][0]["assigned_items"]), 1)
            self.assertIsNotNone(plan.get("current_paycheck"))
            self.assertEqual(plan["current_paycheck"]["assigned_total_count"], 1)
            self.assertEqual(plan["current_paycheck"]["total_due"], Decimal("800"))
            PaycheckPlanResponse(**plan)

        asyncio.run(run())

    def test_plan_still_returns_when_planning_state_fails(self):
        user = _user()
        budget_id = uuid4()

        base_plan = {
            "pay_frequency": "biweekly",
            "currency": "USD",
            "num_periods": 2,
            "paychecks": [
                {
                    "paycheck_date": date(2026, 5, 22),
                    "paycheck_amount": Decimal("2000"),
                    "assigned_items": [{"id": uuid4(), "name": "X", "item_type": "bill", "amount": Decimal("1"), "due_date": date(2026, 5, 22), "days_until_due": 0, "status": "urgent", "auto_pay": False, "is_paid": False, "is_overdue": False}],
                    "total_due": Decimal("1"),
                    "remaining": Decimal("1999"),
                    "status": "on_track",
                },
            ],
            "total_income": Decimal("2000"),
            "total_obligations": Decimal("1"),
            "overall_status": "on_track",
            "current_paycheck_date": date(2026, 5, 22),
        }

        async def run():
            db = AsyncMock()
            with patch(
                "app.services.pay_period_planner.resolve_anchor_income",
                new_callable=AsyncMock,
                return_value=_income(user.id),
            ), patch(
                "app.services.pay_period_planner.fetch_paycheck_entries",
                new_callable=AsyncMock,
                return_value=[],
            ), patch(
                "app.services.pay_period_planner.fetch_scoped_bills_debts",
                new_callable=AsyncMock,
                return_value=([], []),
            ), patch(
                "app.services.pay_period_planner.household_member_ids",
                new_callable=AsyncMock,
                return_value=[user.id],
            ), patch(
                "app.services.pay_period_planner.build_paycheck_plan",
                new_callable=AsyncMock,
                return_value=base_plan,
            ), patch(
                "app.services.pay_period_planner.load_active_overrides",
                new_callable=AsyncMock,
                return_value=[],
            ), patch(
                "app.services.pay_period_planner.build_pay_calendar_context",
                new_callable=AsyncMock,
                side_effect=RuntimeError("planning boom"),
            ):
                plan = await build_full_paycheck_plan_response(
                    db, user, budget_id, periods=2
                )

            self.assertEqual(len(plan["paychecks"]), 1)
            self.assertEqual(len(plan["paychecks"][0]["assigned_items"]), 1)
            PaycheckPlanResponse(**plan)

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
