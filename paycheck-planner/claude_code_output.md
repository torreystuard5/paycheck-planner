# Batch A progress (PayDrift / Paycheck Planner)

## Implemented in this session

1. **Forgot-password rate limit** — In-process sliding window: max **3 requests per hour per email** on `POST /api/v1/auth/forgot-password` (`app/utils/rate_limit.py`, `auth.py`). Same generic success message when limited (no enumeration).

2. **Bills visibility** — `GET /api/v1/bills` accepts `include_hidden` (default `true`). When `false`, rows with `hidden_overdue` are excluded. New `GET /api/v1/bills/hidden` lists hidden-overdue bills. Bills UI defaults to `include_hidden=false` with a **Show hidden overdue** checkbox.

3. **Dashboard** — `GET /api/v1/dashboard/upcoming-bills` (query `days`, `limit`): unpaid active bills whose computed `next_due_date` is on or before `today + days` (includes overdue through the engine’s next due). Frontend: **Remaining to spend** highlight card + collapsible **Upcoming bills** section (`sectionKey: upcoming_bills` for UI prefs).

4. **Reports** — `GET /api/v1/reports/spending?months=` aggregates household-aware `Payment` rows with optional bill/debt joins; Reports page new **Spending** tab (monthly bar + category pie).

5. **Recurring subscriptions (tracker)** — Table + model + `GET/POST/PUT/DELETE /api/v1/recurring-subscriptions` (does not conflict with `/api/v1/subscriptions/status`). New page `/recurring-subscriptions` + sidebar **Subscriptions**.

6. **Household shopping list** — Table `household_shopping_items`; `GET/POST/PATCH/DELETE` under `/api/v1/households/shopping-list`. Household page: shared list with add, tap-to-toggle purchased, delete.

## Alembic chain

- `039` → **`040_recurring_subscriptions_shopping.py`** (`revision = "040"`, `down_revision = "039"`).

Run: `cd backend && alembic upgrade head`

## Already present (not re-implemented)

- Self-service forgot/reset password + email copy; **admin** `POST /api/v1/admin/users/{user_id}/reset-password` with audit `initiated_password_reset`.
- `hidden_overdue` + hide/unhide patch routes; calendar at `/api/v1/calendar` + full `Calendar.jsx`.

## Not done / partial vs full Batch A prompt

- Bill reminders email + `reminder_sent` / notification bell / business team & email / broad “real-time” refetch pass across all pages.
- Settings page dedicated “hidden bills” management (API exists; UI is Bills checkbox + dashboard behavior).
- Full 70-item checklist verification and automated tests.

## Files touched (high level)

Backend: `main.py`, `auth.py`, `bills.py`, new `dashboard.py`, `reports.py`, `recurring_subscriptions.py`, `households.py`, `models/*` (User, Household, new models), `schemas/household.py`, `schemas/recurring_subscription.py`, `models/__init__.py`, `alembic/versions/040_*.py`, `utils/rate_limit.py`.

Frontend: `Dashboard.jsx`, `Bills.jsx`, `Household.jsx`, `Reports.jsx`, `RecurringSubscriptions.jsx`, `App.jsx`, `Sidebar.jsx`.
