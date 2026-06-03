"""Tests for canonical paycheck planning state (assigned + pull widget)."""

from __future__ import annotations

import unittest
from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.services.paycheck_engine import (
    active_cycle_overdue,
    apply_planning_due_labels,
    build_paycheck_widget_state,
    compute_available_to_pull,
    normalize_planning_item,
    occurrence_key,
)
from app.services.paycheck_planning_state import build_current_paycheck_plan


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
        result = compute_available_to_pull(next_period, assigned)
        visible = result["available_visible_items"]
        names = [i["name"] for i in visible]
        self.assertNotIn("Affirm Amazon", names)

    def test_all_assigned_paid_same_context_has_no_available_items(self):
        assigned = [
            _item(name=f"A{i}", due=date(2026, 6, 1 + i), is_paid=True, can_pull_forward=False)
            for i in range(12)
        ]
        result = compute_available_to_pull(
            assigned,
            assigned,
            require_pull_forward_flag=False,
        )
        assigned_keys = {normalize_planning_item(i)["planning_key"] for i in assigned}
        for item in result["available_items_for_pull"]:
            self.assertNotIn(item["planning_key"], assigned_keys)
        self.assertEqual(result["available_unpaid_count"], 0)
        self.assertEqual(result["available_unpaid_count"], len(result["available_items_for_pull"]))
        self.assertEqual(
            result["available_remaining_count"],
            max(0, result["available_unpaid_count"] - len(result["available_visible_items"])),
        )

    def test_paid_item_not_in_available(self):
        due = date(2026, 6, 10)
        next_period = [
            _item(name="Paid Bill", due=due, is_paid=True, can_pull_forward=True),
            _item(name="Unpaid Bill", due=date(2026, 6, 12), is_paid=False),
        ]
        result = compute_available_to_pull(next_period, [])
        names = [i["name"] for i in result["available_items_for_pull"]]
        self.assertNotIn("Paid Bill", names)
        self.assertIn("Unpaid Bill", names)

    def test_available_limited_to_seven(self):
        next_period = [
            _item(name=f"Bill{i}", due=date(2026, 6, 1 + i)) for i in range(10)
        ]
        result = compute_available_to_pull(next_period, [])
        self.assertEqual(len(result["available_visible_items"]), 7)
        self.assertEqual(result["available_remaining_count"], 3)
        self.assertEqual(result["available_unpaid_count"], 10)

    def test_widget_counts_match_dataset(self):
        next_period = [_item(name=f"Bill{i}", due=date(2026, 6, 1 + i)) for i in range(9)]
        result = compute_available_to_pull(next_period, [])
        self.assertEqual(result["available_unpaid_count"], 9)
        self.assertEqual(len(result["available_visible_items"]), 7)
        self.assertEqual(result["available_remaining_count"], 2)
        self.assertEqual(
            result["available_unpaid_count"],
            len(result["available_visible_items"]) + result["available_remaining_count"],
        )

    def test_widget_state_respects_current_to_next_paycheck_window(self):
        current = date(2026, 5, 21)
        next_paycheck = date(2026, 6, 4)
        in_window = _item(name="In Window", due=date(2026, 5, 30))
        before = _item(name="Before", due=date(2026, 5, 20))
        boundary = _item(name="Boundary", due=next_paycheck)

        result = build_paycheck_widget_state(
            current_paycheck_date=current,
            next_paycheck_date=next_paycheck,
            candidate_items=[in_window, before, boundary],
            assigned_items=[],
        )

        self.assertEqual([i["name"] for i in result["widget_items"]], ["In Window"])
        self.assertEqual(result["widget_total_due"], Decimal("50"))

    def test_widget_state_excludes_assigned_and_paid_items(self):
        current = date(2026, 5, 21)
        next_paycheck = date(2026, 6, 4)
        assigned_id = uuid4()
        assigned = _item(name="Assigned", due=date(2026, 5, 25), item_id=assigned_id)
        paid = _item(name="Paid", due=date(2026, 5, 26), is_paid=True)
        open_item = _item(name="Open", due=date(2026, 5, 27))

        result = build_paycheck_widget_state(
            current_paycheck_date=current,
            next_paycheck_date=next_paycheck,
            candidate_items=[assigned, paid, open_item],
            assigned_items=[assigned],
        )

        self.assertEqual([i["name"] for i in result["widget_items"]], ["Open"])

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
        result = compute_available_to_pull(next_period, assigned)
        self.assertEqual(len(result["available_items_for_pull"]), 0)

    def test_current_paycheck_plan_unified_shape(self):
        planning = {
            "paycheck_context": {
                "pay_period_start": date(2026, 5, 22),
                "pay_period_end": date(2026, 6, 4),
                "next_paycheck_date": date(2026, 6, 5),
                "budget_id": uuid4(),
                "household_id": None,
                "user_id": uuid4(),
            },
            "assigned_items": [
                normalize_planning_item(_item(name="Rent", is_paid=True, due=date(2026, 5, 22))),
            ],
            "assigned_paid_count": 1,
            "assigned_total_count": 1,
            "assigned_paid_amount": Decimal("50"),
            "assigned_total_amount": Decimal("50"),
            "assigned_still_owed": Decimal("0"),
            "assigned_progress_percent": 100.0,
            "available_items_for_pull": [
                normalize_planning_item(_item(name="Electric")),
            ],
            "available_visible_items": [
                normalize_planning_item(_item(name="Electric")),
            ],
            "available_remaining_count": 0,
            "available_unpaid_count": 1,
            "available_total_due": Decimal("50"),
            "available_visible_total_due": Decimal("50"),
            "widget_items": [
                normalize_planning_item(_item(name="Electric")),
            ],
            "widget_visible_items": [
                normalize_planning_item(_item(name="Electric")),
            ],
            "widget_remaining_count": 0,
            "widget_total_count": 1,
            "widget_total_due": Decimal("50"),
            "widget_visible_total_due": Decimal("50"),
        }
        current = build_current_paycheck_plan(
            planning,
            paycheck_meta={
                "paycheck_date": date(2026, 5, 22),
                "paycheck_amount": Decimal("2000"),
                "total_due": Decimal("50"),
                "remaining": Decimal("1950"),
                "status": "on_track",
            },
            ctx={"current_end": date(2026, 6, 4), "next_start": date(2026, 6, 5)},
        )
        self.assertEqual(current["assigned_paid_count"], 1)
        self.assertEqual(current["available_unpaid_count"], 1)
        self.assertEqual(
            current["paycheck_context"]["pay_period_start"],
            current["pay_period_start"],
        )
        assigned_keys = {i["planning_key"] for i in current["assigned_items"]}
        for item in current["available_items_for_pull"]:
            self.assertNotIn(item["planning_key"], assigned_keys)


if __name__ == "__main__":
    unittest.main()
