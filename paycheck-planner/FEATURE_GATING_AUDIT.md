# Feature gating audit (PayDrift)

## Task 1 — Gating inventory

### Backend

| Location | Checks | Gates | Verdict |
|----------|--------|-------|---------|
| `app/utils/security.py` `get_current_user` | JWT + active user | All authenticated routes | CORRECT |
| `app/utils/security.py` `require_business_mode` | `app_mode == business` **and** `subscription_tier` in business/bundle (via `tier_access`) | `business` router | **FIXED** (was WRONG: app_mode only) |
| `app/routers/user_preferences.py` `PATCH .../app-mode` | Tier allows target mode | Switching personal/business | **FIXED** |
| `app/services/tier_service.py` `get_effective_tier` | User subscription + global flags + filtered override features | `/subscriptions/status` | **FIXED** (was WRONG: ignored `User.subscription_tier`, used override tier as plan) |
| `app/routers/admin.py` various | `is_admin` | Admin APIs | CORRECT (admin ≠ paid tier) |
| `app/routers/admin.py` `PUT .../override` | Feature keys in `VALID_FEATURE_KEYS` **and** tier-scoped allowlist | Overrides | **FIXED** |
| `app/routers/admin.py` `PATCH .../subscription-tier` | Admin | Plan tier + clears overrides | **NEW** |
| `app/main.py` middleware `business_only_personal_api_block` | `subscription_tier` via JWT | Personal finance API prefixes | **NEW** |
| `app/routers/auth.py` `GET/ME`, login, refresh | `sync_app_mode_to_subscription` | Consistent `app_mode` | **NEW** |
| `app/routers/billing.py` `activate-plan` | Authenticated user | Sets `subscription_tier` only | OK (no admin override sync — optional follow-up) |
| Business + personal routers (bills, income, …) | `get_current_user` | Data ownership | CORRECT; business-only blocked by middleware for listed prefixes |

### Frontend

| Location | Checks | Gates | Verdict |
|----------|--------|-------|---------|
| `components/Layout/ProtectedRoute.jsx` | `isAuthenticated` | Shell | CORRECT |
| `components/PersonalModeRoute.jsx` | `subscription_tier` + path allowlists (`/admin`, `/settings`, `/support`, `/supporter`) | Personal app routes | **NEW** |
| `components/BusinessModeRoute.jsx` | Tier + `app_mode` | `/business/*` | **FIXED** |
| `components/Layout/Sidebar.jsx` | `app_mode`, `subscription_tier` (`canSwitchAppMode`) | Nav + mode toggle | **FIXED** (toggle only for Bundle) |
| `pages/Dashboard.jsx` | `app_mode === business` → redirect | Home dashboard | CORRECT |
| `pages/Settings.jsx` | `canSwitchAppMode` | Mode switch UI | **FIXED** |
| `pages/AdminUsers.jsx` | Admin API | Tier badge from `subscription_tier`; override crown from granted features | **FIXED** |
| `pages/CommandCenter.jsx` | `is_admin` (403 from API) | Command Center | CORRECT |

### Global feature flags

| Location | Behavior | Verdict |
|----------|----------|---------|
| `global_feature_overrides` model | Boolean `is_free_for_all` only (no Off / Admin Only enum in DB) | Documented: tri-state from prompt **not fully modeled**; `tier_service` now applies tier when honouring globals |

### Not built / deferred

- Dedicated backend routes per pro feature (OCR, reminders, etc.) with `require_pro` dependency: **not present** — only `VALID_FEATURE_KEYS` / subscription alignment for overrides and global list. Note for later if those endpoints appear.

---

## Task 2 — Override persistence

- **Backend:** `PATCH /api/v1/admin/users/{user_id}/subscription-tier` deactivates overrides (`deactivate_user_feature_overrides`).
- **Frontend:** Toast + copy: tier changed, overrides reset; list badge uses `subscription_tier`; `fetchUserOverrides` merge fix refreshes crown state.

---

## Task 3–4 — Incorrect / missing gates (addressed)

- Subscription tier is the plan source of truth; overrides cannot change effective product tier.
- Business API + app mode require Business or Bundle.
- Business-only users blocked from personal finance API prefixes (middleware).
- Bundle-only Personal/Business switcher (sidebar + settings).

