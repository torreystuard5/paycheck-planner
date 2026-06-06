"""Regression: paycheck plan response still loads when planning state is used."""

from __future__ import annotations

import asyncio
import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.schemas.paycheck import PaycheckPlanResponse
from app.services.pay_period_planner import build_full_paycheck_plan_response


# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------

def _bill(due_day=1, freq="monthly", name="Rent", **overrides):
    """Build a SimpleNamespace that mimics a Bill ORM row."""
    data = {
        "id": uuid4(),
        "user_id": uuid4(),
        "name": name,
        "amount": Decimal("800"),
        "due_day": due_day,
        "frequency": freq,
        "is_active": True,
        "payment_mode": "single",
        "auto_pay": False,
        "hidden_overdue": False,
        "postpone_until": None,
        "day_of_week": None,
        "start_date": None,
        "household_id": None,
        "budget_id": None,
        "user_share_amount": Decimal("800"),
        "split_member_count": 1,
        "is_user_responsible": True,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


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

    def test_plan_loads_via_fallback_when_calendar_context_fails(self):
        """Regression: fallback planning ctx must include paid_bill_map for periods 2+."""
        user = _user()
        budget_id = uuid4()
        rent = _bill(due_day=1, name="Rent")

        base_plan = {
            "pay_frequency": "biweekly",
            "currency": "USD",
            "num_periods": 4,
            "paychecks": [
                {
                    "paycheck_date": date(2026, 6, 4),
                    "paycheck_amount": Decimal("2000"),
                    "assigned_items": [],
                    "total_due": Decimal("0"),
                    "remaining": Decimal("2000"),
                    "status": "on_track",
                },
                {
                    "paycheck_date": date(2026, 6, 18),
                    "paycheck_amount": Decimal("2000"),
                    "assigned_items": [],
                    "total_due": Decimal("0"),
                    "remaining": Decimal("2000"),
                    "status": "on_track",
                },
                {
                    "paycheck_date": date(2026, 7, 2),
                    "paycheck_amount": Decimal("2000"),
                    "assigned_items": [],
                    "total_due": Decimal("0"),
                    "remaining": Decimal("2000"),
                    "status": "on_track",
                },
                {
                    "paycheck_date": date(2026, 7, 16),
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
            "current_paycheck_date": date(2026, 6, 4),
            "next_paycheck_date": date(2026, 6, 18),
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
                return_value=([rent], []),
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
                side_effect=RuntimeError("calendar unavailable"),
            ), patch(
                "app.services.pay_period_planner.local_today",
                return_value=date(2026, 6, 4),
            ), patch(
                "app.services.pay_period_planner.get_paid_bill_map",
                new_callable=AsyncMock,
                return_value={},
            ), patch(
                "app.services.paycheck_planning_state.fetch_widget_bills",
                new_callable=AsyncMock,
                return_value=([rent], 1),
            ), patch(
                "app.services.paycheck_planning_state.auto_generate_missing_cycle_rows",
                new_callable=AsyncMock,
                return_value=0,
            ), patch(
                "app.services.paycheck_planning_state.get_paid_bill_map",
                new_callable=AsyncMock,
                return_value={},
            ), patch(
                "app.services.paycheck_planning_state.get_paid_debt_ids_in_window",
                new_callable=AsyncMock,
                return_value=set(),
            ), patch(
                "app.services.paycheck_planning_state._checked_items_for_period",
                new_callable=AsyncMock,
                return_value=set(),
            ):
                plan = await build_full_paycheck_plan_response(
                    db, user, budget_id, periods=4
                )

            self.assertEqual(len(plan["paychecks"]), 4)
            names = [i["name"] for i in plan["current_paycheck"]["assigned_items"]]
            self.assertIn("Rent", names)
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


class TestRentCarryover(unittest.TestCase):
    """Verify that unpaid recurring bills (e.g. Rent due June 1) whose due date
    falls before the current pay-period window are surfaced in the current
    paycheck plan via the overdue-carryover path in build_paycheck_planning_state.
    """

    # ── _prev_period_start helper ─────────────────────────────────────────

    def test_previous_period_bounds_biweekly(self):
        from app.services.paycheck_engine import previous_period_bounds

        bounds = previous_period_bounds(date(2026, 6, 4), "biweekly")
        self.assertEqual(bounds, (date(2026, 5, 21), date(2026, 6, 3)))

    def test_previous_period_bounds_weekly(self):
        from app.services.paycheck_engine import previous_period_bounds

        bounds = previous_period_bounds(date(2026, 6, 4), "weekly")
        self.assertEqual(bounds, (date(2026, 5, 28), date(2026, 6, 3)))

    def test_previous_period_bounds_monthly(self):
        from app.services.paycheck_engine import previous_period_bounds

        bounds = previous_period_bounds(date(2026, 6, 4), "monthly")
        self.assertEqual(bounds, (date(2026, 5, 4), date(2026, 6, 3)))

    def test_previous_period_bounds_unknown_returns_none(self):
        from app.services.paycheck_engine import previous_period_bounds

        self.assertIsNone(previous_period_bounds(date(2026, 6, 4), "unknown_freq"))

    # ── assign_bills_to_paycheck engine-level checks ──────────────────────

    def test_rent_due_june1_absent_from_june4_window(self):
        """Rent due June 1 does NOT appear in the Jun 4–17 pay-period window."""
        from app.services.paycheck_engine import assign_bills_to_paycheck

        rent = _bill(due_day=1)
        items = assign_bills_to_paycheck(
            [rent], [],
            date(2026, 6, 4), date(2026, 6, 17), date(2026, 6, 4),
            paid_debt_ids=set(), paid_bill_map={},
        )
        self.assertEqual(len(items), 0, "Rent should not appear in Jun 4-17 window")

    def test_rent_due_june1_present_and_overdue_in_prev_window(self):
        """Rent due June 1 IS overdue in the May 21–June 3 window when today=Jun 4."""
        from app.services.paycheck_engine import assign_bills_to_paycheck

        rent = _bill(due_day=1)
        items = assign_bills_to_paycheck(
            [rent], [],
            date(2026, 5, 21), date(2026, 6, 3), date(2026, 6, 4),
            paid_debt_ids=set(), paid_bill_map={},
        )
        self.assertEqual(len(items), 1, "Rent should appear in May21-Jun3 window")
        self.assertTrue(items[0]["is_overdue"], "Rent should be marked overdue")
        self.assertEqual(items[0]["due_date"], date(2026, 6, 1))

    def test_rent_within_current_window_appears_normally(self):
        """Rent due June 15 appears in the Jun 4–17 window without carryover."""
        from app.services.paycheck_engine import assign_bills_to_paycheck

        rent = _bill(due_day=15)
        items = assign_bills_to_paycheck(
            [rent], [],
            date(2026, 6, 4), date(2026, 6, 17), date(2026, 6, 4),
            paid_debt_ids=set(), paid_bill_map={},
        )
        self.assertEqual(len(items), 1)
        self.assertFalse(items[0]["is_overdue"])
        self.assertEqual(items[0]["due_date"], date(2026, 6, 15))

    def test_paid_rent_not_overdue_in_prev_period(self):
        """Rent marked paid via paid_bill_map is not overdue in the previous period."""
        from app.services.paycheck_engine import assign_bills_to_paycheck

        rent = _bill(due_day=1)
        paid_map = {rent.id: [{"due_date": date(2026, 6, 1), "paid_date": date(2026, 6, 1), "source": "test"}]}
        items = assign_bills_to_paycheck(
            [rent], [],
            date(2026, 5, 21), date(2026, 6, 3), date(2026, 6, 4),
            paid_debt_ids=set(), paid_bill_map=paid_map,
        )
        self.assertEqual(len(items), 1)
        # Paid rent should NOT be overdue
        self.assertTrue(items[0]["is_paid"])
        self.assertFalse(items[0]["is_overdue"])

    # ── build_paycheck_planning_state integration ─────────────────────────

    def test_carryover_injects_rent_into_planning_state(self):
        """build_paycheck_planning_state injects overdue Rent from the previous
        pay period so it appears in current_paycheck.assigned_items."""
        from app.services.paycheck_planning_state import build_paycheck_planning_state

        user_id = uuid4()
        budget_id = uuid4()
        rent = _bill(due_day=1)
        user = SimpleNamespace(id=user_id, household_id=None)
        today = date(2026, 6, 4)

        ctx = {
            "bills": [rent],
            "debts": [],
            "current_start": date(2026, 6, 4),
            "current_end": date(2026, 6, 17),
            "next_start": date(2026, 6, 18),
            "next_end": date(2026, 7, 1),
            "member_ids": [user_id],
            "pay_frequency": "biweekly",
        }

        async def run():
            db = AsyncMock()
            with patch(
                "app.services.paycheck_planning_state.fetch_widget_bills",
                new_callable=AsyncMock,
                return_value=([rent], 1),
            ), patch(
                "app.services.paycheck_planning_state.auto_generate_missing_cycle_rows",
                new_callable=AsyncMock,
                return_value=0,
            ), patch(
                "app.services.paycheck_planning_state.get_paid_bill_map",
                new_callable=AsyncMock,
                return_value={},
            ), patch(
                "app.services.paycheck_planning_state.get_paid_debt_ids_in_window",
                new_callable=AsyncMock,
                return_value=set(),
            ), patch(
                "app.services.paycheck_planning_state._checked_items_for_period",
                new_callable=AsyncMock,
                return_value=set(),
            ), patch(
                "app.services.paycheck_assignment.apply_effective_lists",
                side_effect=lambda nc, nn, cs, ns, ovr: (list(nc), list(nn)),
            ):
                result = await build_paycheck_planning_state(
                    db, user, budget_id,
                    ctx=ctx,
                    overrides=[],
                    today=today,
                )

            names = [i["name"] for i in result["assigned_items"]]
            self.assertIn("Rent", names, f"Rent should appear via carryover; got {names}")

            rent_item = next(i for i in result["assigned_items"] if i["name"] == "Rent")
            self.assertTrue(rent_item["is_overdue"], "Carryover Rent must be marked overdue")
            self.assertEqual(rent_item["due_date"], date(2026, 6, 1))
            self.assertEqual(names.count("Rent"), 1, "Rent must not be duplicated")

            # Totals must include the carryover item
            self.assertEqual(result["assigned_total_count"], 1)
            self.assertEqual(result["assigned_total_amount"], Decimal("800"))

        asyncio.run(run())

    def test_may_payment_does_not_clear_june_rent_carryover(self):
        """A legacy Payment row in May must not mark June Rent as paid."""
        from app.services.paycheck_planning_state import build_paycheck_planning_state

        user_id = uuid4()
        budget_id = uuid4()
        rent = _bill(due_day=1, name="Rent")
        user = SimpleNamespace(id=user_id, household_id=None)
        today = date(2026, 6, 4)
        # May rent was paid; June cycle is still open on Bills.
        paid_map = {rent.id: [date(2026, 5, 25)]}

        ctx = {
            "bills": [rent],
            "debts": [],
            "current_start": date(2026, 6, 4),
            "current_end": date(2026, 6, 17),
            "next_start": date(2026, 6, 18),
            "next_end": date(2026, 7, 1),
            "member_ids": [user_id],
            "pay_frequency": "biweekly",
        }

        async def run():
            db = AsyncMock()
            with patch(
                "app.services.paycheck_planning_state.fetch_widget_bills",
                new_callable=AsyncMock,
                return_value=([rent], 1),
            ), patch(
                "app.services.paycheck_planning_state.auto_generate_missing_cycle_rows",
                new_callable=AsyncMock,
                return_value=0,
            ), patch(
                "app.services.paycheck_planning_state.get_paid_bill_map",
                new_callable=AsyncMock,
                return_value=paid_map,
            ), patch(
                "app.services.paycheck_planning_state.get_paid_debt_ids_in_window",
                new_callable=AsyncMock,
                return_value=set(),
            ), patch(
                "app.services.paycheck_planning_state._checked_items_for_period",
                new_callable=AsyncMock,
                return_value=set(),
            ), patch(
                "app.services.paycheck_assignment.apply_effective_lists",
                side_effect=lambda nc, nn, cs, ns, ovr: (list(nc), list(nn)),
            ):
                result = await build_paycheck_planning_state(
                    db, user, budget_id,
                    ctx=ctx,
                    overrides=[],
                    today=today,
                )

            names = [i["name"] for i in result["assigned_items"]]
            self.assertIn("Rent", names, f"June Rent must carry over; got {names}")
            rent_item = next(i for i in result["assigned_items"] if i["name"] == "Rent")
            self.assertFalse(rent_item["is_paid"])
            self.assertEqual(rent_item["due_date"], date(2026, 6, 1))

        asyncio.run(run())

    def test_paid_rent_not_in_carryover(self):
        """Rent that was already paid in the previous period is NOT carried over."""
        from app.services.paycheck_planning_state import build_paycheck_planning_state

        user_id = uuid4()
        budget_id = uuid4()
        rent = _bill(due_day=1)
        user = SimpleNamespace(id=user_id, household_id=None)
        today = date(2026, 6, 4)
        # Simulate rent paid for June 1
        paid_map = {
            rent.id: [{"due_date": date(2026, 6, 1), "paid_date": date(2026, 6, 1), "source": "test"}]
        }

        ctx = {
            "bills": [rent],
            "debts": [],
            "current_start": date(2026, 6, 4),
            "current_end": date(2026, 6, 17),
            "next_start": date(2026, 6, 18),
            "next_end": date(2026, 7, 1),
            "member_ids": [user_id],
            "pay_frequency": "biweekly",
        }

        async def run():
            db = AsyncMock()
            with patch(
                "app.services.paycheck_planning_state.fetch_widget_bills",
                new_callable=AsyncMock,
                return_value=([rent], 1),
            ), patch(
                "app.services.paycheck_planning_state.auto_generate_missing_cycle_rows",
                new_callable=AsyncMock,
                return_value=0,
            ), patch(
                "app.services.paycheck_planning_state.get_paid_bill_map",
                new_callable=AsyncMock,
                return_value=paid_map,
            ), patch(
                "app.services.paycheck_planning_state.get_paid_debt_ids_in_window",
                new_callable=AsyncMock,
                return_value=set(),
            ), patch(
                "app.services.paycheck_planning_state._checked_items_for_period",
                new_callable=AsyncMock,
                return_value=set(),
            ), patch(
                "app.services.paycheck_assignment.apply_effective_lists",
                side_effect=lambda nc, nn, cs, ns, ovr: (list(nc), list(nn)),
            ):
                result = await build_paycheck_planning_state(
                    db, user, budget_id,
                    ctx=ctx,
                    overrides=[],
                    today=today,
                )

            names = [i["name"] for i in result["assigned_items"]]
            self.assertNotIn("Rent", names, f"Paid rent should NOT be carried over; got {names}")
            self.assertEqual(result["assigned_total_count"], 0)

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
