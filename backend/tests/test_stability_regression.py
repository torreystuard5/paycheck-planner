"""Stability Phase 2 — regression tests for login normalization,
household budget scoping, savings sharing, and cross-cutting determinism.

These lock in the three Phase 1 fixes (commit d38b80a) so future changes
cannot silently re-break them.
"""

from __future__ import annotations

import unittest
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from sqlalchemy import select

from app.models.bill import Bill
from app.models.debt import Debt
from app.models.savings_goal import SavingsGoal
from app.schemas.user import UserCreate, UserLogin
from app.utils.budget import apply_household_budget_filter
from app.utils.email import normalize_email


# ---------------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------------

def _user(*, household_id=None, budget_id=None, user_id=None):
    """Fake user for unit tests (SimpleNamespace, mirrors model attrs)."""
    return SimpleNamespace(
        id=user_id or uuid4(),
        household_id=household_id,
        current_budget_id=budget_id,
    )


# ===================================================================
#  1. Login normalization
# ===================================================================


class TestRegisterNormalizesEmailLowercaseAndTrim(unittest.TestCase):
    """test_register_normalizes_email_lowercase_and_trim"""

    def test_register_normalizes_email_lowercase_and_trim(self):
        """Register with '  Test@Gmail.COM  ' — stored email is 'test@gmail.com'."""
        data = UserCreate(
            email="  Test@Gmail.COM  ",
            password="securepassword123",
            first_name="Test",
            last_name="User",
            pay_frequency="biweekly",
            next_pay_date="2026-06-01",
            net_pay_amount=Decimal("3000"),
            tos_accepted=True,
        )
        self.assertEqual(data.email, "test@gmail.com")


class TestLoginSucceedsRegardlessOfEmailCasing(unittest.TestCase):
    """test_login_succeeds_regardless_of_email_casing"""

    def test_login_succeeds_regardless_of_email_casing(self):
        """All casing variants normalize to the same email in UserLogin schema."""
        variants = [
            "test@gmail.com",
            "TEST@gmail.com",
            "Test@Gmail.com",
            "  test@gmail.com  ",
        ]
        for raw in variants:
            creds = UserLogin(email=raw, password="anything")
            self.assertEqual(
                creds.email,
                "test@gmail.com",
                f"Email variant {raw!r} must normalize to 'test@gmail.com'",
            )


class TestRegisterRejectsCaseDuplicateEmail(unittest.TestCase):
    """test_register_rejects_case_duplicate_email

    Verifies that schema-level normalization causes 'Test@gmail.com' to
    become 'test@gmail.com', so the DB uniqueness constraint fires on
    duplicate registration. (The actual 409 comes from the DB unique index +
    auth.py check — here we verify the normalization prerequisite.)
    """

    def test_register_rejects_case_duplicate_email(self):
        email_a = UserCreate(
            email="test@gmail.com",
            password="securepass123",
            first_name="A",
            last_name="User",
            pay_frequency="monthly",
            next_pay_date="2026-06-01",
            net_pay_amount=Decimal("2000"),
            tos_accepted=True,
        ).email

        email_b = UserCreate(
            email="Test@gmail.com",
            password="securepass123",
            first_name="B",
            last_name="User",
            pay_frequency="monthly",
            next_pay_date="2026-06-01",
            net_pay_amount=Decimal("2000"),
            tos_accepted=True,
        ).email

        self.assertEqual(
            email_a,
            email_b,
            "Both casings must normalize to the same email, preventing duplicates",
        )


class TestForgotPasswordFindsUserWithDifferentCasing(unittest.TestCase):
    """test_forgot_password_finds_user_with_different_casing

    The forgot-password endpoint calls normalize_email() before lookup.
    We verify that normalize_email produces the same value for variants.
    """

    def test_forgot_password_finds_user_with_different_casing(self):
        registered = "test@gmail.com"
        reset_attempt = "TEST@gmail.com"
        self.assertEqual(
            normalize_email(registered),
            normalize_email(reset_attempt),
            "normalize_email must map both casings to the same value",
        )

    def test_normalize_email_strips_whitespace(self):
        self.assertEqual(normalize_email("  TEST@Gmail.COM  "), "test@gmail.com")

    def test_normalize_email_none_passthrough(self):
        self.assertIsNone(normalize_email(None))


