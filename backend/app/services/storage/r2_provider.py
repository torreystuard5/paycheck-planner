"""R2 implementation of the StorageProvider interface."""

from __future__ import annotations

from app.services.storage.base import PresignedPutResult, StorageProvider
from app.services.storage import r2_client


class R2StorageProvider(StorageProvider):
    """Delegates to the r2_client module."""

    def presign_put(
        self,
        object_key: str,
        content_type: str,
        expires_in: int,
        max_bytes: int,
    ) -> PresignedPutResult:
        result = r2_client.generate_presigned_put(
            object_key, content_type, expires_in, max_bytes
        )
        return PresignedPutResult(
            url=result["url"],
            headers=result["headers"],
            expires_at=result["expires_at"],
            max_bytes=result["max_bytes"],
        )

    def presign_get(self, object_key: str, expires_in: int) -> str:
        return r2_client.generate_presigned_get(object_key, expires_in)

    def object_exists(self, object_key: str) -> bool:
        return r2_client.object_exists(object_key)

    def delete_object(self, object_key: str) -> None:
        r2_client.delete_object(object_key)


_instance: R2StorageProvider | None = None


def get_storage_provider() -> StorageProvider:
    """Factory — returns the R2 provider (swap here for local/S3 later)."""
    global _instance
    if _instance is None:
        _instance = R2StorageProvider()
    return _instance
