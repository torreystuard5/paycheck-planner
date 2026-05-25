"""R2 configuration probe for health checks and startup logging."""

from __future__ import annotations

from app.config import settings


def r2_config_status() -> dict:
    """Return whether presigned uploads can be issued (all required env vars set)."""
    missing = []
    if not settings.R2_ACCESS_KEY_ID:
        missing.append("R2_ACCESS_KEY_ID")
    if not settings.R2_SECRET_ACCESS_KEY:
        missing.append("R2_SECRET_ACCESS_KEY")
    if not settings.R2_BUCKET_NAME:
        missing.append("R2_BUCKET_NAME")
    if not settings.R2_ENDPOINT_URL:
        missing.append("R2_ENDPOINT_URL")
    configured = not missing
    return {
        "configured": configured,
        "missing": missing,
    }
