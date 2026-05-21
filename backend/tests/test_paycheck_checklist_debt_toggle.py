"""Regression: paycheck checklist debt pay/unpay toggle must not throw.

Reproduces the bug where _sync_debt_payment used scalar_one_or_none()
on the DebtPayment lookup.  In a household, multiple members can each
have a DebtPayment row for the same (debt_id, period_month, period_year),
causing MultipleResultsFound and a 500 error on both pay and unpay.

The fix uses scalars().first() so extra rows are handled gracefully.
"""

from __future__ import annotations

import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4


# ---------------------------------------------------------------------------
# Fake ORM objects
# ---------------------------------------------------------------------------

def _fake_debt(*, debt_id=None, minimum_payment=Decimal("50"), balance=Decimal("500")):
    return SimpleNamespace(
        id=debt_id or uuid4(),
        minimum_payment=minimum_payment,
        balance=balance,
    )


def _fake_debt_payment(*, debt_id, user_id, amount=Decimal("50"), period_month=5, period_year=2026):
    return SimpleNamespace(
        id=uuid4(),
        debt_id=debt_id,
        user_id=user_id,
        amount=amount,
        period_month=period_month,
        period_year=period_year,
    )


def _fake_user(*, user_id=None, household_id=None):
    return SimpleNamespace(id=user_id or uuid4(), household_id=household_id)


# ---------------------------------------------------------------------------
# Helper: build a mock AsyncSession whose execute() returns controlled data
# ---------------------------------------------------------------------------

class _FakeResult:
    """Mimics an SQLAlchemy CursorResult with scalars() support."""

    def __init__(self, rows):
        self._rows = rows

    def scalar_one_or_none(self):
        if len(self._rows) > 1:
            from sqlalchemy.exc import MultipleResultsFound
            raise MultipleResultsFound()
        return self._rows[0] if self._rows else None

    def scalars(self):
        return self

    def first(self):
        return self._rows[0] if self._rows else None

    def all(self):
        return list(self._rows)


def _build_session(execute_side_effects):
    """Return an AsyncMock session with ordered execute return values."""
    session = AsyncMock()
    session.execute = AsyncMock(side_effect=execute_side_effects)
    session.add = MagicMock()
    session.delete = AsyncMock()
    return session


# ===========================================================================
#  Tests
# ===========================================================================


