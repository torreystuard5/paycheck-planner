"""Tests for canonical paycheck planning state (assigned + pull widget)."""

from __future__ import annotations

import unittest
from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.services.paycheck_engine import (
    active_cycle_overdue,
    apply_planning_due_labels,
    compute_available_to_pull,
    occurrence_key,
)


def _item(
    *,
    item_type: str = "bill",
    name: str = "Test",
    due: date | None = None,
    is_paid: bool = False,
    can_pull_forward: bool = True,
    item_id=None,
) -> dict:
    due = due or date(2026, 6, 10)
    iid = item_id or uuid4()
    return {
        "id": iid,
        "name": name,
        "item_type": item_type,
        "amount": Decimal("50"),
        "due_date": due,
        "is_paid": is_paid,
        "can_pull_forward": can_pull_forward,
    }


class TestPaycheckPlanningState(unittest.TestCase):
    def test_item_cannot_appear_in_both_available_and_assigned(self):
        debt_id = uuid4()
        due = date(2026, 6, 10)
        assigned = [
            _item(
                item_type="debt",
                name="Affirm Amazon",
                due=due,
                is_paid=True,
                can_pull_forward=False,
                item_id=debt_id,
            )
        ]
        next_period = [
            _item(
                item_type="debt",
                name="Affirm Amazon",
                due=due,
                is_paid=False,
                can_pull_forward=True,
                item_id=debt_id,
            )
        ]
        available, _, _ = compute_available_to_pull(next_period, assigned)
        names = [i["name"] for i in available]
        self.assertNotIn("Affirm Amazon", names)

    def test_paid_item_not_in_available(self):
        due = date(2026, 6, 10)
        next_period = [
            _item(name="Paid Bill", due=due, is_paid=True, can_pull_forward=True),
            _item(name="Unpaid Bill", due=date(2026, 6, 12), is_paid=False),
        ]
        available, _, _ = compute_available_to_pull(next_period, [])
        names = [i["name"] for i in available]
        self.assertNotIn("Paid Bill", names)
        self.assertIn("Unpaid Bill", names)

    def test_available_limited_to_seven(self):
        next_period = [
            _item(name=f"Bill{i}", due=date(2026, 6, 1 + i)) for i in range(10)
        ]
        available, remaining, _ = compute_available_to_pull(next_period, [])
        self.assertEqual(len(available), 7)
        self.assertEqual(remaining, 3)

    def test_may_due_not_overdue_in_june(self):
        today = date(2026, 6, 2)
        labeled = apply_planning_due_labels(
            _item(due=date(2026, 5, 22)),
            today=today,
            cycle_year=2026,
            cycle_month=6,
        )
        self.assertFalse(labeled["is_overdue"])
        self.assertEqual(labeled["due_status"], "due")

    def test_current_cycle_overdue_applied(self):
        today = date(2026, 6, 2)
        self.assertTrue(active_cycle_overdue(date(2026, 6, 1), today, 2026, 6))
        labeled = apply_planning_due_labels(
            _item(due=date(2026, 6, 1)),
            today=today,
            cycle_year=2026,
            cycle_month=6,
        )
        self.assertTrue(labeled["is_overdue"])
        self.assertEqual(labeled["due_status"], "overdue")

    def test_assigned_occurrence_excluded_by_key(self):
        bill_id = uuid4()
        due = date(2026, 6, 10)
        assigned = [_item(item_id=bill_id, due=due, can_pull_forward=False)]
        next_period = [_item(item_id=bill_id, due=due, can_pull_forward=True)]
        available, _, _ = compute_available_to_pull(next_period, assigned)
        self.assertEqual(len(available), 0)

    def test_sort_overdue_first_then_due_date(self):
        next_period = [
            _item(name="Future", due=date(2026, 6, 15), can_pull_forward=True),
            _item(name="Overdue", due=date(2026, 6, 1), can_pull_forward=True),
        ]
        next_period[1]["is_overdue"] = True
        available, _, _ = compute_available_to_pull(next_period, [])
        self.assertEqual(available[0]["name"], "Overdue")


if __name__ == "__main__":
    unittest.main()
