from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4


class _FakeResult:
    def __init__(self, rows=None, scalar_rows=None):
        self._rows = rows or []
        self._scalar_rows = scalar_rows if scalar_rows is not None else self._rows

    def all(self):
        return self._rows

    def scalars(self):
        return self


def test_calendar_uses_cycle_paid_state_per_bill_occurrence():
    from app.routers.calendar import get_calendar_events

    bill_id = uuid4()
    user_id = uuid4()
    bill = SimpleNamespace(
        id=bill_id,
        user_id=user_id,
        household_id=None,
        assigned_member_id=None,
        payment_mode="single",
        is_active=True,
        name="Biweekly bill",
        amount=Decimal("120"),
        category="Other",
        frequency="biweekly",
        due_day=None,
        day_of_week=4,
        start_date=date(2026, 5, 22),
        postpone_until=None,
        is_paid=True,
    )
    current_user = SimpleNamespace(id=user_id, household_id=None)
    db = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[
                _FakeResult([bill]),
                _FakeResult([(bill_id, date(2026, 6, 5), True)]),
                _FakeResult([]),
                _FakeResult([]),
            ]
        )
    )

    import asyncio

    events = asyncio.run(
        get_calendar_events(
            month=6,
            year=2026,
            view="personal",
            db=db,
            current_user=current_user,
        )
    )

    bill_events = [event for event in events if event.type == "bill"]
    assert [(event.date, event.is_paid) for event in bill_events] == [
        (date(2026, 6, 5), True),
        (date(2026, 6, 19), False),
    ]
