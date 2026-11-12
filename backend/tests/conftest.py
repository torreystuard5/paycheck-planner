"""Pytest bootstrap — minimal env so Settings() loads without a local .env."""

import os

# Fixed key for isolated tests only; never generate a replacement key at runtime.
os.environ.setdefault("NOTES_ENCRYPTION_KEY", "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=")

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://pytest:pytest@localhost:5432/paydrift_test",
)
os.environ.setdefault("SECRET_KEY", "pytest-secret-key-do-not-use-in-production")
