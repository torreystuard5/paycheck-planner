"""Cloudflare R2 client helper (S3-compatible via boto3)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import boto3
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


def _get_client():
    """Lazy-initialise the boto3 S3 client for R2."""
    global _client
    if _client is not None:
        return _client
    _require_config()
    _client = boto3.client(
        "s3",
        endpoint_url=settings.R2_ENDPOINT_URL,
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        region_name="auto",
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
                "Bucket": settings.R2_BUCKET_NAME,
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
                "Bucket": settings.R2_BUCKET_NAME,
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
        client.head_object(Bucket=settings.R2_BUCKET_NAME, Key=object_key)
        return True
    except ClientError as exc:
        if exc.response["Error"]["Code"] in ("404", "NoSuchKey"):
            return False
        raise R2OperationError(f"Failed to check object existence: {exc}") from exc


def delete_object(object_key: str) -> None:
    """Delete an object from the bucket."""
    _require_config()
    client = _get_client()
    try:
        client.delete_object(Bucket=settings.R2_BUCKET_NAME, Key=object_key)
    except ClientError as exc:
        raise R2OperationError(f"Failed to delete object: {exc}") from exc