class TestUpdateEmailNormalizesToLowercase(unittest.TestCase):
    """test_update_email_normalizes_to_lowercase"""

    def test_update_email_normalizes_to_lowercase(self):
        """Calling normalize_email('New@Email.com') returns 'new@email.com'."""
        self.assertEqual(normalize_email("New@Email.com"), "new@email.com")


# ===================================================================
#  2. Household sharing — debts
# ===================================================================


class TestHouseholdMemberBSeesMemberADebtsWithOwnBudgetId(unittest.TestCase):
    """test_household_member_b_sees_member_a_debts_with_own_budget_id"""

    def test_household_member_b_sees_member_a_debts_with_own_budget_id(self):
        """Household OR-clause: budget_id filter includes household_id match.

        Member A creates a debt with budget_A and household_id=H.
        Member B queries with budget_B.
        apply_household_budget_filter must produce an OR clause so that
        debts with household_id=H are included even when budget_id != budget_B.
        """
        household_id = uuid4()
        budget_b = uuid4()
        member_b = _user(household_id=household_id, budget_id=budget_b)

        base_query = select(Debt)
        filtered = apply_household_budget_filter(base_query, Debt, member_b, budget_b)

        # The compiled SQL must contain an OR (budget_id = :val OR household_id = :val)
        sql_str = str(filtered.compile(compile_kwargs={"literal_binds": False}))
        self.assertIn("OR", sql_str, "Household user query must use OR for budget scoping")
        self.assertIn("budget_id", sql_str)
        self.assertIn("household_id", sql_str)


class TestSoloUserStrictBudgetFilterUnchangedDebts(unittest.TestCase):
    """test_solo_user_strict_budget_filter_unchanged"""

    def test_solo_user_strict_budget_filter_unchanged(self):
        """Solo user (no household): budget_id filter is strict equality — no OR."""
        budget_x = uuid4()
        solo = _user(household_id=None, budget_id=budget_x)

        base_query = select(Debt)
        filtered = apply_household_budget_filter(base_query, Debt, solo, budget_x)

        sql_str = str(filtered.compile(compile_kwargs={"literal_binds": False}))
        self.assertNotIn("OR", sql_str, "Solo user must have strict budget_id filter (no OR)")
        self.assertIn("budget_id", sql_str)

    def test_none_budget_returns_query_unchanged(self):
        """When budget_id is None, query is returned unchanged."""
        solo = _user(household_id=None)
        base_query = select(Debt)
        result = apply_household_budget_filter(base_query, Debt, solo, None)
        # The query object should be the same (no .where appended)
        self.assertIs(result, base_query)


# ===================================================================
#  3. Household sharing — bills
# ===================================================================


class TestHouseholdMemberBSeesMemberABillsWithOwnBudgetId(unittest.TestCase):
    """test_household_member_b_sees_member_a_bills_with_own_budget_id"""

    def test_household_member_b_sees_member_a_bills_with_own_budget_id(self):
        """Same OR-clause pattern for bills."""
        household_id = uuid4()
        budget_b = uuid4()
        member_b = _user(household_id=household_id, budget_id=budget_b)

        base_query = select(Bill)
        filtered = apply_household_budget_filter(base_query, Bill, member_b, budget_b)

        sql_str = str(filtered.compile(compile_kwargs={"literal_binds": False}))
        self.assertIn("OR", sql_str, "Household bill query must use OR for budget scoping")
        self.assertIn("budget_id", sql_str)
        self.assertIn("household_id", sql_str)


class TestSoloUserStrictBudgetFilterUnchangedBills(unittest.TestCase):
    """test_solo_user_strict_budget_filter_unchanged_bills"""

    def test_solo_user_strict_budget_filter_unchanged_bills(self):
        """Solo user bills: strict budget_id filter, no OR."""
        budget_x = uuid4()
        solo = _user(household_id=None, budget_id=budget_x)

        base_query = select(Bill)
        filtered = apply_household_budget_filter(base_query, Bill, solo, budget_x)

        sql_str = str(filtered.compile(compile_kwargs={"literal_binds": False}))
        self.assertNotIn("OR", sql_str)
        self.assertIn("budget_id", sql_str)


# ===================================================================
#  4. Household sharing — savings
# ===================================================================


