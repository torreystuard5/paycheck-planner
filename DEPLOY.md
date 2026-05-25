# Deploying PayDrift

## Architecture

- **Backend**: FastAPI + async SQLAlchemy + asyncpg on **Render** (Docker)
- **Frontend**: React + Vite on **Netlify** (static)
- **Database**: PostgreSQL on **Render**

### Source of truth in this repository

**What ships to production** (per the paths below): the app at the **repository root** — `backend/` and `frontend/`.

There is also a **`paycheck-planner/`** directory containing another copy of the app (same layout: `paycheck-planner/backend`, `paycheck-planner/frontend`). That tree exists from an earlier nested layout / merge. **Do not assume it is what Netlify or Render build unless you explicitly configure those services to that subdirectory.**

- For PayDrift as documented here: edit **`backend/`** and **`frontend/`** at the repo root.
- If you change the nested copy, mirror the same change under **`backend/`** and **`frontend/`** at the root (or remove the duplicate tree later when you are ready to consolidate).

## Backend (Render)

### Setup

1. Create a **PostgreSQL** database on Render (free tier works)
2. Create a **Web Service** pointing to this repo
   - **Root Directory**: `backend`
   - **Runtime**: Docker
   - **Dockerfile Path**: `./backend/Dockerfile`
   - **Docker Context**: `./backend`

### Environment Variables

Set these on the Render web service:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Internal Database URL from your Render Postgres service |
| `SECRET_KEY` | A long random string (Render can auto-generate) |
| `ALGORITHM` | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` |
| `SUPPORT_EMAIL` | `spsoftwaresolutionsllc@gmail.com` |
| `FRONTEND_URL` | `https://paydrift.netlify.app` |

#### Database URL Notes

- Render provides `DATABASE_URL` as `postgres://...` or `postgresql://...`
- The app **automatically converts** it to `postgresql+asyncpg://...` at startup
- You do **not** need to manually edit the URL

#### CORS

The `FRONTEND_URL` env var controls which origins are allowed. To allow multiple origins, use a comma-separated list:
```
FRONTEND_URL=https://paydrift.netlify.app,http://localhost:5173
```

### Migrations (automatic)

Alembic is already configured under `backend/alembic/`. **No manual Render Shell steps** are required for normal deploys.

On every container start, `start.sh` runs:

```bash
python migrate.py   # alembic upgrade head (skips if already at head)
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
```

`migrate.py` uses a PostgreSQL advisory lock, logs current/head revisions, and **exits non-zero** on failure so the deploy/start aborts instead of serving with a stale schema.

Render **Pre-Deploy Command** (optional belt-and-suspenders): `python migrate.py` — see `backend/render.yaml`.

#### Exact Render settings (Docker web service)

| Setting | Value |
|--------|--------|
| **Root Directory** | `backend` |
| **Dockerfile Path** | `./Dockerfile` (or `./backend/Dockerfile` if repo root is service root) |
| **Docker Context** | `.` (when Root Directory is `backend`) |
| **Docker Command** | `bash start.sh` |
| **Pre-Deploy Command** | `python migrate.py` (recommended; same as start.sh migration step) |
| **Start Command** | *(leave empty — uses Dockerfile `CMD` → `start.sh`)* |

Do **not** rely on manual Shell migration in production.

#### Local commands

```bash
cd backend
python migrate.py              # apply pending migrations
alembic current                # show DB revision
alembic heads                  # show code head (048+)
alembic upgrade head           # same as migrate.py
bash start.sh                  # migrate then uvicorn (like Render)
```

#### Rollback (non-destructive)

1. **Redeploy previous Git commit** on Render (instant rollback of app code).
2. **Schema rollback** only if a new migration misbehaved: Render Shell → `cd` to backend → `alembic downgrade -1` (one revision at a time; never `downgrade base` on production without a backup).
3. If `migrate.py` fails during deploy, Render keeps the previous release live — fix the migration script and redeploy.

### Verify Deployment

After deploy, check:
- `https://paydrift-api.onrender.com/health` → `{"status": "healthy", "migration_ok": true, "migration_current": "048", ...}`
- `https://paydrift-api.onrender.com/docs` → Swagger UI with all endpoints

## Frontend (Netlify)

### Setup

1. Connect the repo to Netlify
2. **Base directory**: `frontend`
3. **Build command**: `npm run build`
4. **Publish directory**: `frontend/dist`

### Environment Variables

Set on Netlify:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://paydrift-api.onrender.com` |

### SPA Routing

The `frontend/public/_redirects` file handles SPA routing automatically:
```
/*    /index.html   200
```

### Verify Deployment

- Visit `https://paydrift.netlify.app`
- Register a new account — should get 201 from the API
- Login should work and redirect to Dashboard
