# PayDrift Backend Architecture

Production backend lives at **`backend/`** (Render). Do not edit `paycheck-planner/backend/` for deploys.

## Layout

```
backend/
├── app/
│   ├── main.py              # FastAPI app, middleware, router registration
│   ├── config.py            # Settings / env
│   ├── database.py          # SQLAlchemy async engine + session
│   ├── middleware/          # Request auth snapshots (TOS, tier)
│   ├── models/              # SQLAlchemy ORM (barrel: models/__init__.py)
│   ├── schemas/             # Pydantic request/response models
│   ├── routers/             # HTTP layer — thin handlers, delegate to services
│   ├── services/            # Business logic (preferred home for domain code)
│   └── utils/               # Cross-cutting helpers (budget, security, dates)
├── alembic/                 # Schema migrations
├── tests/                   # Unit tests (flat; prefer testing services over router privates)
└── scripts/                 # Deploy / changelog sync
```

## Layering rules

| Layer | Responsibility | Avoid |
|-------|----------------|-------|
| **Routers** | Auth, HTTP status, parse body, call service, return schema | Large SQL blocks, duplicated domain rules |
| **Services** | Domain logic, queries, orchestration | Importing from routers |
| **Models** | Persistence shape | Business rules |
| **Utils** | Pure helpers shared across domains | DB access |

**Do not** import routers from other routers when a service will do (e.g. use `admin_audit` not `admin.log_admin_action`).

## Router map

All routes mount at `/api/v1` in `main.py`. Each router sets its own prefix (e.g. `/bills`, `/paycheck-plan`).

**Thin routers (good pattern):** `reminders` → `reminder_service`, `paycheck_engine` / `pay_periods` → `pay_period_planner`.

**Large routers (refactor candidates):** `admin.py`, `business.py`, `bills.py` — extract services incrementally.

## Service domains

| Domain | Key modules |
|--------|-------------|
| Paycheck planning | `paycheck_engine`, `paycheck_data`, `paycheck_planning_state`, `pay_period_planner`, **`paycheck_assignment`** |
| Bills | `bill_cycles`, `household_billing` |
| Debts | `debt_calculator`, `credit_efficiency`, **`debt_payment_service`** |
| Documents | `document_upload_flow`, `document_constants`, `ocr_service`, `ocr_parsers`, `storage/` |
| Household | `household_service`, `household_overview`, `household_billing` |
| Tier / billing | `tier_access`, `tier_service`, `billing_plans`, `stripe_webhook` |
| Admin | **`admin_audit`** (audit logging) |

## Shared modules (recent extractions)

- **`paycheck_assignment`** — pull-forward override lists; breaks planner ↔ planning_state cycle
- **`debt_payment_service`** — mark-paid / checklist debt sync (dedupe, balance, auto-log)
- **`admin_audit`** — admin audit log + client IP (used by admin + support)
- **`utils/due_dates`** — `next_monthly_due_date` for debts/bills/reminders
- **`document_constants`** — allowed MIME types for personal + business uploads

## Paycheck planning flow

```
GET /paycheck-plan
  → pay_period_planner.build_full_paycheck_plan_response
      → build_pay_calendar_context (paycheck_data)
      → build_paycheck_planning_state
          → paycheck_assignment.apply_effective_lists
          → paycheck_engine.assign_bills_to_paycheck
```

## Tests

- Prefer testing **services** and pure utils over private router functions.
- Paycheck/debt tests: `test_paycheck_*`, `test_debt_*`, `test_pay_period_pull_forward.py`
- Future: add `tests/api/` with FastAPI TestClient for contract tests.

## Migrations

Run locally: `python migrate.py`. Production: `start.sh` on deploy.
