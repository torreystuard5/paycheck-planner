"""Simple in-process sliding-window rate limiting (per-process; resets on restart)."""

from __future__ import annotations

import threading
import time
from collections import defaultdict

_lock = threading.Lock()
_buckets: dict[str, list[float]] = defaultdict(list)


def allow_request(key: str, max_requests: int, window_seconds: float) -> bool:
    """
    Record this attempt for `key` and return True if under the limit.
    Returns False when the sliding window already has max_requests entries.
    """
    now = time.monotonic()
    with _lock:
        bucket = _buckets[key]
        cutoff = now - window_seconds
        while bucket and bucket[0] < cutoff:
            bucket.pop(0)
        if len(bucket) >= max_requests:
            return False
        bucket.append(now)
        return True
