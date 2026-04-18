# PayDrift — local development (Windows)

Run **three** processes: Postgres, FastAPI, and Vite. Use three terminals in Cursor (or any shells).

## Prerequisites

- **Docker Desktop** (recommended for Postgres), or a native Postgres 16+ install with database `paydrift` and matching credentials.
- **Python 3.11+** and **Node.js 18+**.

---

## Terminal 1 — Postgres (Docker)

From the **repo root** (`paycheck-planner`):

```powershell
cd "C:\Users\torre\OneDrive\Desktop\Paycheck Planner\paycheck-planner"
docker compose up -d
```

Docker maps Postgres to host port **5433** (avoids conflict with another Postgres on 5432). User/password/db: `paydrift` / `paydrift` / `paydrift`. Point `DATABASE_URL` at `localhost:5433`.

Stop later: `docker compose down` (add `-v` to remove the volume and data).

---

## Terminal 2 — Backend (FastAPI)

```powershell
cd "C:\Users\torre\OneDrive\Desktop\Paycheck Planner\paycheck-planner\backend"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Create **`backend/.env`** (gitignored) from **`backend/.env.example`**. At minimum set `DATABASE_URL` and `SECRET_KEY` to match your Postgres.

```powershell
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

- API: http://localhost:8000  
- Swagger: http://localhost:8000/docs  

---

## Terminal 3 — Frontend (Vite)

```powershell
cd "C:\Users\torre\OneDrive\Desktop\Paycheck Planner\paycheck-planner\frontend"
npm install
```

Create **`frontend/.env.local`** from **`frontend/.env.example`** so `VITE_API_URL=http://localhost:8000`.

```powershell
npm run dev
```

- App: http://localhost:5173  

Hot reload: save files in `frontend/src` and the browser updates. Backend reloads when you save Python if `uvicorn` is running with `--reload`.

---

## Daily workflow

1. **Terminal 1:** `docker compose up -d` (if the DB container is stopped).
2. **Terminal 2:** activate `.venv`, then `uvicorn app.main:app --reload --port 8000`.
3. **Terminal 3:** `npm run dev`.

Work in Cursor, verify at http://localhost:5173, then commit and push when features are solid.

---

## CORS

The API merges origins from `FRONTEND_URL` (comma-separated), `FRONTEND_ORIGIN` (optional dev default), and always includes `https://paydrift.net` so production frontends keep working when env is set for Netlify only.

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| DB connection errors | `docker compose ps`, `DATABASE_URL` uses `postgresql+asyncpg://` for this codebase |
| CORS blocked | `FRONTEND_URL` or `FRONTEND_ORIGIN` includes `http://localhost:5173` |
| API 404 from frontend | `VITE_API_URL` in `.env.local` has **no** trailing slash; restart `npm run dev` after env changes |
