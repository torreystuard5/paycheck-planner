#!/bin/bash
set -e
echo "[migrate] Running Alembic upgrade to head..."
python migrate.py
echo "[migrate] Done."