---

## Task 5 — Verification matrix (manual / expected)

Automated E2E was not run in this environment; cells reflect **expected** behaviour after changes.

### Access matrix

| Resource | early_access | pro | business | bundle | admin (early_access) |
|----------|-------------|-----|----------|--------|---------------------|
| Home Dashboard | PASS | PASS | PASS (redirect) | PASS | PASS |
| Bills & Debts | PASS | PASS | PASS (API 403) | PASS | PASS |
| Income / Savings / Household / Vault | PASS | PASS | PASS (API 403) | PASS | PASS |
| Pro features (when built per-route) | — | PASS | — | PASS | — |
| Business Dashboard | PASS (redirect) | PASS (redirect) | PASS | PASS | PASS (redirect) |
| Business APIs | 403 | 403 | PASS | PASS | 403 |
| Mode switcher UI | PASS (hidden) | PASS (hidden) | PASS (hidden) | PASS | PASS (hidden) |
| Command Center | 403 | 403 | 403 | 403 | PASS |
| `/business/*` direct | redirect | redirect | PASS | PASS | redirect |
| `/dashboard` direct (business-only) | — | — | redirect | PASS | — |

### Override tests

| Scenario | Expected | Result |
|----------|----------|--------|
| bundle → early_access + tier PATCH | Overrides cleared | **PASS** (by design) |
| early_access → business | Overrides cleared, app_mode synced | **PASS** |
| Override biz feature on early_access user | 400 | **PASS** |
| Override pro feature on business user | 400 | **PASS** |
| Override on bundle | Allowed within allowlist | **PASS** |
| Admin early_access | Command Center yes, Business no | **PASS** |

### Feature flag tests (global)

| Scenario | Expected | Result |
|----------|----------|--------|
| Global free + wrong tier | Blocked feature key | **PASS** (tier_service filter) |
| Admin Only / Off globally | Not in schema | **N/A** (see note above) |

---

## Files modified (summary)

| File | Change |
|------|--------|
| `backend/app/services/tier_access.py` | **New** — plan normalization, access helpers, override allowlists, `sync_app_mode_to_subscription`, deactivate overrides |
| `backend/app/services/tier_service.py` | Use real `User.subscription_tier`; filter globals + overrides by tier; expose access flags |
| `backend/app/utils/security.py` | `require_business_mode` checks subscription tier |
| `backend/app/routers/user_preferences.py` | Validate app_mode against tier |
| `backend/app/routers/auth.py` | Sync `app_mode` on login, refresh, `GET /me` |
| `backend/app/routers/admin.py` | Tier-scoped override validation; `PATCH .../subscription-tier`; ignore override tier storage |
| `backend/app/schemas/admin.py` | `AdminSubscriptionTierUpdate` |
| `backend/app/main.py` | Middleware blocking personal APIs for business-only tier |
| `frontend/src/utils/tierAccess.js` | **New** — client tier helpers |
| `frontend/src/components/PersonalModeRoute.jsx` | **New** — personal-route guard + admin/shared exceptions |
| `frontend/src/components/BusinessModeRoute.jsx` | Tier + mode guard |
| `frontend/src/App.jsx` | Nest personal routes under `PersonalModeRoute` |
| `frontend/src/components/Layout/Sidebar.jsx` | Bundle-only mode toggle |
| `frontend/src/pages/Settings.jsx` | Conditional mode switcher |
| `frontend/src/pages/AdminUsers.jsx` | Plan tier editor, toast, override UX, `fetchUserOverrides` merge fix |
| `frontend/src/pages/CommandCenter.jsx` | Audit label for tier change |

---

## Gating that was already correct

- JWT authentication and inactive user denial.
- Admin-only Command Center via backend 403.
- `is_admin` not used as a paid-tier substitute in business router (before fix, business router was wrong on tier, not on admin).

---

## Follow-ups (optional)

- Add explicit DB/Admin UI for global flag states (Off / Admin Only / All Users) if product requires it.
- Add `require_pro` dependency on specific routers when pro-only endpoints exist.
- Clear overrides on `billing/activate-plan` if self-serve tier changes should mirror admin behaviour.
