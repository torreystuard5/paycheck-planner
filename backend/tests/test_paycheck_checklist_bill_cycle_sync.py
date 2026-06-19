import asyncio
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


def _user(**overrides):
    data = {
        "id": uuid4(),
        "household_id": None,
        "timezone": "America/Chicago",
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def _bill(user_id, **overrides):
    data = {
        "id": uuid4(),
        "user_id": user_id,
        "household_id": None,
        "amount": Decimal("120"),
        "is_paid": False,
        "paid_date": None,
        "paid_amount": None,
        "frequency": "monthly",
        "due_day": 5,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


class TestPaycheckChecklistBillCycleSync(unittest.TestCase):
    def test_checklist_bill_sync_uses_occurrence_due_date_when_marking_paid(self):
        from app.routers.paycheck_checklist import _sync_bill_payment

        user = _user()
        bill = _bill(user.id)
        session = AsyncMock()
        session.execute = AsyncMock(return_value=_FakeResult(bill))
        cycle_payment = SimpleNamespace(
            amount_paid=Decimal("120"),
            paid_date=datetime(2026, 6, 5, tzinfo=timezone.utc),
        )

        async def run():
            with patch(
                "app.routers.paycheck_checklist.mark_bill_cycle_paid",
                new_callable=AsyncMock,
                return_value=cycle_payment,
            ) as mock_mark_paid, patch(
                "app.routers.paycheck_checklist.next_due_date_for_bill",
            ) as mock_next_due:
                await _sync_bill_payment(
                    session,
                    user,
                    bill.id,
                    True,
                    date(2026, 6, 5),
                )

            mock_next_due.assert_not_called()
            self.assertEqual(mock_mark_paid.await_args.kwargs["due_date"], date(2026, 6, 5))
            self.assertEqual(mock_mark_paid.await_args.kwargs["source"], "dashboard")

        asyncio.run(run())

    def test_checklist_bill_sync_uses_occurrence_due_date_when_marking_unpaid(self):
        from app.routers.paycheck_checklist import _sync_bill_payment

        user = _user()
        bill = _bill(user.id, is_paid=True, paid_date=datetime.now(timezone.utc), paid_amount=Decimal("120"))
        session = AsyncMock()
        session.execute = AsyncMock(side_effect=[
            _FakeResult(bill),
            _FakeResult([]),
            _FakeResult([]),
        ])

        async def run():
            with patch(
                "app.routers.paycheck_checklist.mark_bill_cycle_unpaid",
                new_callable=AsyncMock,
            ) as mock_mark_unpaid:
                await _sync_bill_payment(
                    session,
                    user,
                    bill.id,
                    False,
                    date(2026, 6, 5),
                )

            args = mock_mark_unpaid.await_args.args
            self.assertEqual(args[2], date(2026, 6, 5))
            self.assertEqual(args[3], user.id)

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