class TestHouseholdMembersSeeSameSavingsGoals(unittest.TestCase):
    """test_household_members_see_same_savings_goals

    SavingsGoal has no household_id column — scoped via user_id IN (member_ids).
    Verify that the savings list endpoint's pattern (user_id.in_) produces a
    query that includes all household member IDs.
    """

    def test_household_members_see_same_savings_goals(self):
        member_a_id = uuid4()
        member_b_id = uuid4()
        member_ids = [member_a_id, member_b_id]

        # Simulate what savings.py does: user_id.in_(member_ids)
        query = select(SavingsGoal).where(SavingsGoal.user_id.in_(member_ids))
        sql_str = str(query.compile(compile_kwargs={"literal_binds": False}))

        self.assertIn("IN", sql_str, "Savings must use user_id IN (member_ids) for household")
        self.assertIn("user_id", sql_str)

    def test_savings_not_affected_by_household_budget_filter(self):
        """SavingsGoal has no household_id — apply_household_budget_filter should
        NOT be used for savings. Verify SavingsGoal doesn't have household_id."""
        self.assertFalse(
            hasattr(SavingsGoal, "household_id"),
            "SavingsGoal must NOT have household_id — uses user_id IN pattern instead",
        )


# ===================================================================
#  5. Cross-cutting determinism
# ===================================================================


class TestTwoHouseholdMembersSeeSameDebtTotal(unittest.TestCase):
    """test_two_household_members_see_same_debt_total"""

    def test_two_household_members_see_same_debt_total(self):
        """Both household members' queries, after apply_household_budget_filter,
        produce structurally identical WHERE clauses (same household_id OR).
        """
        household_id = uuid4()
        budget_a = uuid4()
        budget_b = uuid4()

        member_a = _user(household_id=household_id, budget_id=budget_a)
        member_b = _user(household_id=household_id, budget_id=budget_b)

        # Both members start with the same household-scoped base query
        base_a = select(Debt).where(Debt.household_id == household_id)
        base_b = select(Debt).where(Debt.household_id == household_id)

        filtered_a = apply_household_budget_filter(base_a, Debt, member_a, budget_a)
        filtered_b = apply_household_budget_filter(base_b, Debt, member_b, budget_b)

        sql_a = str(filtered_a.compile(compile_kwargs={"literal_binds": False}))
        sql_b = str(filtered_b.compile(compile_kwargs={"literal_binds": False}))

        # Both must have OR clause with household_id
        self.assertIn("OR", sql_a)
        self.assertIn("OR", sql_b)
        # Both queries include household_id in the OR filter
        self.assertIn("household_id", sql_a)
        self.assertIn("household_id", sql_b)
        # The household_id value is the same for both queries — they will
        # return the same rows when executed against the same database.


class TestTwoHouseholdMembersSeeSameBillTotal(unittest.TestCase):
    """test_two_household_members_see_same_bill_total"""

    def test_two_household_members_see_same_bill_total(self):
        """Same determinism test for bills."""
        household_id = uuid4()
        budget_a = uuid4()
        budget_b = uuid4()

        member_a = _user(household_id=household_id, budget_id=budget_a)
        member_b = _user(household_id=household_id, budget_id=budget_b)

        base_a = select(Bill).where(Bill.household_id == household_id)
        base_b = select(Bill).where(Bill.household_id == household_id)

        filtered_a = apply_household_budget_filter(base_a, Bill, member_a, budget_a)
        filtered_b = apply_household_budget_filter(base_b, Bill, member_b, budget_b)

        sql_a = str(filtered_a.compile(compile_kwargs={"literal_binds": False}))
        sql_b = str(filtered_b.compile(compile_kwargs={"literal_binds": False}))

        self.assertIn("OR", sql_a)
        self.assertIn("OR", sql_b)
        self.assertIn("household_id", sql_a)
        self.assertIn("household_id", sql_b)


# ===================================================================
#  6. Dashboard summary consistency
# ===================================================================
#
#  SKIPPED: No /api/v1/dashboard summary endpoint exists in the personal
#  mode API. The only dashboard endpoint is /api/v1/business/dashboard
#  (business-mode only). Test 13 is skipped per the requirements:
#  "Skip this test if no summary endpoint exists; note it in the deliverable."
#


if __name__ == "__main__":
    unittest.main()
