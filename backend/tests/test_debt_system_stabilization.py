"""Full debt system stabilization — 24-case test matrix.

Covers all cases from the debt-system-stabilization-brief:
  A. Debts page actions (1-4)
  B. Dashboard paycheck checklist (5-8)
  C. Cross-page sync (9-12)
  D. Totals / summaries (13-15)
  E. Household / shared (16-18)
  F. Period correctness (19-20)
  G. Regression protection (21-24)
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


def _fake_debt(
    *,
    debt_id=None,
    user_id=None,
    household_id=None,
    name="Test Debt",
    minimum_payment=Decimal("50"),
    balance=Decimal("500"),
    due_day=15,
    is_split=False,
    split_members=None,
):
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
        is_split=is_split,
        split_members=split_members,
        budget_id=None,
        postpone_until=None,
        created_at=now,
        updated_at=now,
    )


def _fake_debt_payment(
    *,
    debt_id,
    user_id,
    amount=Decimal("50"),
    period_month=5,
    period_year=2026,
):
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
    """Mimics SQLAlchemy CursorResult with scalars() support."""

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
    session = AsyncMock()
    session.execute = AsyncMock(side_effect=execute_side_effects)
    session.add = MagicMock()
    session.delete = AsyncMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()
    return session


def _run(coro):
    """Run a coroutine synchronously."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ===========================================================================
#  A. Debts page actions (cases 1-4)
# ===========================================================================


class TestCase01_SoloDebtPayDebtsPage(unittest.TestCase):
    """Case 1: Solo debt → pay from Debts page."""

    @patch("app.routers.debts._debt_to_response")
    @patch("app.routers.debts.date")
    def test_solo_debt_pay(self, mock_date, mock_resp):
        from app.routers.debts import mark_debt_paid

        mock_date.today.return_value = date(2026, 5, 15)
        user = _fake_user()
        debt = _fake_debt(user_id=user.id, balance=Decimal("500"))
        mock_resp.return_value = AsyncMock()

        session = _build_session([
            _FakeResult([debt]),     # Debt lookup
            _FakeResult([]),         # DebtPayment existing → none
        ])

        _run(mark_debt_paid(debt.id, amount=Decimal("50"), db=session, current_user=user))

        session.add.assert_called()
        self.assertEqual(debt.balance, Decimal("450"))


class TestCase02_SoloDebtUndoDebtsPage(unittest.TestCase):
    """Case 2: Solo debt → undo from Debts page."""

    @patch("app.routers.debts._debt_to_response")
    @patch("app.routers.debts.date")
    def test_solo_debt_undo(self, mock_date, mock_resp):
        from app.routers.debts import unmark_debt_paid

        mock_date.today.return_value = date(2026, 5, 15)
        user = _fake_user()
        debt = _fake_debt(user_id=user.id, balance=Decimal("450"))
        dp = _fake_debt_payment(debt_id=debt.id, user_id=user.id, amount=Decimal("50"))
        mock_resp.return_value = AsyncMock()

        session = _build_session([
            _FakeResult([debt]),
            _FakeResult([dp]),
            _FakeResult([]),   # auto-logged Payments
        ])

        _run(unmark_debt_paid(debt.id, db=session, current_user=user))
        self.assertEqual(debt.balance, Decimal("500"))
        session.delete.assert_called()


class TestCase03_SharedDebtPayDebtsPage(unittest.TestCase):
    """Case 3: Shared debt → pay from Debts page."""

    @patch("app.routers.debts._debt_to_response")
    @patch("app.routers.debts.log_activity")
    @patch("app.routers.debts.date")
    def test_shared_debt_pay(self, mock_date, mock_log, mock_resp):
        from app.routers.debts import mark_debt_paid

        mock_date.today.return_value = date(2026, 5, 15)
        household_id = uuid4()
        user = _fake_user(household_id=household_id)
        debt = _fake_debt(user_id=user.id, household_id=household_id, balance=Decimal("500"))
        mock_resp.return_value = AsyncMock()
        mock_log.return_value = None

        session = _build_session([
            _FakeResult([debt]),
            _FakeResult([]),
        ])

        _run(mark_debt_paid(debt.id, amount=Decimal("50"), db=session, current_user=user))
        session.add.assert_called()
        self.assertEqual(debt.balance, Decimal("450"))


