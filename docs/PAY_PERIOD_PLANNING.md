# Pay period planning — architecture notes

## Pay calendar (anchor)

- **Source:** `income_sources` (frequency, `next_pay_date`) + `paycheck_entries` for logged amounts.
- **Not used for period boundaries:** `paycheck_schedules` (legacy/auxiliary UI only).
- **Household:** All members share the same current/next periods, derived from the household’s primary active income source (Phase 2 resolver).

## Three layers of “where does this item belong?”

| Layer | Mechanism | Purpose |
|--------|-----------|---------|
| **Natural assignment** | Computed in `paycheck_engine` from due dates + pay-period windows | Default: which period an occurrence belongs to |
| **Effective assignment** | Natural + active rows in `pay_period_item_overrides` | Pull-forward (v1: next → current only) |
| **Paid for period** | `payments` / `debt_payments` with dates in period window | Whether money was paid in that period (not assignment) |

## `pay_period_item_overrides` (source of truth for pull-forward)

One row = one **occurrence**: `(item_type, item_id, occurrence_due_date)`.

| Column | Meaning |
|--------|---------|
| `natural_period_start` | Paycheck date starting the period the item would normally appear in (v1: **next**) |
| `effective_period_start` | Paycheck date starting the period where it **counts** (v1: **current**) |
| `revoked_at` | Set to undo; `NULL` = active |
| `household_id` / `budget_id` | Scope for shared household + active budget |
| `override_type` | v1: `pull_forward` only |

**Rules (v1):**

- At most one **active** override per occurrence (partial unique index).
- `natural_period_start > effective_period_start` (next is later than current on the calendar).
- Active pull-forward: item appears in **current** plan/totals, excluded from **next** (Phase 2 planner).

## Separate from `postpone_until`

| Feature | Direction | Storage |
|---------|-----------|---------|
| **Postpone** | Delay payment to a **later** date/period | `bills.postpone_until` / `debts.postpone_until` |
| **Pull-forward** | Pay **early** from next period into current | `pay_period_item_overrides` |

Do not overload `postpone_until` for pull-forward.

## `paycheck_checklist`

Per-user UI checkboxes keyed by `pay_period_start`. **Not** the assignment source of truth. Phase 2+ must align checklist with **effective** period and clear stale rows on pull-forward/revert.

## Phase status

- **Phase 1 (done):** Table, model, schemas, constants.
- **Phase 2:** Central `pay_period_planner` service, APIs, budget-scoped fetches, apply overrides in engine output.
- **Phase 3:** Dashboard/Bills/Debts UI with Current/Next switcher.
