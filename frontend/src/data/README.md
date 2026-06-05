# `updates.json`

User-facing release notes for the PayDrift redesign and handover.

## Structure

- **`whatsNew`** — Featured banner (Dashboard compact, Changelog full): `title`, `summary`, `highlights[]`, `released`, `version`.
- **`entries`** — Changelog rows merged with `GET /api/v1/app-updates` via `lib/productUpdates.js` (duplicate descriptions are skipped).

## Syncing to production API

The live "What's New" panel also reads **`/api/v1/app-updates`**. To show these entries in production, seed `app_updates` (e.g. `backend/scripts/seed_changelog_history.py`) or rely on git-cliff + deploy sync—see repo `CONTRIBUTING.md`.

## Editing

Update this file when shipping visible frontend changes. Keep descriptions plain-language for end users.
