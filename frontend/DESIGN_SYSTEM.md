# PayDrift frontend design system

Production UI lives under `frontend/src/`. Deploy targets are **root** `frontend/` (Netlify) and `backend/` (Render)—not `paycheck-planner/`.

## Tokens & global styles

- **CSS variables**: `frontend/src/index.css` defines `--pd-*` semantic tokens on `:root` and `.dark`.
- **Tailwind theme**: `@theme` maps utilities like `bg-surface`, `text-foreground`, `text-muted`, `border-border`, `bg-brand-600`, etc.
- **Utilities**: `page-container`, `form-input`, `form-label`, `card-grid`, `text-display`, `text-title`, `text-body`, `text-caption`, `text-money`, `skeleton`, `animate-fade-in`.
- **Legacy grays**: `.dark .bg-gray-*` / `.text-gray-*` bridges exist for older pages (Bills/Debts modals, admin)—prefer tokens for new work.

## UI kit (`frontend/src/components/ui/`)

Import from `'../components/ui'` (barrel `index.js`):

| Component | Use for |
|-----------|---------|
| `Button` | Primary actions (`variant`: primary, secondary, accent, danger, ghost, link) |
| `Card`, `CardHeader`, `CardContent` | Surfaces and sections |
| `Badge` | Status chips |
| `PageHeader` | Page title + description + actions |
| `FilterChips` | Tab-like filters (44px min height) |
| `CollapsibleCard` | Expandable sections |
| `IconStat` | Icon in tinted tile |
| `SettingsSection` | Settings group layout |
| `ProgressRing` | Savings progress |
| `cn()` | Class merging |

## Layout

- `MainLayout` — mobile header, bottom nav, skip link, `#main-content`.
- `Sidebar` — desktop nav, budget switcher, personal/business toggle.
- **Theme**: `ThemeContext` + Settings → App → Appearance; init in `main.jsx` before paint.

## Performance

- Route-level `React.lazy` in `App.jsx` with `LazyRoute` / `PageLoader`.
- Bills & Debts lazy-loads `Bills.jsx` / `Debts.jsx` per tab.
- Dashboard/Income lazy-load `PaycheckPlanEnvelope` and heavy upload components.

## Product copy / What's New

- **Static source**: `frontend/src/data/updates.json` (`whatsNew` + `entries`).
- **Merge helper**: `frontend/src/lib/productUpdates.js` — dedupes with `/api/v1/app-updates`.
- **UI**: `WhatsNewBanner`, `RecentUpdates` (Dashboard), `Changelog` page.

## Debt interest

- Logic: `frontend/src/utils/debtInterest.js`
- UI: `DebtInterestPanel`, `DebtInterestPreview` in debt modals and combined cards

## When adding a page

1. Use `page-container` + `PageHeader` + `Card` / design tokens (avoid raw `gray-*`).
2. Register route in `App.jsx` (lazy if large).
3. Use `form-input` / `Modal` / `EmptyState` / `LoadingSpinner`.
4. Add user-facing notes to `data/updates.json` if shipping a visible change (backend sync may also use git-cliff for production changelog).
