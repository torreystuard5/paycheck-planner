"""Regression: Debts page mark-paid / unmark-paid endpoints must not throw.

Covers the 10 PASS/FAIL test cases from the v2 brief:
1. Solo debt → pay from Debts page
2. Solo debt → undo from Debts page
3. Shared (household) debt → pay from Debts page
4. Shared (household) debt → undo from Debts page
5. Existing previously-paid debt can be undone cleanly
6. Existing unpaid debt can be paid cleanly
7. No 500/backend exception on pay
8. No 500/backend exception on undo
9. Debt paid state matches between Debts page and Dashboard
10. Bills still work unchanged

Root cause: debts.py mark_debt_paid / unmark_debt_paid used
scalar_one_or_none() on DebtPayment lookups. In a household, multiple
members can each have a DebtPayment row for the same
(debt_id, period_month, period_year), causing MultipleResultsFound → 500.

The fix uses scalars().first() / scalars().all() so extra rows are
handled gracefully, consistent with the prior fix in paycheck_checklist.py.
"""

from __future__ import annotations

import asyncio
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException


# ---------------------------------------------------------------------------
# Fake ORM objects
# ---------------------------------------------------------------------------

def _fake_debt(*, debt_id=None, user_id=None, household_id=None,
               name="Test Debt", minimum_payment=Decimal("50"),
               balance=Decimal("500"), due_day=15):
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=debt_id or uuid4(),
        user_id=user_id or uuid4(),
        household_id=household_id,
        name=name,
        type="credit_card",
        balance=balance,
        credit_limit=Decimal("1000"),
        apr=Decimal("19.99"),
        minimum_payment=minimum_payment,
        due_day=due_day,
        auto_pay=False,
        reminder_days=3,
        is_active=True,
        is_split=False,
        split_members=None,
        budget_id=None,
        postpone_until=None,
        created_at=now,
        updated_at=now,
    )


def _fake_debt_payment(*, debt_id, user_id, amount=Decimal("50"),
                        period_month=5, period_year=2026):
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=uuid4(),
        debt_id=debt_id,
        user_id=user_id,
        amount=amount,
        payment_date=now,
        period_month=period_month,
        period_year=period_year,
        created_at=now,
    )


def _fake_user(*, user_id=None, household_id=None):
    return SimpleNamespace(id=user_id or uuid4(), household_id=household_id)


# ---------------------------------------------------------------------------
# Mock session helpers
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

    def scalar(self):
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
    session.flush = AsyncMock()
    session.refresh = AsyncMock()
    return session


# ===========================================================================
#  Test cases 1–2: Solo debt pay / undo from Debts page
# ===========================================================================


class TestSoloDebtPayFromDebtsPage(unittest.TestCase):
    """TC-1: Solo debt → pay from Debts page."""

    @patch("app.routers.debts._debt_to_response")
    @patch("app.routers.debts.date")
    def test_solo_debt_pay_succeeds(self, mock_date, mock_resp):
        """mark_debt_paid creates DebtPayment and subtracts from balance."""
        from app.routers.debts import mark_debt_paid

        mock_date.today.return_value = date(2026, 5, 15)

        user = _fake_user()
        debt = _fake_debt(user_id=user.id, balance=Decimal("500"))
        mock_resp.return_value = AsyncMock()

        # Call 1: Debt lookup
        # Call 2: DebtPayment existing check (empty → not yet paid)
        # Call 3: flush (via session.flush)
        # Call 4: refresh (via session.refresh)
        # Call 5: auto-logged Payment flush
        session = _build_session([
            _FakeResult([debt]),     # Debt lookup
            _FakeResult([]),         # DebtPayment existing → none
        ])

        asyncio.run(
            mark_debt_paid(debt.id, amount=Decimal("50"), db=session, current_user=user)
        )

        # DebtPayment must have been added
        session.add.assert_called()
        # Balance reduced
        self.assertEqual(debt.balance, Decimal("450"))


