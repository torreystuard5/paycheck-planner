"""Cloudflare R2 client helper (S3-compatible via boto3)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.config import settings

logger = logging.getLogger(__name__)


class R2NotConfiguredError(Exception):
    """Raised when R2 credentials are missing."""


class R2OperationError(Exception):
    """Raised when an R2 API call fails."""


def _require_config() -> None:
    """Raise R2NotConfiguredError if required env vars are unset."""
    missing = []
    if not settings.R2_ACCESS_KEY_ID:
        missing.append("R2_ACCESS_KEY_ID")
    if not settings.R2_SECRET_ACCESS_KEY:
        missing.append("R2_SECRET_ACCESS_KEY")
    if not settings.R2_BUCKET_NAME:
        missing.append("R2_BUCKET_NAME")
    if not settings.R2_ENDPOINT_URL:
        missing.append("R2_ENDPOINT_URL")
    if missing:
        raise R2NotConfiguredError(
            f"Uploads are not configured. Missing env vars: {', '.join(missing)}"
        )


_client = None


def _resolve_endpoint_url() -> str:
    """Account-level S3 API endpoint (not bucket URL, not public r2.dev)."""
    url = (settings.R2_ENDPOINT_URL or "").strip().rstrip("/")
    if url:
        return url
    account_id = (settings.R2_ACCOUNT_ID or "").strip()
    if account_id:
        return f"https://{account_id}.r2.cloudflarestorage.com"
    raise R2NotConfiguredError(
        "Uploads are not configured. Set R2_ENDPOINT_URL or R2_ACCOUNT_ID."
    )


def _r2_boto_config() -> Config:
    """R2-compatible boto3 config (path-style + SigV4)."""
    return Config(signature_version="s3v4", s3={"addressing_style": "path"})


def _credential(value: str | None) -> str:
    """Strip whitespace/quotes from env secrets (common Render paste issue)."""
    if not value:
        return ""
    return value.strip().strip('"').strip("'")


def _bucket_name() -> str:
    return (settings.R2_BUCKET_NAME or "").strip()


def _get_client():
    """Lazy-initialise the boto3 S3 client for R2."""
    global _client
    if _client is not None:
        return _client
    _require_config()
    _client = boto3.client(
        "s3",
        endpoint_url=_resolve_endpoint_url(),
        aws_access_key_id=_credential(settings.R2_ACCESS_KEY_ID),
        aws_secret_access_key=_credential(settings.R2_SECRET_ACCESS_KEY),
        region_name="auto",
        config=_r2_boto_config(),
    )
    return _client


def generate_presigned_put(
    object_key: str,
    content_type: str,
    expires_in: int | None = None,
    max_bytes: int | None = None,
) -> dict:
    """Return a presigned PUT URL for direct upload.

    Returns dict with keys: url, headers, expires_at, max_bytes.
    """
    _require_config()
    client = _get_client()
    ttl = expires_in or settings.R2_PRESIGNED_URL_TTL
    limit = max_bytes or settings.R2_MAX_UPLOAD_BYTES

    try:
        url = client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": _bucket_name(),
                "Key": object_key,
                "ContentType": content_type,
            },
            ExpiresIn=ttl,
        )
    except ClientError as exc:
        raise R2OperationError(f"Failed to generate presigned PUT URL: {exc}") from exc

    from datetime import timedelta

    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl)

    return {
        "url": url,
        "headers": {"Content-Type": content_type},
        "expires_at": expires_at,
        "max_bytes": limit,
    }


def generate_presigned_get(
    object_key: str,
    expires_in: int | None = None,
) -> str:
    """Return a presigned GET URL for reading an object."""
    _require_config()
    client = _get_client()
    ttl = expires_in or 300  # 5 min default for reads

    try:
        return client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": _bucket_name(),
                "Key": object_key,
            },
            ExpiresIn=ttl,
        )
    except ClientError as exc:
        raise R2OperationError(f"Failed to generate presigned GET URL: {exc}") from exc


def object_exists(object_key: str) -> bool:
    """Check if an object exists in the bucket via head_object."""
    _require_config()
    client = _get_client()
    try:
        client.head_object(Bucket=_bucket_name(), Key=object_key)
        return True
    except ClientError as exc:
        if exc.response["Error"]["Code"] in ("404", "NoSuchKey"):
            return False
        raise R2OperationError(f"Failed to check object existence: {exc}") from exc


def _put_object_presigned_http(
    object_key: str, body: bytes, content_type: str
) -> None:
    """PUT via presigned URL + httpx (server-side; no browser CORS)."""
    import httpx

    client = _get_client()
    try:
        url = client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": _bucket_name(),
                "Key": object_key,
                "ContentType": content_type,
            },
            ExpiresIn=300,
        )
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "ClientError")
        raise R2OperationError(f"Presign failed ({code}): {exc}") from exc

    with httpx.Client(timeout=120.0) as http:
        resp = http.put(url, content=body, headers={"Content-Type": content_type})
    if resp.status_code not in (200, 204):
        snippet = (resp.text or "")[:400]
        raise R2OperationError(
            f"Presigned PUT failed (HTTP {resp.status_code}): {snippet}"
        )


def _put_object_direct(object_key: str, body: bytes, content_type: str) -> None:
    """Direct S3 PutObject (fallback)."""
    client = _get_client()
    try:
        client.put_object(
            Bucket=_bucket_name(),
            Key=object_key,
            Body=body,
            ContentType=content_type,
        )
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "ClientError")
        raise R2OperationError(f"PutObject failed ({code}): {exc}") from exc


def put_object(object_key: str, body: bytes, content_type: str) -> None:
    """Upload bytes to R2 from the API (avoids browser CORS to the bucket)."""
    _require_config()
    errors: list[str] = []
    for label, fn in (
        ("presigned_http", _put_object_presigned_http),
        ("put_object", _put_object_direct),
    ):
        try:
            fn(object_key, body, content_type)
            return
        except R2OperationError as exc:
            errors.append(f"{label}: {exc}")
    raise R2OperationError(" | ".join(errors))


def delete_object(object_key: str) -> None:
    """Delete an object from the bucket."""
    _require_config()
    client = _get_client()
    try:
        client.delete_object(Bucket=_bucket_name(), Key=object_key)
    except ClientError as exc:
        raise R2OperationError(f"Failed to delete object: {exc}") from exc
