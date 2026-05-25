# Contributing to PayDrift

Thank you for helping improve PayDrift. This document covers how we write commits, what appears in the public changelog, and how automation enforces the policy.

## Conventional Commits

Every commit on `main` must use [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>[optional scope][optional !]: <description>

[optional body]

[optional footer]
```

Examples:

```text
feat(household): add collapsible shopping list sections
fix(auth): correct token refresh on expired session
chore(deps): bump fastapi in backend requirements
```

### Commit types

| Type | Changelog | Purpose |
|------|-----------|---------|
| `feat` | Yes (if scope rules pass) | User-facing feature |
| `fix` | Yes (if scope rules pass) | User-facing bug fix |
| `chore` | No | Tooling, deps, housekeeping |
| `ci` | No | GitHub Actions, Render, Netlify |
| `build` | No | Build system / Docker |
| `docs` | No | Documentation only |
| `style` | No | Formatting, no logic change |
| `refactor` | No | Internal refactor |
| `test` | No | Tests only |
| `perf` | No | Performance (use `feat` if user-visible) |
| `revert` | No | Revert a prior commit |

### Forbidden scopes (all commit types)

Never use these scopes — they are reserved for internal work and are **excluded from the public changelog**:

- `admin`
- `ops`
- `infra`
- `internal`
- `dev`
- `test`

### PayDrift public scopes (`feat` / `fix` only)

When you use `feat` or `fix` **with** a scope, it must be one of:

`auth`, `budget`, `transactions`, `shopping-list`, `household`, `goals`, `reports`, `dashboard`, `notifications`, `billing`, `onboarding`, `mobile`, `ui`, `api`

`feat` and `fix` **without** a scope are allowed (e.g. `fix: correct paycheck total`).

Internal work should use non-changelog types (`chore`, `ci`, `build`, etc.) and must not use forbidden scopes.

## Allowed vs excluded examples

### Included in public `CHANGELOG.md`

```text
feat(household): reorganize household page into tabs
feat(shopping-list): add shared grocery list for households
fix(budget): resolve active budget switch on dashboard
fix(household): include debts in financial overview
fix: repair shopping list API when table was missing
feat(api)!: remove deprecated paycheck schedule endpoint
```

### Valid commits, excluded from changelog

```text
chore(deps): update sqlalchemy
ci(github): add changelog workflow
build(docker): slim backend image
docs: update DEPLOY.md
refactor(paycheck): extract planner helpers
test(household): add shopping list CRUD tests
feat(deploy): run migrations in start.sh
fix(alembic): idempotent migration 049
```

(`feat(deploy)` and `fix(alembic)` use scopes outside the public list — commitlint allows them only if you use `chore`/`ci` instead; for user-facing work pick a public scope.)

### Rejected by commitlint

```text
feat(admin): add user impersonation
fix(ops): tune connection pool
chore(internal): secret rotation
feat(custom): new widget
bad message with no type
```

## Changelog generation (git-cliff)

The public changelog is generated with [git-cliff](https://git-cliff.org/) from git history using `cliff.toml`:

- Only `feat` and `fix` commits
- Excludes forbidden scopes and non-user-facing types (see config)

### Local commands

```bash
# Install git-cliff once (pick one)
cargo install git-cliff
# Windows: scoop install git-cliff
# macOS: brew install git-cliff

# Repo root
npm ci
npm run changelog          # Regenerate CHANGELOG.md
npm run changelog:check    # Fail if CHANGELOG.md is stale
npm run changelog:unreleased
npm run commitlint         # Lint commits since origin/main
npm run commitlint:last    # Lint latest commit only
```

Commit the updated `backend/CHANGELOG.md` with your PR when you add user-facing `feat`/`fix` commits.

### In-app Changelog (automatic)

The **Changelog** page in the app reads from the `app_updates` table. On every Render deploy, `start.sh` runs:

1. `python migrate.py`
2. `python -m scripts.sync_public_changelog` — merges `backend/data/changelog_history.json` + `backend/CHANGELOG.md` into `app_updates`

You do **not** need to hand-edit the database after a `feat`/`fix` deploy. Regenerate `backend/CHANGELOG.md` before merge (or use the GitHub workflow), then deploy the backend.

**First-time bootstrap:** Actions → **Changelog & commits** → **Run workflow**, or `npm run changelog` locally and commit `backend/CHANGELOG.md`.

## CI

- **Pull requests:** [`.github/workflows/changelog.yml`](.github/workflows/changelog.yml) runs commitlint on all PR commits.
- **main:** The same workflow verifies `CHANGELOG.md` matches `git-cliff` output.

## Production code paths

Edit **`backend/`** and **`frontend/`** at the repository root for Netlify/Render deploys. The nested `paycheck-planner/` tree is not the production deploy target unless explicitly configured.

## Questions

Open an issue or contact the maintainers if the scope list needs a new **user-facing** area (e.g. a new product surface).
