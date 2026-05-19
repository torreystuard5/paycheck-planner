#!/bin/bash
set -e

# Render requires the web process to bind 0.0.0.0:$PORT quickly. Do NOT run Alembic
# here by default — run migrations once from Render Shell: python migrate.py
#
# Optional (local/dev only): RUN_MIGRATIONS_ON_START=1 bash start.sh
if [ "${RUN_MIGRATIONS_ON_START:-0}" = "1" ]; then
  echo "[start] RUN_MIGRATIONS_ON_START=1 — running Alembic upgrade..."
  python migrate.py
  echo "[start] Migrations finished."
fi

echo "[start] Starting API on 0.0.0.0:${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