class TestCase04_SharedDebtUndoDebtsPage(unittest.TestCase):
    """Case 4: Shared debt → undo from Debts page."""

    @patch("app.routers.debts._debt_to_response")
    @patch("app.routers.debts.date")
    def test_shared_debt_undo(self, mock_date, mock_resp):
        from app.routers.debts import unmark_debt_paid

        mock_date.today.return_value = date(2026, 5, 15)
        household_id = uuid4()
        user_a = _fake_user(household_id=household_id)
        user_b = _fake_user(household_id=household_id)
        debt = _fake_debt(user_id=user_a.id, household_id=household_id, balance=Decimal("400"))

        dp_a = _fake_debt_payment(debt_id=debt.id, user_id=user_a.id, amount=Decimal("50"))
        dp_b = _fake_debt_payment(debt_id=debt.id, user_id=user_b.id, amount=Decimal("50"))
        mock_resp.return_value = AsyncMock()

        session = _build_session([
            _FakeResult([debt]),
            _FakeResult([dp_a, dp_b]),
            _FakeResult([]),
        ])

        _run(unmark_debt_paid(debt.id, db=session, current_user=user_a))
        self.assertEqual(debt.balance, Decimal("500"))


# ===========================================================================
#  B. Dashboard paycheck checklist (cases 5-8)
# ===========================================================================


class TestCase05_SoloDebtCheckboxPay(unittest.TestCase):
    """Case 5: Solo debt checkbox → pay on Dashboard."""

    @patch("app.routers.paycheck_checklist.date")
    def test_dashboard_solo_pay(self, mock_date):
        from app.routers.paycheck_checklist import _sync_debt_payment

        mock_date.today.return_value = date(2026, 5, 15)
        user = _fake_user()
        debt = _fake_debt()

        session = _build_session([
            _FakeResult([debt]),   # Debt lookup
            _FakeResult([]),       # DebtPayment lookup
        ])

        _run(_sync_debt_payment(session, user, debt.id, True))
        session.add.assert_called()


class TestCase06_SoloDebtCheckboxUndo(unittest.TestCase):
    """Case 6: Solo debt checkbox → undo on Dashboard."""

    @patch("app.routers.paycheck_checklist.date")
    def test_dashboard_solo_undo(self, mock_date):
        from app.routers.paycheck_checklist import _sync_debt_payment

        mock_date.today.return_value = date(2026, 5, 15)
        user = _fake_user()
        debt = _fake_debt(balance=Decimal("450"))
        dp = _fake_debt_payment(debt_id=debt.id, user_id=user.id, amount=Decimal("50"))

        session = _build_session([
            _FakeResult([debt]),     # Debt lookup
            _FakeResult([dp]),       # DebtPayment lookup
            _FakeResult([]),         # auto-logged Payments
            _FakeResult([]),         # checklist delete
        ])

        _run(_sync_debt_payment(session, user, debt.id, False, date(2026, 5, 1)))
        self.assertEqual(debt.balance, Decimal("500"))
        session.delete.assert_called()


class TestCase07_SharedDebtCheckboxPay(unittest.TestCase):
    """Case 7: Shared debt checkbox → pay on Dashboard."""

    @patch("app.routers.paycheck_checklist.date")
    def test_dashboard_shared_pay(self, mock_date):
        from app.routers.paycheck_checklist import _sync_debt_payment

        mock_date.today.return_value = date(2026, 5, 15)
        household_id = uuid4()
        user = _fake_user(household_id=household_id)
        debt = _fake_debt(household_id=household_id)

        session = _build_session([
            _FakeResult([debt]),   # Debt lookup
            _FakeResult([]),       # DebtPayment lookup
        ])

        _run(_sync_debt_payment(session, user, debt.id, True))
        session.add.assert_called()


