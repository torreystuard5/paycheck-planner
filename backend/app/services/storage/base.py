"""Abstract storage provider interface."""

from abc import ABC, abstractmethod
from datetime import datetime


class PresignedPutResult:
    """Result from a presign-put operation."""

    __slots__ = ("url", "headers", "expires_at", "max_bytes")

    def __init__(
        self,
        url: str,
        headers: dict[str, str],
        expires_at: datetime,
        max_bytes: int,
    ) -> None:
        self.url = url
        self.headers = headers
        self.expires_at = expires_at
        self.max_bytes = max_bytes


class StorageProvider(ABC):
    """Minimal interface for object storage backends."""

    @abstractmethod
    def presign_put(
        self,
        object_key: str,
        content_type: str,
        expires_in: int,
        max_bytes: int,
    ) -> PresignedPutResult:
        ...

    @abstractmethod
    def presign_get(self, object_key: str, expires_in: int) -> str:
        ...

    @abstractmethod
    def object_exists(self, object_key: str) -> bool:
        ...

    @abstractmethod
    def delete_object(self, object_key: str) -> None:
        ...