class TestSoloDebtUndoFromDebtsPage(unittest.TestCase):
    """TC-2: Solo debt → undo from Debts page."""

    @patch("app.routers.debts._debt_to_response")
    @patch("app.routers.debts.date")
    def test_solo_debt_undo_succeeds(self, mock_date, mock_resp):
        """unmark_debt_paid deletes DebtPayment and restores balance."""
        from app.routers.debts import unmark_debt_paid

        mock_date.today.return_value = date(2026, 5, 15)

        user = _fake_user()
        debt = _fake_debt(user_id=user.id, balance=Decimal("450"))
        existing_dp = _fake_debt_payment(
            debt_id=debt.id, user_id=user.id, amount=Decimal("50"),
        )
        mock_resp.return_value = AsyncMock()

        # Call 1: Debt lookup
        # Call 2: DebtPayment lookup → one row
        # Call 3: auto-logged Payment cleanup
        session = _build_session([
            _FakeResult([debt]),            # Debt lookup
            _FakeResult([existing_dp]),     # DebtPayment(s) for period
            _FakeResult([]),                # auto-logged Payments
        ])

        asyncio.run(
            unmark_debt_paid(debt.id, db=session, current_user=user)
        )

        # Balance restored
        self.assertEqual(debt.balance, Decimal("500"))
        # DebtPayment deleted
        session.delete.assert_called()


# ===========================================================================
#  Test cases 3–4: Shared (household) debt pay / undo
# ===========================================================================


class TestSharedDebtPayFromDebtsPage(unittest.TestCase):
    """TC-3: Shared (household) debt → pay from Debts page."""

    @patch("app.routers.debts._debt_to_response")
    @patch("app.routers.debts.log_activity")
    @patch("app.routers.debts.date")
    def test_household_debt_pay_with_existing_member_payment_returns_409(
        self, mock_date, mock_log, mock_resp
    ):
        """If another household member already paid, return 409 not 500."""
        from app.routers.debts import mark_debt_paid

        mock_date.today.return_value = date(2026, 5, 15)

        household_id = uuid4()
        user_a = _fake_user(household_id=household_id)
        user_b = _fake_user(household_id=household_id)
        debt = _fake_debt(
            user_id=user_a.id, household_id=household_id,
            balance=Decimal("450"),
        )

        dp_b = _fake_debt_payment(
            debt_id=debt.id, user_id=user_b.id, amount=Decimal("50"),
        )

        session = _build_session([
            _FakeResult([debt]),     # Debt lookup
            _FakeResult([dp_b]),     # Existing payment by member B
        ])

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                mark_debt_paid(debt.id, amount=Decimal("50"), db=session, current_user=user_a)
            )
        self.assertEqual(ctx.exception.status_code, 409)

    @patch("app.routers.debts._debt_to_response")
    @patch("app.routers.debts.log_activity")
    @patch("app.routers.debts.date")
    def test_household_debt_pay_with_multiple_existing_rows_no_500(
        self, mock_date, mock_log, mock_resp
    ):
        """Two existing DebtPayment rows must not cause MultipleResultsFound."""
        from app.routers.debts import mark_debt_paid

        mock_date.today.return_value = date(2026, 5, 15)

        household_id = uuid4()
        user_a = _fake_user(household_id=household_id)
        user_b = _fake_user(household_id=household_id)
        debt = _fake_debt(
            user_id=user_a.id, household_id=household_id,
            balance=Decimal("400"),
        )

        dp_a = _fake_debt_payment(debt_id=debt.id, user_id=user_a.id, amount=Decimal("50"))
        dp_b = _fake_debt_payment(debt_id=debt.id, user_id=user_b.id, amount=Decimal("50"))

        session = _build_session([
            _FakeResult([debt]),          # Debt lookup
            _FakeResult([dp_a, dp_b]),    # Two existing payments
        ])

        # Must raise 409 (already paid), NOT 500 (MultipleResultsFound)
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                mark_debt_paid(debt.id, amount=Decimal("50"), db=session, current_user=user_a)
            )
        self.assertEqual(ctx.exception.status_code, 409)


