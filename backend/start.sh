#!/bin/bash
set -e

echo "[start] Running database migrations..."
python migrate.py
echo "[start] Migrations finished. Starting API on port ${PORT:-8000}..."

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
