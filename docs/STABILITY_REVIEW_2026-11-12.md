# PayDrift stability review — November 12, 2026

Scope: the original `paycheck-planner` application only. No deployment, live payment activation, live bank connection, production data operation, or PayDriftRenewed source change was performed. The checkout initially matched `origin/main` at `7124a5b90590ee20972bca3f775ae0397429179c` and was clean. Changes are prepared on `fix-paydrift-stability`; pushing to `main` requires the owner's explicit approval.

## Defects resolved

This review groups related manifestations of a root cause together: **30 additional defect groups**, beyond the 13 fixes reported in the previous task. The 60 ESLint errors and 20 warnings are tracked separately, rather than counted as 80 product bugs.

1. Financial fetch effects omitted budget and callback dependencies, allowing stale budget displays.
2. Late budget responses could repopulate another session's context or overwrite its active-budget storage. Providers now reset by user, ignore unmounted responses, and page state resets at workspace changes.
3. Business access requests used a process-wide in-flight promise shared across account switches. Deduplication is now scoped to the provider session.
4. Business write controls defaulted to allowed before permissions loaded or when access retrieval failed. They now fail closed.
5. Late subscription responses could populate the next account's context. Responses are matched to the requesting session.
6. A pending refresh could restore credentials after logout or overwrite a newer account's credentials. Old responses and queued operations are rejected after session changes.
7. Logout cleared storage before the asynchronous request interceptor attached the bearer token, preventing reliable server revocation. Logout captures its authorization header before clearing storage; explicit headers are preserved.
8. Refresh credentials were sent in URL query parameters and could enter access logs. Refresh now requires a JSON request body.
9. Registration omitted a default budget, leaving new-account paycheck planning unusable. Registration creates and selects the default workspace transactionally.
10. Optional date fields shadowed Python's `date` type, breaking tax-deduction, sale, deduction and app-update edits. Schemas now use an unambiguous type alias.
11. Calendar payment changes, broadcast administration, date-format saves and vault clipboard/settings operations silently swallowed failures. They now show errors; a failed date-format save restores the prior selection.
12. Household member-payment entry had an unreachable handler/modal. The bill breakdown now exposes the existing payment action.
13. Millisecond toast IDs could collide and dismiss unrelated messages. IDs are now generated independently.
14. Vault initialization guessed PIN state by submitting a failed unlock, consuming attempt limits and assuming setup on some failures. An authenticated status endpoint reports setup and timeout without attempting a PIN.
15. Vault countdown renders recreated request clients and repeatedly fetched notes/passwords. Clients now remain stable across countdown ticks.
16. PIN changes did not enforce the unlock attempt limit, providing a brute-force alternative. Both paths enforce the limit.
17. A PIN change left previously issued vault sessions usable. Sessions now bind to the PIN-hash version; changing a PIN preserves encrypted data and invalidates old sessions.
18. The Ko-fi webhook accepted unauthenticated donation credits. It now requires a configured verification token and rejects unverified senders before database access.
19. Replayed Ko-fi receipts duplicated credit; unsupported currency, malformed amounts and missing receipt identities were accepted. Receipt validation, transaction serialization and idempotency checks prevent these cases.
20. Promo administration trusted a hard-coded email address instead of administrator authority. It now checks the authenticated admin flag.
21. Promo use limits were vulnerable to concurrent redemption and repeated use consumed additional slots. Redemption locks the promo row and rejects an already applied code.
22. Checkout completion could grant paid access from metadata, unpaid sessions or a failed provider lookup. Grants require a completed subscription checkout, verified current subscription/customer identity, an active/trialing status and a known active price. Provider failures leave access unchanged and request webhook retry.
23. Incomplete/unknown subscription updates could retain paid access. These statuses now remove paid-tier entitlements.
24. Malformed JWT subjects and token-version claims caused server errors or permissive coercion. They now produce authentication failures. JWT operations use the already required PyJWT library, with legacy HS256 compatibility tested.
25. Budget creation accepted a foreign household reference, and tax creation accepted an inaccessible bill reference. Both links are authorized before insertion.
26. Payment and contribution amounts allowed missing/nonpositive values, and schedules allowed invalid frequency/day values. Request validation rejects these inputs before they reach calculations or storage.
27. Concurrent savings contributions could lose an increment. Contribution creation locks the goal before updating its balance.
28. Household invitation codes used a predictable random-number generator. They now use cryptographically secure randomness.
29. A business membership disappearing between context lookups could fall back to owner privileges on another owner's books. Missing membership now denies access; permission-query failures fail closed.
30. Staff, pay-rate and pay-run reads did not enforce staff-pay permissions. These endpoints now require the corresponding authority in addition to tenant scoping.

Code-quality changes also separate context hooks/helpers from component exports, reset modal drafts through mount lifetimes, correct menu state lifetimes, remove unused bindings, and configure ESLint to recognize real JSX variable references. No lint rule was disabled and no new lint suppression was added. Compatible dependency updates clear the detected npm advisories. Removing python-jose also removes the vulnerable ecdsa dependency; PyJWT was already used by the vault. The development virtual environment's pip was updated separately.