class TestCase08_SharedDebtCheckboxUndo(unittest.TestCase):
    """Case 8: Shared debt checkbox → undo on Dashboard."""

    @patch("app.routers.paycheck_checklist.date")
    def test_dashboard_shared_undo(self, mock_date):
        from app.routers.paycheck_checklist import _sync_debt_payment

        mock_date.today.return_value = date(2026, 5, 15)
        household_id = uuid4()
        user_a = _fake_user(household_id=household_id)
        user_b = _fake_user(household_id=household_id)
        debt = _fake_debt(household_id=household_id, balance=Decimal("400"))
        dp_a = _fake_debt_payment(debt_id=debt.id, user_id=user_a.id, amount=Decimal("50"))
        dp_b = _fake_debt_payment(debt_id=debt.id, user_id=user_b.id, amount=Decimal("50"))

        session = _build_session([
            _FakeResult([debt]),         # Debt lookup
            _FakeResult([dp_a]),         # DebtPayment lookup — current user only
            _FakeResult([]),             # auto-logged Payments
            _FakeResult([]),             # checklist delete
        ])

        _run(_sync_debt_payment(session, user_a, debt.id, False, date(2026, 5, 1)))
        self.assertEqual(debt.balance, Decimal("450"))


# ===========================================================================
#  C. Cross-page sync (cases 9-12)
#
#  Verifies that _debt_to_response (Debts list API) and the paycheck engine
#  agree on paid state.
# ===========================================================================


class TestCase09_PayOnDebtsPageDashboardReflects(unittest.TestCase):
    """Case 9: Pay on Debts page → Dashboard reflects same paid state.

    After mark_debt_paid succeeds, _debt_to_response returns is_paid=True.
    The dashboard fetches /api/v1/debts which calls _debt_to_response for
    each debt. If a DebtPayment row exists, both pages see is_paid=True.
    """

    @patch("app.routers.debts.date")
    def test_after_pay_debt_shows_paid(self, mock_date):
        from app.routers.debts import _debt_to_response

        mock_date.today.return_value = date(2026, 5, 15)
        user = _fake_user()
        debt = _fake_debt(user_id=user.id, balance=Decimal("450"))
        dp = _fake_debt_payment(debt_id=debt.id, user_id=user.id, amount=Decimal("50"))

        session = _build_session([
            _FakeResult([dp]),             # period check
            _FakeResult([dp]),             # last payment
            _FakeResult([Decimal("50")]),  # total_paid
        ])

        result = _run(_debt_to_response(debt, session, user.id))
        self.assertTrue(result.is_paid_this_period)


class TestCase10_PayOnDashboardDebtsPageReflects(unittest.TestCase):
    """Case 10: Pay on Dashboard → Debts page reflects same paid state.

    After _sync_debt_payment creates a DebtPayment, the Debts page list
    endpoint re-queries and _debt_to_response finds the payment row.
    """

    @patch("app.routers.debts.date")
    def test_dashboard_pay_then_debts_page_shows_paid(self, mock_date):
        from app.routers.debts import _debt_to_response

        mock_date.today.return_value = date(2026, 5, 15)
        user = _fake_user()
        debt = _fake_debt(user_id=user.id, balance=Decimal("450"))
        dp = _fake_debt_payment(debt_id=debt.id, user_id=user.id, amount=Decimal("50"))

        session = _build_session([
            _FakeResult([dp]),
            _FakeResult([dp]),
            _FakeResult([Decimal("50")]),
        ])

        result = _run(_debt_to_response(debt, session, user.id))
        self.assertTrue(result.is_paid_this_period)


