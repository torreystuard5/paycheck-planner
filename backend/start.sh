#!/bin/bash
set -e

# Run migrations
python migrate.py

# Start app
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
