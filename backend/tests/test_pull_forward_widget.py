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
    build_current_paycheck_plan,
    build_paycheck_planning_state,
    build_pull_forward_widget_payload,
)


def _user(**overrides):
    data = {"id": uuid4(), "household_id": None, "pay_frequency": "biweekly"}
    data.update(overrides)
    return SimpleNamespace(**data)


class TestPullForwardWidget(unittest.TestCase):
    def test_widget_payload_matches_current_paycheck(self):
        current = {
            "next_paycheck_date": date(2026, 6, 5),
            "available_visible_items": [{"name": "Rent", "amount": Decimal("800")}],
            "available_remaining_count": 2,
            "available_unpaid_count": 3,
            "available_visible_total_due": Decimal("800"),
        }
        payload = build_pull_forward_widget_payload(current)
        self.assertEqual(payload["unpaid_count"], 3)
        self.assertEqual(payload["remaining_count"], 2)
        self.assertEqual(payload["available_items"], payload["visible_items"])

    def test_assigned_paid_debt_excluded_from_available(self):
        debt_id = uuid4()
        user = _user()
        due = date(2026, 6, 10)

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
                "debts": [SimpleNamespace(id=debt_id, name="Affirm Amazon", type="other")],
                "current_start": date(2026, 5, 22),
                "current_end": date(2026, 6, 4),
                "next_start": date(2026, 6, 5),
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
                planning = await build_paycheck_planning_state(
                    db,
                    user,
                    uuid4(),
                    ctx=ctx,
                    overrides=[],
                    today=date(2026, 6, 2),
                )

            current = build_current_paycheck_plan(
                planning,
                paycheck_meta={
                    "paycheck_date": date(2026, 5, 22),
                    "paycheck_amount": Decimal("2000"),
                    "total_due": Decimal("50"),
                    "remaining": Decimal("1950"),
                    "status": "on_track",
                },
                ctx=ctx,
            )
            assigned_keys = {i["planning_key"] for i in current["assigned_items"]}
            for item in current["available_items_for_pull"]:
                self.assertNotIn(item["planning_key"], assigned_keys)
            self.assertEqual(current["assigned_paid_count"], 1)

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