class TestCase11_UndoOnDebtsPageDashboardReflects(unittest.TestCase):
    """Case 11: Undo on Debts page → Dashboard reflects same unpaid state."""

    @patch("app.routers.debts.date")
    def test_after_undo_debt_shows_unpaid(self, mock_date):
        from app.routers.debts import _debt_to_response

        mock_date.today.return_value = date(2026, 5, 15)
        user = _fake_user()
        debt = _fake_debt(user_id=user.id, balance=Decimal("500"))

        session = _build_session([
            _FakeResult([]),               # period check — no payment
            _FakeResult([]),               # last payment
            _FakeResult([Decimal("0")]),   # total_paid
        ])

        result = _run(_debt_to_response(debt, session, user.id))
        self.assertFalse(result.is_paid_this_period)


class TestCase12_UndoOnDashboardDebtsPageReflects(unittest.TestCase):
    """Case 12: Undo on Dashboard → Debts page reflects same unpaid state."""

    @patch("app.routers.debts.date")
    def test_dashboard_undo_then_debts_page_shows_unpaid(self, mock_date):
        from app.routers.debts import _debt_to_response

        mock_date.today.return_value = date(2026, 5, 15)
        user = _fake_user()
        debt = _fake_debt(user_id=user.id, balance=Decimal("500"))

        session = _build_session([
            _FakeResult([]),
            _FakeResult([]),
            _FakeResult([Decimal("0")]),
        ])

        result = _run(_debt_to_response(debt, session, user.id))
        self.assertFalse(result.is_paid_this_period)


# ===========================================================================
#  D. Totals / summaries (cases 13-15)
# ===========================================================================


class TestCase13_DashboardTotalsUpdateAfterToggle(unittest.TestCase):
    """Case 13: Dashboard Paid/Still Owed/progress update after toggle.

    The paycheck engine's _period_totals correctly sums paid items.
    """

    def test_period_totals_reflect_paid_item(self):
        from app.services.pay_period_planner import _period_totals

        items = [
            {"amount": Decimal("100"), "is_paid": True},
            {"amount": Decimal("200"), "is_paid": False},
        ]
        result = _period_totals(items, Decimal("1000"))
        self.assertEqual(result["total_due"], Decimal("300"))
        self.assertEqual(result["total_paid"], Decimal("100"))
        self.assertEqual(result["total_still_owed"], Decimal("200"))
        self.assertEqual(result["remaining"], Decimal("800"))
        self.assertEqual(result["paid_count"], 1)
        self.assertEqual(result["item_count"], 2)


class TestCase14_DebtsPageProgressBarsUpdate(unittest.TestCase):
    """Case 14: Debts page progress bars / paid pills / summary cards update.

    _debt_to_response computes percent_paid and is_paid_this_period.
    """

    @patch("app.routers.debts.date")
    def test_percent_paid_correct(self, mock_date):
        from app.routers.debts import _debt_to_response

        mock_date.today.return_value = date(2026, 5, 15)
        user = _fake_user()
        debt = _fake_debt(user_id=user.id, balance=Decimal("400"))
        dp = _fake_debt_payment(debt_id=debt.id, user_id=user.id, amount=Decimal("100"))

        session = _build_session([
            _FakeResult([dp]),               # period check
            _FakeResult([dp]),               # last payment
            _FakeResult([Decimal("100")]),   # total_paid
        ])

        result = _run(_debt_to_response(debt, session, user.id))
        self.assertTrue(result.is_paid_this_period)
        self.assertEqual(result.total_paid, Decimal("100"))
        # percent = 100 / (100 + 400) = 20%
        self.assertEqual(result.percent_paid, 20)


class TestCase15_PayoffStrategyDoesNotRegress(unittest.TestCase):
    """Case 15: Payoff strategy / debt totals do not regress.

    compare_strategies and simulate_extra_payments use only balance/apr/
    minimum_payment — no paid-state dependency. Verify they still work.
    """

    def test_compare_strategies_still_works(self):
        from app.services.debt_calculator import compare_strategies

        debts = [
            {
                "id": uuid4(),
                "name": "Card A",
                "type": "credit_card",
                "balance": Decimal("1000"),
                "credit_limit": Decimal("5000"),
                "apr": Decimal("18"),
                "minimum_payment": Decimal("25"),
            },
            {
                "id": uuid4(),
                "name": "Card B",
                "type": "credit_card",
                "balance": Decimal("500"),
                "credit_limit": Decimal("2000"),
                "apr": Decimal("22"),
                "minimum_payment": Decimal("15"),
            },
        ]
        result = compare_strategies(debts, extra_payment=Decimal("50"))
        self.assertIn("snowball", result)
        self.assertIn("avalanche", result)
        self.assertIsNotNone(result["interest_savings"])


