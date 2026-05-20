# Pay period planning — architecture notes

## Pay calendar (anchor)

- **Source:** `income_sources` (frequency, `next_pay_date`) + `paycheck_entries` for logged amounts.
- **Not used for period boundaries:** `paycheck_schedules` (legacy/auxiliary UI only).
- **Household:** All members share the same current/next periods, derived from the household’s primary active income source.

## Three layers of “where does this item belong?”

| Layer | Mechanism | Purpose |
|--------|-----------|---------|
| **Natural assignment** | Computed in `paycheck_engine.assign_bills_to_paycheck` from due dates + pay-period windows | Default: which period an occurrence belongs to |
| **Effective assignment** | Natural + active rows in `pay_period_item_overrides` (migration **045**) | Pull-forward (v1: next → current only) |
| **Paid for period** | `payments` / `debt_payments` with dates in period window | Whether money was paid in that period (not assignment) |

## `pay_period_item_overrides` (source of truth for pull-forward)

**Table:** `pay_period_item_overrides` — Alembic revision `045`.  
**Model:** `app.models.pay_period_item_override.PayPeriodItemOverride`  
**Service:** `app.services.pay_period_planner` (do not add a second override table or parallel planner).

One row = one **occurrence**: `(item_type, item_id, occurrence_due_date)`.

| Column | Meaning |
|--------|---------|
| `natural_period_start` | Paycheck date starting the period the item would normally appear in (v1: **next**) |
| `effective_period_start` | Paycheck date starting the period where it **counts** (v1: **current**) |
| `revoked_at` | Set to undo; `NULL` = active |
| `household_id` / `budget_id` | Scope for shared household + active budget |
| `created_by_user_id` | Who created the override |
| `override_type` | v1: `pull_forward` only |

**Rules (v1):**

- At most one **active** override per occurrence (`ux_pay_period_item_overrides_active_occurrence` where `revoked_at IS NULL`).
- `natural_period_start > effective_period_start` (next is later than current on the calendar).
- Active pull-forward: item appears in **current** plan/totals only; excluded from **next** (`_apply_effective_lists` in `pay_period_planner.py`).

## APIs (both route groups use the same service + table)

| Action | Preferred (paycheck UI) | Original (Phase 2) |
|--------|-------------------------|-------------------|
| Current/next plan with overrides | `GET /api/v1/paycheck-plan?periods=4&budget_id=` | `GET /api/v1/pay-periods/current`, `/next` |
| Upcoming periods | `GET /api/v1/paycheck-plan/upcoming?upcoming=3` | — |
| Pull forward | `POST /api/v1/paycheck-plan/overrides` | `POST /api/v1/pay-periods/pull-forward` |
| Revert | `DELETE /api/v1/paycheck-plan/overrides/{id}` | `POST /api/v1/pay-periods/revert-pull-forward` or `DELETE /api/v1/pay-periods/overrides/{id}` |

## Separate from `postpone_until`

| Feature | Direction | Storage |
|---------|-----------|---------|
| **Postpone** | Delay payment to a **later** date/period | `bills.postpone_until` / `debts.postpone_until` |
| **Pull-forward** | Pay **early** from next period into current | `pay_period_item_overrides` |

Do not overload `postpone_until` for pull-forward.

## `paycheck_checklist`

Per-user UI checkboxes keyed by `pay_period_start`. **Not** the assignment source of truth. Stale checklist rows for an occurrence are cleared on pull-forward/revert (`_clear_checklist_for_occurrence`).

## Phase status

- **Phase 1 (done):** Migration 045, `PayPeriodItemOverride` model, schemas, constants.
- **Phase 2 (done):** `pay_period_planner`, APIs, `build_full_paycheck_plan_response` applies overrides for periods 0/1.
- **Phase 3 (done):** Dashboard — current plan, upcoming paychecks, pull/revert actions, badges.