class TestSharedDebtUndoFromDebtsPage(unittest.TestCase):
    """TC-4: Shared (household) debt → undo from Debts page."""

    @patch("app.routers.debts._debt_to_response")
    @patch("app.routers.debts.date")
    def test_household_debt_undo_deletes_all_and_restores_balance(
        self, mock_date, mock_resp
    ):
        """Household undo: all DebtPayment rows deleted, total restored."""
        from app.routers.debts import unmark_debt_paid

        mock_date.today.return_value = date(2026, 5, 15)

        household_id = uuid4()
        user_a = _fake_user(household_id=household_id)
        user_b = _fake_user(household_id=household_id)
        debt = _fake_debt(
            user_id=user_a.id, household_id=household_id,
            balance=Decimal("400"),
        )

        dp_a = _fake_debt_payment(debt_id=debt.id, user_id=user_a.id, amount=Decimal("50"))
        dp_b = _fake_debt_payment(debt_id=debt.id, user_id=user_b.id, amount=Decimal("50"))
        mock_resp.return_value = AsyncMock()

        session = _build_session([
            _FakeResult([debt]),          # Debt lookup
            _FakeResult([dp_a, dp_b]),    # Two payments for period
            _FakeResult([]),              # auto-logged Payments
        ])

        asyncio.run(
            unmark_debt_paid(debt.id, db=session, current_user=user_a)
        )

        # Balance restored by total of both payments
        self.assertEqual(debt.balance, Decimal("500"))
        # Both rows deleted
        deleted_objects = [call.args[0] for call in session.delete.call_args_list]
        self.assertIn(dp_a, deleted_objects)
        self.assertIn(dp_b, deleted_objects)


# ===========================================================================
#  TC-5: Existing previously-paid debt can be undone cleanly
# ===========================================================================


class TestPreviouslyPaidDebtUndone(unittest.TestCase):
    """TC-5: Existing previously-paid debt can be undone cleanly."""

    @patch("app.routers.debts._debt_to_response")
    @patch("app.routers.debts.date")
    def test_previously_paid_debt_undo_restores_balance(self, mock_date, mock_resp):
        from app.routers.debts import unmark_debt_paid

        mock_date.today.return_value = date(2026, 5, 15)

        user = _fake_user()
        debt = _fake_debt(user_id=user.id, balance=Decimal("200"))
        dp = _fake_debt_payment(
            debt_id=debt.id, user_id=user.id, amount=Decimal("300"),
        )
        mock_resp.return_value = AsyncMock()

        session = _build_session([
            _FakeResult([debt]),
            _FakeResult([dp]),
            _FakeResult([]),
        ])

        asyncio.run(
            unmark_debt_paid(debt.id, db=session, current_user=user)
        )

        self.assertEqual(debt.balance, Decimal("500"))


# ===========================================================================
#  TC-6: Existing unpaid debt can be paid cleanly
# ===========================================================================


class TestUnpaidDebtCanBePaid(unittest.TestCase):
    """TC-6: Existing unpaid debt can be paid cleanly."""

    @patch("app.routers.debts._debt_to_response")
    @patch("app.routers.debts.date")
    def test_unpaid_debt_pay_creates_payment(self, mock_date, mock_resp):
        from app.routers.debts import mark_debt_paid

        mock_date.today.return_value = date(2026, 5, 15)

        user = _fake_user()
        debt = _fake_debt(user_id=user.id, balance=Decimal("1000"))
        mock_resp.return_value = AsyncMock()

        session = _build_session([
            _FakeResult([debt]),
            _FakeResult([]),     # No existing payments
        ])

        asyncio.run(
            mark_debt_paid(debt.id, amount=Decimal("100"), db=session, current_user=user)
        )

        session.add.assert_called()
        self.assertEqual(debt.balance, Decimal("900"))


# ===========================================================================
#  TC-7: No 500/backend exception on pay
# ===========================================================================


class TestNo500OnPay(unittest.TestCase):
    """TC-7: No 500/backend exception on pay."""

    @patch("app.routers.debts._debt_to_response")
    @patch("app.routers.debts.date")
    def test_pay_with_two_household_rows_no_unhandled_exception(
        self, mock_date, mock_resp
    ):
        """The former scalar_one_or_none() bug caused MultipleResultsFound → 500."""
        from app.routers.debts import mark_debt_paid

        mock_date.today.return_value = date(2026, 5, 15)

        household_id = uuid4()
        user_a = _fake_user(household_id=household_id)
        user_b = _fake_user(household_id=household_id)
        debt = _fake_debt(
            user_id=user_a.id, household_id=household_id,
            balance=Decimal("400"),
        )

        dp_a = _fake_debt_payment(debt_id=debt.id, user_id=user_a.id)
        dp_b = _fake_debt_payment(debt_id=debt.id, user_id=user_b.id)

        session = _build_session([
            _FakeResult([debt]),
            _FakeResult([dp_a, dp_b]),
        ])

        # Must raise HTTPException (409), NOT an unhandled 500
        try:
            asyncio.run(
                mark_debt_paid(debt.id, amount=Decimal("50"), db=session, current_user=user_a)
            )
            self.fail("Expected HTTPException")
        except HTTPException as exc:
            self.assertIn(exc.status_code, (409,))
        except Exception as exc:
            self.fail(f"Got unhandled exception instead of HTTPException: {exc}")


