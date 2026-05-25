"""Pytest bootstrap — minimal env so Settings() loads without a local .env."""

import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://pytest:pytest@localhost:5432/paydrift_test",
)
os.environ.setdefault("SECRET_KEY", "pytest-secret-key-do-not-use-in-production")