class TestPaycheckChecklistPayAndUnpayDebtRoundtrip(unittest.TestCase):
    """test_paycheck_checklist_pay_and_unpay_debt_roundtrip

    Verifies both directions (pay → unpay) for the debt checklist toggle,
    including the household case where multiple DebtPayment rows exist.
    """

    @patch("app.routers.paycheck_checklist.date")
    def test_pay_creates_debt_payment_single_user(self, mock_date):
        """Check (pay): when no existing DebtPayment, one is created."""
        import asyncio
        from app.routers.paycheck_checklist import _sync_debt_payment

        mock_date.today.return_value = date(2026, 5, 15)

        debt = _fake_debt()
        user = _fake_user()

        # execute call 1: DebtPayment lookup → no rows
        # execute call 2: Debt lookup → returns the debt
        session = _build_session([
            _FakeResult([]),   # DebtPayment lookup
            _FakeResult([debt]),  # Debt lookup
        ])

        asyncio.get_event_loop().run_until_complete(
            _sync_debt_payment(session, user, debt.id, True)
        )

        # A DebtPayment must have been added to the session
        session.add.assert_called()
        added_objects = [call.args[0] for call in session.add.call_args_list]
        debt_payment_added = any(
            hasattr(obj, "debt_id") and hasattr(obj, "period_month")
            for obj in added_objects
        )
        self.assertTrue(debt_payment_added, "DebtPayment must be added to session on pay")

    @patch("app.routers.paycheck_checklist.date")
    def test_unpay_deletes_debt_payment_single_user(self, mock_date):
        """Uncheck (unpay): existing DebtPayment is deleted, balance restored."""
        import asyncio
        from app.routers.paycheck_checklist import _sync_debt_payment

        mock_date.today.return_value = date(2026, 5, 15)

        user = _fake_user()
        debt = _fake_debt(balance=Decimal("450"))
        existing_dp = _fake_debt_payment(
            debt_id=debt.id, user_id=user.id, amount=Decimal("50"),
        )

        # execute call 1: DebtPayment lookup → one row
        # execute call 2: Debt lookup → the debt
        # execute call 3: re-query all DebtPayments for balance restore
        # execute call 4: auto-logged Payment lookup (inside try/except)
        # execute call 5: delete PaycheckChecklist rows (bulk)
        session = _build_session([
            _FakeResult([existing_dp]),    # DebtPayment lookup
            _FakeResult([debt]),           # Debt lookup
            _FakeResult([existing_dp]),    # all DebtPayments for restore
            _FakeResult([]),               # auto-logged Payments
            _FakeResult([]),               # checklist bulk delete
        ])

        asyncio.get_event_loop().run_until_complete(
            _sync_debt_payment(session, user, debt.id, False)
        )

        # Balance must have been restored
        self.assertEqual(debt.balance, Decimal("500"))
        # DebtPayment must have been deleted
        session.delete.assert_called()

    @patch("app.routers.paycheck_checklist.date")
    def test_pay_with_multiple_household_rows_does_not_throw(self, mock_date):
        """Household: two DebtPayment rows for same period must not crash."""
        import asyncio
        from app.routers.paycheck_checklist import _sync_debt_payment

        mock_date.today.return_value = date(2026, 5, 15)

        household_id = uuid4()
        user_a = _fake_user(household_id=household_id)
        user_b = _fake_user(household_id=household_id)
        debt = _fake_debt()

        dp_a = _fake_debt_payment(debt_id=debt.id, user_id=user_a.id)
        dp_b = _fake_debt_payment(debt_id=debt.id, user_id=user_b.id)

        # Two existing rows — before the fix, scalar_one_or_none() threw here
        session = _build_session([
            _FakeResult([dp_a, dp_b]),  # DebtPayment lookup — two rows
            _FakeResult([debt]),        # Debt lookup
        ])

        # Must NOT raise MultipleResultsFound
        asyncio.get_event_loop().run_until_complete(
            _sync_debt_payment(session, user_a, debt.id, True)
        )
        # existing is truthy → is_checked and not existing → False → no creation
        session.add.assert_not_called()

    @patch("app.routers.paycheck_checklist.date")
    def test_unpay_with_multiple_household_rows_deletes_all(self, mock_date):
        """Household unpay: all DebtPayment rows deleted, total restored."""
        import asyncio
        from app.routers.paycheck_checklist import _sync_debt_payment

        mock_date.today.return_value = date(2026, 5, 15)

        household_id = uuid4()
        user_a = _fake_user(household_id=household_id)
        user_b = _fake_user(household_id=household_id)
        debt = _fake_debt(balance=Decimal("400"))

        dp_a = _fake_debt_payment(debt_id=debt.id, user_id=user_a.id, amount=Decimal("50"))
        dp_b = _fake_debt_payment(debt_id=debt.id, user_id=user_b.id, amount=Decimal("50"))

        session = _build_session([
            _FakeResult([dp_a, dp_b]),  # DebtPayment lookup — two rows
            _FakeResult([debt]),        # Debt lookup
            _FakeResult([dp_a, dp_b]),  # all DebtPayments for balance restore
            _FakeResult([]),            # auto-logged Payments
            _FakeResult([]),            # checklist bulk delete
        ])

        asyncio.get_event_loop().run_until_complete(
            _sync_debt_payment(session, user_a, debt.id, False)
        )

        # Balance restored by total of both payments
        self.assertEqual(debt.balance, Decimal("500"))
        # Both DebtPayment rows deleted
        delete_calls = session.delete.call_args_list
        deleted_objects = [call.args[0] for call in delete_calls]
        self.assertIn(dp_a, deleted_objects)
        self.assertIn(dp_b, deleted_objects)


if __name__ == "__main__":
    unittest.main()
