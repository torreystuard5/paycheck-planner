#!/bin/bash
set -e

# Runs Alembic upgrade to head (see migrate.py) before starting the API.
python migrate.py

# Start app
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
