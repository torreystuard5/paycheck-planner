#!/bin/bash
set -e

echo "[start] Running database migrations..."
python migrate.py

echo "[start] Syncing public changelog into app_updates..."
python -m scripts.sync_public_changelog

echo "[start] Starting API on 0.0.0.0:${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