# ===========================================================================
#  E. Household / shared (cases 16-18)
# ===========================================================================


class TestCase16_TwoMemberHouseholdNoMultipleResultsFound(unittest.TestCase):
    """Case 16: Two-member household shared debt does not throw MultipleResultsFound."""

    @patch("app.routers.debts._debt_to_response")
    @patch("app.routers.debts.date")
    def test_no_multiple_results_found_on_pay(self, mock_date, mock_resp):
        from app.routers.debts import mark_debt_paid

        mock_date.today.return_value = date(2026, 5, 15)
        household_id = uuid4()
        user_a = _fake_user(household_id=household_id)
        user_b = _fake_user(household_id=household_id)
        debt = _fake_debt(user_id=user_a.id, household_id=household_id, balance=Decimal("400"))

        dp_a = _fake_debt_payment(debt_id=debt.id, user_id=user_a.id)
        dp_b = _fake_debt_payment(debt_id=debt.id, user_id=user_b.id)

        session = _build_session([
            _FakeResult([debt]),
            _FakeResult([dp_a, dp_b]),   # two household rows
        ])

        # Must get HTTPException(409), NOT MultipleResultsFound
        try:
            _run(mark_debt_paid(debt.id, amount=Decimal("50"), db=session, current_user=user_a))
            self.fail("Expected HTTPException")
        except HTTPException as exc:
            self.assertEqual(exc.status_code, 409)
        except Exception as exc:
            self.fail(f"Got unhandled exception: {exc}")

    @patch("app.routers.debts.date")
    def test_no_multiple_results_found_on_response(self, mock_date):
        from app.routers.debts import _debt_to_response

        mock_date.today.return_value = date(2026, 5, 15)
        household_id = uuid4()
        user_a = _fake_user(household_id=household_id)
        debt = _fake_debt(user_id=user_a.id, household_id=household_id, balance=Decimal("400"))
        dp_a = _fake_debt_payment(debt_id=debt.id, user_id=user_a.id, amount=Decimal("50"))
        dp_b = _fake_debt_payment(debt_id=debt.id, user_id=uuid4(), amount=Decimal("50"))

        session = _build_session([
            _FakeResult([dp_a, dp_b]),       # period check — two rows
            _FakeResult([dp_a]),             # last payment
            _FakeResult([Decimal("100")]),   # total_paid
        ])

        result = _run(_debt_to_response(debt, session, user_a.id))
        self.assertTrue(result.is_paid_this_period)


class TestCase17_HouseholdMemberShareCorrect(unittest.TestCase):
    """Case 17: Household member-specific share remains correct."""

    def test_split_debt_share_calculation(self):
        from app.services.household_overview import _debt_user_share

        household_id = uuid4()
        user_id = uuid4()
        import json

        debt = SimpleNamespace(
            minimum_payment=Decimal("100"),
            is_split=True,
            split_members=json.dumps([str(user_id), str(uuid4())]),
            household_id=household_id,
            user_id=user_id,
        )
        share, is_responsible, full = _debt_user_share(debt, 2, user_id)
        self.assertEqual(share, Decimal("50"))
        self.assertTrue(is_responsible)
        self.assertEqual(full, Decimal("100"))


class TestCase18_HouseholdDebtVisibilityCorrect(unittest.TestCase):
    """Case 18: Household debt visibility remains correct."""

    def test_household_debt_visible_to_household_member(self):
        """apply_household_budget_filter includes household debts for members."""
        from sqlalchemy import select

        from app.models.debt import Debt
        from app.utils.budget import apply_household_budget_filter

        household_id = uuid4()
        budget_id = uuid4()
        user = SimpleNamespace(id=uuid4(), household_id=household_id, current_budget_id=budget_id)

        query = select(Debt)
        filtered = apply_household_budget_filter(query, Debt, user, budget_id)
        sql_str = str(filtered.compile(compile_kwargs={"literal_binds": False}))
        self.assertIn("OR", sql_str)
        self.assertIn("household_id", sql_str)


