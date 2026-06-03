"""Integration-style tests for pull-forward widget via canonical planning state."""

from __future__ import annotations

import asyncio
import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from app.services.paycheck_planning_state import (
    build_paycheck_planning_state,
    build_pull_forward_widget_payload,
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
    def test_widget_payload_uses_available_items(self):
        planning = {
            "available_items": [{"name": "Rent", "amount": Decimal("800")}],
            "available_remaining_count": 2,
            "available_total_due": Decimal("800"),
            "progress_percent": 50.0,
        }
        payload = build_pull_forward_widget_payload(
            planning, next_paycheck_date=date(2026, 6, 5)
        )
        self.assertEqual(len(payload["available_items"]), 1)
        self.assertEqual(payload["visible_items"], payload["available_items"])
        self.assertEqual(payload["remaining_count"], 2)

    def test_assigned_paid_debt_excluded_from_available(self):
        debt_id = uuid4()
        user = _user()
        due = date(2026, 6, 10)
        current_start = date(2026, 5, 22)
        next_start = date(2026, 6, 5)

        assigned_item = {
            "id": debt_id,
            "name": "Affirm Amazon",
            "item_type": "debt",
            "amount": Decimal("50"),
            "due_date": due,
            "is_paid": True,
            "can_pull_forward": False,
        }
        next_item = {
            "id": debt_id,
            "name": "Affirm Amazon",
            "item_type": "debt",
            "amount": Decimal("50"),
            "due_date": due,
            "is_paid": False,
            "can_pull_forward": True,
        }

        async def run():
            db = AsyncMock()
            ctx = {
                "bills": [],
                "debts": [SimpleNamespace(id=debt_id, name="Affirm Amazon", category=None)],
                "current_start": current_start,
                "current_end": date(2026, 6, 4),
                "next_start": next_start,
                "next_end": date(2026, 6, 18),
                "member_ids": [user.id],
            }

            with patch(
                "app.services.paycheck_planning_state.fetch_widget_bills",
                new_callable=AsyncMock,
                return_value=([], 1),
            ), patch(
                "app.services.paycheck_planning_state.auto_generate_missing_cycle_rows",
                new_callable=AsyncMock,
            ), patch(
                "app.services.paycheck_planning_state.get_paid_bill_map",
                new_callable=AsyncMock,
                return_value={},
            ), patch(
                "app.services.paycheck_planning_state.get_paid_debt_ids_in_window",
                new_callable=AsyncMock,
                return_value=set(),
            ), patch(
                "app.services.paycheck_planning_state.assign_bills_to_paycheck",
                side_effect=[[assigned_item], [next_item]],
            ), patch(
                "app.services.pay_period_planner._apply_effective_lists",
                return_value=([assigned_item], [next_item]),
            ):
                state = await build_paycheck_planning_state(
                    db,
                    user,
                    uuid4(),
                    ctx=ctx,
                    overrides=[],
                    current_start=current_start,
                    next_start=next_start,
                    today=date(2026, 6, 2),
                )

            widget = build_pull_forward_widget_payload(
                state, next_paycheck_date=next_start
            )
            assigned_names = [i["name"] for i in state["assigned_items"]]
            available_names = [i["name"] for i in widget["available_items"]]
            self.assertIn("Affirm Amazon", assigned_names)
            self.assertNotIn("Affirm Amazon", available_names)
            overlap = set(assigned_names) & set(available_names)
            self.assertEqual(len(overlap), 0)

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