# ===========================================================================
#  TC-8: No 500/backend exception on undo
# ===========================================================================


class TestNo500OnUndo(unittest.TestCase):
    """TC-8: No 500/backend exception on undo."""

    @patch("app.routers.debts._debt_to_response")
    @patch("app.routers.debts.date")
    def test_undo_with_two_household_rows_no_unhandled_exception(
        self, mock_date, mock_resp
    ):
        """The former scalar_one_or_none() bug caused MultipleResultsFound → 500."""
        from app.routers.debts import unmark_debt_paid

        mock_date.today.return_value = date(2026, 5, 15)

        household_id = uuid4()
        user_a = _fake_user(household_id=household_id)
        user_b = _fake_user(household_id=household_id)
        debt = _fake_debt(
            user_id=user_a.id, household_id=household_id,
            balance=Decimal("400"),
        )

        dp_a = _fake_debt_payment(debt_id=debt.id, user_id=user_a.id, amount=Decimal("50"))
        dp_b = _fake_debt_payment(debt_id=debt.id, user_id=user_b.id, amount=Decimal("50"))
        mock_resp.return_value = AsyncMock()

        session = _build_session([
            _FakeResult([debt]),
            _FakeResult([dp_a, dp_b]),
            _FakeResult([]),
        ])

        # Must NOT raise unhandled exception
        try:
            asyncio.run(
                unmark_debt_paid(debt.id, db=session, current_user=user_a)
            )
        except HTTPException:
            pass  # Expected HTTP errors are fine
        except Exception as exc:
            self.fail(f"Got unhandled exception: {exc}")


# ===========================================================================
#  TC-9: Debt paid state matches between Debts page and Dashboard
# ===========================================================================


class TestPaidStateConsistency(unittest.TestCase):
    """TC-9: Debt paid state matches between Debts page and Dashboard.

    Both _debt_to_response (Debts page) and _sync_debt_payment (Dashboard)
    now use scalars().first() instead of scalar_one_or_none(). If one
    returns is_paid=True, the other must agree. We verify that
    _debt_to_response produces is_paid_this_period=True when a payment
    exists, and False when it doesn't — matching the Dashboard behavior.
    """

    @patch("app.routers.debts.date")
    def test_debt_to_response_shows_paid_when_payment_exists(self, mock_date):
        from app.routers.debts import _debt_to_response

        mock_date.today.return_value = date(2026, 5, 15)

        user = _fake_user()
        debt = _fake_debt(user_id=user.id, balance=Decimal("450"))
        dp = _fake_debt_payment(debt_id=debt.id, user_id=user.id, amount=Decimal("50"))

        session = _build_session([
            _FakeResult([dp]),         # period payment check → found
            _FakeResult([dp]),         # last payment check
            _FakeResult([Decimal("50")]),  # total_paid sum
        ])

        result = asyncio.run(
            _debt_to_response(debt, session, user.id)
        )

        self.assertTrue(result.is_paid_this_period)

    @patch("app.routers.debts.date")
    def test_debt_to_response_shows_unpaid_when_no_payment(self, mock_date):
        from app.routers.debts import _debt_to_response

        mock_date.today.return_value = date(2026, 5, 15)

        user = _fake_user()
        debt = _fake_debt(user_id=user.id, balance=Decimal("500"))

        session = _build_session([
            _FakeResult([]),           # period payment check → not found
            _FakeResult([]),           # last payment check
            _FakeResult([Decimal("0")]),   # total_paid sum
        ])

        result = asyncio.run(
            _debt_to_response(debt, session, user.id)
        )

        self.assertFalse(result.is_paid_this_period)

    @patch("app.routers.debts.date")
    def test_debt_to_response_handles_multiple_household_payments(self, mock_date):
        """Household: two DebtPayment rows must not crash _debt_to_response."""
        from app.routers.debts import _debt_to_response

        mock_date.today.return_value = date(2026, 5, 15)

        household_id = uuid4()
        user_a = _fake_user(household_id=household_id)
        debt = _fake_debt(user_id=user_a.id, household_id=household_id,
                          balance=Decimal("400"))
        dp_a = _fake_debt_payment(debt_id=debt.id, user_id=user_a.id, amount=Decimal("50"))
        dp_b = _fake_debt_payment(debt_id=debt.id, user_id=uuid4(), amount=Decimal("50"))

        # Even though two rows exist, scalars().first() returns just one
        session = _build_session([
            _FakeResult([dp_a, dp_b]),       # period payment check → two rows
            _FakeResult([dp_a]),             # last payment
            _FakeResult([Decimal("100")]),   # total_paid sum
        ])

        # Must NOT raise MultipleResultsFound
        result = asyncio.run(
            _debt_to_response(debt, session, user_a.id)
        )

        self.assertTrue(result.is_paid_this_period)