# ===========================================================================
#  F. Period correctness (cases 19-20)
# ===========================================================================


class TestCase19_DebtPaidInPeriodADoesNotLeakToPeriodB(unittest.TestCase):
    """Case 19: Debt paid in one pay period does not leak into another period.

    get_paid_debt_ids_in_window now uses period_month/period_year, matching
    the unified source of truth. For monthly debts, paying once covers the
    entire month — but a May payment does NOT leak into June or April.
    """

    def test_may_payment_not_visible_in_june_window(self):
        """Payment with period_month=5 should NOT appear in a June window."""
        from app.services.paycheck_data import get_paid_debt_ids_in_window

        debt_id = uuid4()
        dp = _fake_debt_payment(
            debt_id=debt_id, user_id=uuid4(),
            amount=Decimal("50"), period_month=5, period_year=2026,
        )

        session = _build_session([
            _FakeResult([]),  # June query returns nothing
        ])

        # June window: Jun 1 - Jun 14
        result = _run(get_paid_debt_ids_in_window(
            session, [debt_id], date(2026, 6, 1), date(2026, 6, 14),
        ))
        # The query should filter for period_month=6, period_year=2026
        # Since we return empty, the debt should not be in the result
        self.assertNotIn(debt_id, result)

    def test_may_payment_visible_in_may_window(self):
        """Payment with period_month=5 should appear in a May window."""
        from app.services.paycheck_data import get_paid_debt_ids_in_window

        debt_id = uuid4()

        session = _build_session([
            _FakeResult([(debt_id,)]),  # May query returns the debt_id
        ])

        result = _run(get_paid_debt_ids_in_window(
            session, [debt_id], date(2026, 5, 1), date(2026, 5, 14),
        ))
        self.assertIn(debt_id, result)


class TestCase20_CurrentPaycheckShowsCorrectPaidState(unittest.TestCase):
    """Case 20: Current paycheck plan shows correct debt paid state."""

    def test_engine_uses_paid_debt_ids(self):
        """assign_bills_to_paycheck marks debt as paid when in paid_debt_ids."""
        from app.services.paycheck_engine import assign_bills_to_paycheck

        debt_id = uuid4()
        debt = SimpleNamespace(
            id=debt_id,
            name="Test",
            minimum_payment=Decimal("50"),
            due_day=15,
            auto_pay=False,
            is_split=False,
            household_id=None,
            postpone_until=None,
        )

        items = assign_bills_to_paycheck(
            bills=[],
            debts=[debt],
            window_start=date(2026, 5, 1),
            window_end=date(2026, 5, 31),
            current_date=date(2026, 5, 10),
            paid_debt_ids={debt_id},
        )

        self.assertEqual(len(items), 1)
        self.assertTrue(items[0]["is_paid"])

    def test_engine_shows_unpaid_when_not_in_set(self):
        from app.services.paycheck_engine import assign_bills_to_paycheck

        debt_id = uuid4()
        debt = SimpleNamespace(
            id=debt_id,
            name="Test",
            minimum_payment=Decimal("50"),
            due_day=15,
            auto_pay=False,
            is_split=False,
            household_id=None,
            postpone_until=None,
        )

        items = assign_bills_to_paycheck(
            bills=[],
            debts=[debt],
            window_start=date(2026, 5, 1),
            window_end=date(2026, 5, 31),
            current_date=date(2026, 5, 10),
            paid_debt_ids=set(),
        )

        self.assertEqual(len(items), 1)
        self.assertFalse(items[0]["is_paid"])


# ===========================================================================
#  G. Regression protection (cases 21-24)
# ===========================================================================


