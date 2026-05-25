"""R2 configuration probe for health checks and startup logging."""

from __future__ import annotations

import logging
from uuid import uuid4

from app.config import settings
from app.services.storage.r2_client import (
    R2NotConfiguredError,
    R2OperationError,
    delete_object,
    put_object,
)

logger = logging.getLogger(__name__)


def r2_config_status() -> dict:
    """Return whether required R2 env vars are set."""
    missing = []
    if not (settings.R2_ACCESS_KEY_ID or "").strip():
        missing.append("R2_ACCESS_KEY_ID")
    if not (settings.R2_SECRET_ACCESS_KEY or "").strip():
        missing.append("R2_SECRET_ACCESS_KEY")
    if not (settings.R2_BUCKET_NAME or "").strip():
        missing.append("R2_BUCKET_NAME")
    if not (settings.R2_ENDPOINT_URL or "").strip() and not (
        settings.R2_ACCOUNT_ID or ""
    ).strip():
        missing.append("R2_ENDPOINT_URL or R2_ACCOUNT_ID")
    configured = not missing
    return {
        "configured": configured,
        "missing": missing,
    }


def r2_write_probe() -> dict:
    """PUT + DELETE a tiny object to verify S3 API credentials (not just env vars)."""
    if not r2_config_status()["configured"]:
        return {"ok": False, "error": "not_configured"}
    key = f"_healthcheck/{uuid4()}.txt"
    try:
        put_object(key, b"ok", "text/plain")
        delete_object(key)
        return {"ok": True}
    except R2NotConfiguredError as exc:
        return {"ok": False, "error": str(exc)}
    except R2OperationError as exc:
        logger.warning("R2 write probe failed: %s", exc)
        return {"ok": False, "error": str(exc)}


_write_probe_cache: dict = {"at": 0.0, "result": None}
_WRITE_PROBE_TTL_SEC = 60.0


def r2_write_probe_cached() -> dict:
    """Cached write probe for /health (avoids PUT on every request)."""
    import time

    now = time.time()
    cached = _write_probe_cache.get("result")
    if cached is not None and now - _write_probe_cache["at"] < _WRITE_PROBE_TTL_SEC:
        return cached
    result = r2_write_probe()
    _write_probe_cache["at"] = now
    _write_probe_cache["result"] = result
    return result