# ===========================================================================
#  TC-10: Bills still work unchanged
# ===========================================================================


class TestBillsUnchanged(unittest.TestCase):
    """TC-10: Bills still work unchanged.

    Verify that _sync_bill_payment in paycheck_checklist.py is not broken
    by our changes (we didn't touch it, but confirm it still functions).
    """

    def test_bill_pay_still_works(self):
        """Bill payment sync routes through the bill-cycle paid path."""
        from app.routers.paycheck_checklist import _sync_bill_payment

        user = _fake_user()
        bill = SimpleNamespace(
            id=uuid4(),
            user_id=user.id,
            household_id=None,
            name="Electric",
            amount=Decimal("120"),
            is_paid=False,
            paid_date=None,
            paid_amount=None,
        )

        session = _build_session([
            _FakeResult([bill]),    # Bill lookup
        ])

        async def fake_mark_bill_cycle_paid(*args, **kwargs):
            return SimpleNamespace(
                amount_paid=Decimal("120"),
                paid_date=datetime(2026, 5, 15, tzinfo=timezone.utc),
            )

        with patch(
            "app.routers.paycheck_checklist.mark_bill_cycle_paid",
            new=AsyncMock(side_effect=fake_mark_bill_cycle_paid),
        ) as mock_mark_paid:
            asyncio.run(
                _sync_bill_payment(session, user, bill.id, True, date(2026, 5, 15))
            )

        self.assertFalse(bill.is_paid)
        self.assertIsNone(bill.paid_amount)
        self.assertIsNone(bill.paid_date)
        self.assertEqual(mock_mark_paid.await_args.kwargs["due_date"], date(2026, 5, 15))


# ===========================================================================
#  Self-healing: duplicate cleanup
# ===========================================================================


class TestDuplicateDebtPaymentSelfHealing(unittest.TestCase):
    """Verify that mark_debt_paid self-heals duplicate debt_payments rows."""

    @patch("app.routers.debts._debt_to_response")
    @patch("app.routers.debts.date")
    def test_duplicate_rows_for_same_user_are_cleaned_up(
        self, mock_date, mock_resp
    ):
        """If two rows exist for the same user_id+period, the duplicate is
        deleted and its amount restored to balance before returning 409."""
        from app.routers.debts import mark_debt_paid

        mock_date.today.return_value = date(2026, 5, 15)

        user = _fake_user()
        debt = _fake_debt(user_id=user.id, balance=Decimal("400"))

        # Two rows for the same user — second is a duplicate from a prior bug
        dp1 = _fake_debt_payment(debt_id=debt.id, user_id=user.id, amount=Decimal("50"))
        dp2 = _fake_debt_payment(debt_id=debt.id, user_id=user.id, amount=Decimal("50"))

        session = _build_session([
            _FakeResult([debt]),          # Debt lookup
            _FakeResult([dp1, dp2]),      # Two existing rows (duplicate)
        ])

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                mark_debt_paid(debt.id, amount=Decimal("50"), db=session, current_user=user)
            )

        # Returns 409, not 500
        self.assertEqual(ctx.exception.status_code, 409)
        # Duplicate's amount was restored to balance
        self.assertEqual(debt.balance, Decimal("450"))
        # The duplicate row was deleted
        session.delete.assert_called()


if __name__ == "__main__":
    unittest.main()