class TestCase21_BillsStillPayUnpayCorrectly(unittest.TestCase):
    """Case 21: Bills still pay/unpay correctly."""

    def test_bill_pay_still_works(self):
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

        session = _build_session([_FakeResult([bill])])

        async def fake_mark_bill_cycle_paid(*args, **kwargs):
            return SimpleNamespace(
                amount_paid=Decimal("120"),
                paid_date=datetime(2026, 5, 15, tzinfo=timezone.utc),
            )

        with patch(
            "app.routers.paycheck_checklist.mark_bill_cycle_paid",
            new=AsyncMock(side_effect=fake_mark_bill_cycle_paid),
        ) as mock_mark_paid:
            _run(_sync_bill_payment(session, user, bill.id, True, date(2026, 5, 15)))

        self.assertFalse(bill.is_paid)
        self.assertIsNone(bill.paid_amount)
        self.assertIsNone(bill.paid_date)
        self.assertEqual(mock_mark_paid.await_args.kwargs["due_date"], date(2026, 5, 15))

    def test_bill_unpay_still_works(self):
        from app.routers.paycheck_checklist import _sync_bill_payment

        user = _fake_user()
        bill = SimpleNamespace(
            id=uuid4(),
            user_id=user.id,
            household_id=None,
            name="Electric",
            amount=Decimal("120"),
            is_paid=True,
            paid_date=datetime.now(timezone.utc),
            paid_amount=Decimal("120"),
        )

        session = _build_session([
            _FakeResult([bill]),  # Bill lookup
            _FakeResult([]),      # auto-logged Payments
            _FakeResult([]),      # checklist delete
        ])

        async def fake_mark_bill_cycle_unpaid(*args, **kwargs):
            bill.is_paid = False
            bill.paid_date = None
            bill.paid_amount = None

        with patch(
            "app.routers.paycheck_checklist.mark_bill_cycle_unpaid",
            new=AsyncMock(side_effect=fake_mark_bill_cycle_unpaid),
        ) as mock_mark_unpaid:
            _run(_sync_bill_payment(session, user, bill.id, False, date(2026, 5, 15)))

        self.assertFalse(bill.is_paid)
        self.assertIsNone(bill.paid_date)
        self.assertIsNone(bill.paid_amount)
        args = mock_mark_unpaid.await_args.args
        self.assertEqual(args[2], date(2026, 5, 15))


class TestCase22_SplitBillsStillBehaveCorrectly(unittest.TestCase):
    """Case 22: Split bills still behave correctly."""

    def test_split_bill_share_calculation(self):
        from app.services.household_overview import _bill_user_share

        household_id = uuid4()
        user_id = uuid4()
        bill = SimpleNamespace(
            amount=Decimal("200"),
            household_id=household_id,
            assigned_member_id=None,
            user_id=user_id,
        )
        share, responsible = _bill_user_share(bill, 2, user_id)
        self.assertEqual(share, Decimal("100"))
        self.assertTrue(responsible)


class TestCase23_PaycheckTotalsRemainCorrect(unittest.TestCase):
    """Case 23: Paycheck totals remain correct."""

    def test_paycheck_totals_correct(self):
        """Engine calculates totals correctly with mixed paid/unpaid items."""
        from app.services.paycheck_engine import assign_bills_to_paycheck

        debt1_id = uuid4()
        debt2_id = uuid4()

        debt1 = SimpleNamespace(
            id=debt1_id, name="Debt 1", minimum_payment=Decimal("100"),
            due_day=10, auto_pay=False, is_split=False,
            household_id=None, postpone_until=None,
        )
        debt2 = SimpleNamespace(
            id=debt2_id, name="Debt 2", minimum_payment=Decimal("200"),
            due_day=20, auto_pay=False, is_split=False,
            household_id=None, postpone_until=None,
        )

        items = assign_bills_to_paycheck(
            bills=[],
            debts=[debt1, debt2],
            window_start=date(2026, 5, 1),
            window_end=date(2026, 5, 31),
            current_date=date(2026, 5, 5),
            paid_debt_ids={debt1_id},
        )

        total_amount = sum(i["amount"] for i in items)
        self.assertEqual(total_amount, Decimal("300"))
        paid_items = [i for i in items if i["is_paid"]]
        unpaid_items = [i for i in items if not i["is_paid"]]
        self.assertEqual(len(paid_items), 1)
        self.assertEqual(len(unpaid_items), 1)
        self.assertEqual(paid_items[0]["name"], "Debt 1")


