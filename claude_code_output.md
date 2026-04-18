# Remaining fixes #19–27 — implementation summary

## Audit log (#19–22)
- **Backend** (`admin.py`, `schemas/admin.py`): Removed `POST /admin/log-access`. `GET /audit-log` always excludes `accessed_command_center`. Added `_audit_log_target_labels()` to populate `target` from `user`, `support_ticket`, `announcement`, `app_update`, `coming_soon`, `broadcast` (details), `system` (details key), `global_feature` (label lookup).
- **Frontend** (`CommandCenter.jsx`): Removed `log-access` call. Human-readable action labels (`AUDIT_ACTION_LABELS` + title-case fallback), details preview + **Expand** modal (pretty JSON), static action filter with labels.

## Household (#23–26)
- **Migration `039`**: `users.household_member_role` (default `adult`), `users.household_child_permissions` (JSONB), `household_chores` table with recurring support.
- **Models**: `User` columns; `HouseholdChore`; `Household.chores` relationship.
- **Service**: Create/join set adult + clear child permissions; leave resets role/permissions.
- **API** (`households.py`): `PATCH /members/{id}/role`, `PATCH /members/{id}/permissions`, CRUD `/chores` (adults manage; children list only assigned chores; children may mark own assigned chore completed). Recurring: on complete, spawns next `pending` row with advanced due date.
- **Schemas**: `HouseholdMember` exposes role/permissions; chore + permission DTOs.
- **`UserResponse`**: includes `household_member_role`, `household_child_permissions`.
- **Frontend** (`Household.jsx`): Adult/child badges; adults change roles (not creator row); child permissions modal; invite / bills / amounts gated by permissions; chores UI.

## Dashboard (#27)
- **Frontend** (`Dashboard.jsx`): Recent Payments table in a **scrollable** container (`max-h` + mobile-friendly), **sticky** header row, subtle bottom gradient.

## Follow-up
- Run migration: `alembic upgrade head` in `paycheck-planner/backend` against your database.
