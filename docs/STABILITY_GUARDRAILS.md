# Stability Guardrails

Architectural rules for PayDrift. Read this before submitting code that touches
authentication, data fetching, budget scoping, or household sharing.

---

## 1. Authentication & Email

All email comparisons and storage **must** go through `app/utils/email.normalize_email`.

- Registration: schema `UserCreate` has a `field_validator` that normalizes.
- Login: schema `UserLogin` has the same validator.
- Forgot-password: `auth.py` calls `normalize_email()` before DB lookup.
- Update-email: `auth.py` calls `normalize_email()` on the new value.

**Never** compare emails with raw `==` on user input. The DB stores lowercase
only, and the `users.email` unique constraint prevents case-only duplicates.

```python
# GOOD
from app.utils.email import normalize_email
email = normalize_email(raw_input)

# BAD
if user_input == stored_email:  # case-sensitive — will fail
```

---

## 2. Budget Scoping

Every list endpoint with an optional `budget_id` query parameter must decide:

| Entity type | Has `household_id`? | Filter strategy |
|---|---|---|
| Bill, Debt | Yes | `apply_household_budget_filter(query, Model, current_user, budget_id)` |
| SavingsGoal | No | `user_id IN (household_member_ids)` — keep existing pattern |
| Income, PaycheckSchedule | No | Strict `budget_id == value` (personal only, not shared) |

The helper lives in `app/utils/budget.py`. It applies:
- **Solo user**: strict `WHERE budget_id = :val`
- **Household user**: `WHERE (budget_id = :val OR household_id = :household)`

Do **NOT** apply `apply_household_budget_filter` to models without a
`household_id` column (e.g. SavingsGoal).

The paycheck engine intentionally has **no** budget filter — it sees all
active bills/debts for the household. Do not add one.

Reference: Phase 1 Fix 2, commit d38b80a.

---

## 3. Frontend Data Fetches

Any page that passes `?budget_id=` to an API call **must** gate the fetch on
`BudgetContext.loading === false`.

```jsx
// GOOD — Dashboard.jsx pattern
useEffect(() => {
  if (budgetLoading || !activeBudget?.id) return;
  fetchDashboardData(activeBudget.id);
}, [activeBudget, budgetLoading]);

// BAD — fires before budget resolves, gets unscoped data
useEffect(() => {
  fetchDashboardData(activeBudget?.id);
}, [activeBudget]);
```

Never fetch data before the active budget is resolved. The first fetch
without `budget_id` returns ALL data across all budgets, which causes
amount-due inconsistencies.

Reference: Phase 1 Fix 3, commit d38b80a.

---

## 4. Logout Cleanup

Every key written to `localStorage` **must** be removed in
`AuthContext.logout()`.

Current keys cleared on logout:
- `access_token`
- `refresh_token`
- `active_budget_id`

When you add a new `localStorage` key, add a corresponding
`localStorage.removeItem()` in the logout function. This prevents data
leakage when two users share a device.

Reference: Phase 1 Fix 3, commit d38b80a.

---

## 5. Mutation Refresh

After **any** create, update, or delete mutation, the affected page's data
must refresh. Two patterns:

1. **`bumpBudgetVersion()`** from BudgetContext — triggers re-fetch in all
   components that depend on `budgetVersion`.
2. **Direct refetch** — call the list/detail fetch again after the mutation
   succeeds.

Never rely on optimistic updates alone. The server is the source of truth,
especially for household-shared entities where another member may have
mutated the same data.

---

## 6. Source of Truth for Paid State

Bills and debts have a **per-cycle** paid state, determined by the `payments`
(or `debt_payments`) table within the pay-period window.

- The global `Bill.is_paid` flag is a **Bills-page convenience only**.
- The paycheck engine and dashboard **must NOT** trust `Bill.is_paid` for
  cycle-level decisions.
- The engine uses `paid_bill_map` (built from payment rows scoped to the
  pay-period window) to determine paid/unpaid per period.

```
Period A: payment exists  → bill shows PAID
Period B: no payment      → bill shows UNPAID (even if Bill.is_paid=True)
```

Never carry paid state forward between periods. Each period is independent.

Reference: Commits 2120318, b2ceebb.

---

## 7. PR Review Checklist

Copy into PR descriptions when reviewing PayDrift changes:

```markdown
- [ ] Doesn't add Pro/subscription/tier checks
- [ ] Doesn't add Stripe or payment gating
- [ ] Doesn't entangle Ko-fi/supporter with tier logic
- [ ] No global `overflow-x:hidden` or `position:fixed` on body
- [ ] No `autoFocus` on iOS PIN inputs
- [ ] Tap targets ≥ 44px on mobile
- [ ] Page data refreshes after every mutation
- [ ] New list endpoints with `budget_id` filter handle household scope correctly
- [ ] Email comparisons go through `normalize_email`
- [ ] localStorage keys cleaned up on logout
```