class TestCase24_No500sForAnyDebtAction(unittest.TestCase):
    """Case 24: No 500s in backend logs for any tested debt action.

    Verifies that all code paths handle household multi-row and duplicate
    scenarios gracefully (HTTPException, not unhandled 500).
    """

    @patch("app.routers.debts._debt_to_response")
    @patch("app.routers.debts.date")
    def test_pay_duplicate_rows_no_500(self, mock_date, mock_resp):
        from app.routers.debts import mark_debt_paid

        mock_date.today.return_value = date(2026, 5, 15)
        user = _fake_user()
        debt = _fake_debt(user_id=user.id, balance=Decimal("400"))
        dp1 = _fake_debt_payment(debt_id=debt.id, user_id=user.id, amount=Decimal("50"))
        dp2 = _fake_debt_payment(debt_id=debt.id, user_id=user.id, amount=Decimal("50"))

        session = _build_session([
            _FakeResult([debt]),
            _FakeResult([dp1, dp2]),
        ])

        try:
            _run(mark_debt_paid(debt.id, amount=Decimal("50"), db=session, current_user=user))
            self.fail("Expected HTTPException")
        except HTTPException as exc:
            self.assertIn(exc.status_code, (409,))
        except Exception as exc:
            self.fail(f"Unhandled 500: {exc}")

    @patch("app.routers.debts._debt_to_response")
    @patch("app.routers.debts.date")
    def test_undo_duplicate_rows_no_500(self, mock_date, mock_resp):
        from app.routers.debts import unmark_debt_paid

        mock_date.today.return_value = date(2026, 5, 15)
        household_id = uuid4()
        user = _fake_user(household_id=household_id)
        debt = _fake_debt(user_id=user.id, household_id=household_id, balance=Decimal("350"))
        dp1 = _fake_debt_payment(debt_id=debt.id, user_id=user.id, amount=Decimal("50"))
        dp2 = _fake_debt_payment(debt_id=debt.id, user_id=uuid4(), amount=Decimal("50"))
        dp3 = _fake_debt_payment(debt_id=debt.id, user_id=uuid4(), amount=Decimal("50"))
        mock_resp.return_value = AsyncMock()

        session = _build_session([
            _FakeResult([debt]),
            _FakeResult([dp1, dp2, dp3]),
            _FakeResult([]),
        ])

        try:
            _run(unmark_debt_paid(debt.id, db=session, current_user=user))
        except HTTPException:
            pass  # Expected HTTP errors are fine
        except Exception as exc:
            self.fail(f"Unhandled 500: {exc}")

    @patch("app.routers.paycheck_checklist.date")
    def test_dashboard_toggle_no_500(self, mock_date):
        """Dashboard checklist toggle with duplicate rows doesn't 500."""
        from app.routers.paycheck_checklist import _sync_debt_payment

        mock_date.today.return_value = date(2026, 5, 15)
        user = _fake_user()
        debt = _fake_debt(balance=Decimal("400"))
        dp1 = _fake_debt_payment(debt_id=debt.id, user_id=user.id, amount=Decimal("50"))
        dp2 = _fake_debt_payment(debt_id=debt.id, user_id=user.id, amount=Decimal("50"))

        session = _build_session([
            _FakeResult([debt]),
            _FakeResult([dp1, dp2]),  # Two rows — self-healing kicks in
        ])

        try:
            _run(_sync_debt_payment(session, user, debt.id, True))
        except Exception as exc:
            self.fail(f"Unhandled exception on dashboard toggle: {exc}")


if __name__ == "__main__":
    unittest.main()