## Verification

- Backend: **285 passed**, including opt-in PostgreSQL API tests against a separately created, fully migrated `paydrift_security_test` database. Test requests run in rollback transactions, including endpoints that commit.
- Frontend: **41 passed** across 11 test files.
- ESLint: **0 errors, 0 warnings**.
- Production Vite build: passed with an explicit loopback API URL for local browser verification.
- Browser: **6 passed** against the local production build (desktop and mobile): local login/dashboard, paycheck entry and budget switching; bill and debt creation; vault setup, encrypted note save, lock and unlock. Desktop and mobile projects use installed Chromium against a local production preview.
- Authentication checks exercise **181 financial API operations** without credentials. Separate authenticated tests exercise foreign-household CRUD/action denials, foreign-budget writes, business tenant separation, employee permission denials, plan/admin activation restrictions, logout revocation, default-budget creation and vault session isolation.
- PostgreSQL migrations: fresh test-database upgrade through **058**, plus a repeat upgrade/current check on the local development database. No migration SQL was edited.
- npm audit and the installed Python environment's pip-audit: **zero reported known vulnerabilities** at verification time. `pip check` passes. These results concern the installed versions, not every historical version allowed by broad requirements.
- The existing local backend environment file was checked byte-for-byte unchanged, including its encryption key. A database-backed test verifies unchanged ciphertext and successful decryption after a PIN change. No real encrypted records were replaced or deleted.
- Nine backend warnings remain: dependency/schema/lifecycle deprecations. There are no remaining unawaited-coroutine warnings from the repaired planner test fixture. The browser runner can emit an inherited color-setting warning; jsdom reports its unimplemented scroll API in vault tests. Neither is an ESLint finding.

## Reproducing the checks

Use Node 24 and Python 3.11+ with PostgreSQL 16. Use the existing checkout; a Git worktree is not required. Preserve the existing `backend/.env`, especially `NOTES_ENCRYPTION_KEY`. Never generate a replacement for a database containing encrypted records.

From `backend`, install requirements and pytest/pytest-asyncio in `.venv`, then run:

```bash
.venv/bin/pytest -q
```

The database-backed tests are intentionally opt-in. Create and migrate a separate empty database whose name ends in `_test`, then set `PAYDRIFT_TEST_DATABASE_URL` to that database before running pytest. Without it those seven integration tests are skipped; that is not the full validation reported above. Ordinary unit tests use the existing isolated fixture configuration. Never point the integration-test variable at a production database.

From `frontend`:

```bash
npm ci
npm test
npm run lint
VITE_API_URL=http://127.0.0.1:8000 npm run build
```

For browser validation, start the local API at port 8000 with `FRONTEND_URL` permitting the chosen local frontend origin. Run Vite development at 5173, or production preview at 5175 after the loopback build. Then:

```bash
PAYDRIFT_LOCAL_WEB_URL=http://127.0.0.1:5175 \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e:local
```

On Windows use `.venv\Scripts\python.exe -m pytest`, `npm.cmd`, and PowerShell `$env:NAME='value'` assignments. If Playwright's bundled Chromium is installed, omit `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. The local suite is separate from the existing hosted-account suite and refuses a non-loopback frontend. It creates synthetic local users only and stores browser artifacts under `/tmp` in this cloud environment.

## Integration boundaries and remaining concerns

- No live Stripe checkout, charge, subscription, portal or webhook was invoked. Billing was tested disabled and through mocks. Real account configuration, provider event ordering/retries and deployed webhook behavior remain unverified.
- Ko-fi remains disabled unless `KOFI_VERIFICATION_TOKEN` is securely configured. No donation service was activated. Adding its authentication intentionally changes the previous unauthenticated behavior.
- Live email delivery, password-reset email links and R2 document upload/download/OCR paths remain unverified without provider credentials. The local API reports database/migration health as good and overall `degraded` because optional R2 storage is absent. Existing upload/OCR unit tests still pass.
- The hosted browser suite requires a separately authorized account/environment and was not run against production.
- PIN/login attempt limiting uses application-process memory; multiworker or multi-instance deployments need shared enforcement. No distributed brute-force protection is claimed.
- Legacy `on_event` startup hooks coexist with a custom lifespan. Initial-admin/bootstrap behavior is not a validated production provisioning workflow and was not activated or changed here. Do not rely on email-based bootstrap without a separate owner-reviewed provisioning check.
- Backend and frontend must be released together for the refresh-body contract. Previously issued valid HS256 tokens remain cryptographically compatible. Existing vault-session tokens require one fresh PIN verification after this change; financial records and ciphertext are unchanged.
- No production security certification or exhaustive financial acceptance claim is made. The feature comparison and selective migration remain a subsequent task after stabilization review.
