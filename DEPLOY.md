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

### Migrations

**Do not run Alembic in the web startup path on Render.** The API binds to `$PORT` immediately via `start.sh` → `uvicorn` only. Running `alembic upgrade` before Uvicorn causes “No open ports detected” while migrations hold the database.

After each deploy that includes new migration files, open **Render Shell** for `paydrift-api` and run:

```bash
python migrate.py
```

Or:

```bash
bash migrate.sh
```

Run migrations **once** per schema change (or from a one-off job), not on every container restart.

Optional local convenience (not for Render web service):

```bash
RUN_MIGRATIONS_ON_START=1 bash start.sh
```

### Verify Deployment

After deploy, check:
- `https://paydrift-api.onrender.com/health` → `{"status": "healthy"}`
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
