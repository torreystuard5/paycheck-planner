"""Unit tests for pay_period_item_overrides effective assignment (migration 045)."""

from datetime import date
from types import SimpleNamespace
from uuid import uuid4

from app.services.pay_period_planner import _apply_effective_lists


def _bill(item_id, due: date, amount: str = "50.00"):
    return {
        "item_type": "bill",
        "id": item_id,
        "name": "Test bill",
        "amount": amount,
        "due_date": due,
        "is_paid": False,
        "is_overdue": False,
    }


def _override(item_type, item_id, due, natural_start, effective_start):
    return SimpleNamespace(
        id=uuid4(),
        item_type=item_type,
        item_id=item_id,
        occurrence_due_date=due,
        natural_period_start=natural_start,
        effective_period_start=effective_start,
    )


def test_pull_forward_item_only_in_current_period():
    current_start = date(2026, 5, 7)
    next_start = date(2026, 5, 21)
    due = date(2026, 5, 18)
    bill_id = uuid4()

    natural_next = [_bill(bill_id, due)]
    natural_current = []
    overrides = [_override("bill", bill_id, due, next_start, current_start)]

    current_items, next_items = _apply_effective_lists(
        natural_current,
        natural_next,
        current_start,
        next_start,
        overrides,
    )

    assert len(current_items) == 1
    assert current_items[0]["pulled_forward"] is True
    assert current_items[0]["can_revert_override"] is True
    assert current_items[0]["natural_period_start"] == next_start
    assert current_items[0]["effective_period_start"] == current_start
    assert len(next_items) == 0


def test_next_period_item_can_pull_forward_when_not_overridden():
    current_start = date(2026, 5, 7)
    next_start = date(2026, 5, 21)
    due = date(2026, 5, 18)
    bill_id = uuid4()

    natural_next = [_bill(bill_id, due)]
    current_items, next_items = _apply_effective_lists(
        [],
        natural_next,
        current_start,
        next_start,
        [],
    )

    assert len(current_items) == 0
    assert len(next_items) == 1
    assert next_items[0]["can_pull_forward"] is True


def test_revert_restores_next_period_list():
    current_start = date(2026, 5, 7)
    next_start = date(2026, 5, 21)
    due = date(2026, 5, 18)
    bill_id = uuid4()
    natural_next = [_bill(bill_id, due)]

    current_items, next_items = _apply_effective_lists(
        [],
        natural_next,
        current_start,
        next_start,
        [],
    )
    assert len(next_items) == 1

    current_items2, next_items2 = _apply_effective_lists(
        [],
        natural_next,
        current_start,
        next_start,
        [_override("bill", bill_id, due, next_start, current_start)],
    )
    assert len(current_items2) == 1
    assert len(next_items2) == 0
