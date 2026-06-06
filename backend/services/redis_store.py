"""
Optional Redis backing for distributed caches and rate limits.

When ``REDIS_URL`` is unset or Redis is unreachable, callers fall back to
in-process stores (see ``ai_cost_guard``, ``unified_cache``).
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

logger = logging.getLogger("assetiq.redis")

_redis_client: Any = None
_redis_checked = False
_redis_enabled = False


def get_redis() -> Any:
    """Return a connected Redis client or None."""
    global _redis_client, _redis_checked, _redis_enabled
    if _redis_checked:
        return _redis_client if _redis_enabled else None

    _redis_checked = True
    url = os.environ.get("REDIS_URL", "").strip()
    if not url:
        _redis_enabled = False
        return None

    try:
        import redis

        client = redis.from_url(url, decode_responses=True, socket_connect_timeout=2)
        client.ping()
        _redis_client = client
        _redis_enabled = True
        logger.info("Redis connected", extra={"redis_event": "connected"})
        return client
    except Exception as exc:
        _redis_enabled = False
        logger.warning("Redis unavailable — using in-memory fallback: %s", exc)
        return None


def redis_status() -> dict:
    """Health snapshot for /api/metrics."""
    url = os.environ.get("REDIS_URL", "").strip()
    if not url:
        return {"enabled": False, "configured": False}
    client = get_redis()
    if not client:
        return {"enabled": False, "configured": True, "reason": "connection_failed"}
    try:
        client.ping()
        return {"enabled": True, "configured": True}
    except Exception as exc:
        return {"enabled": False, "configured": True, "reason": str(exc)[:120]}


def get_int(key: str) -> Optional[int]:
    client = get_redis()
    if not client:
        return None
    try:
        return int(client.get(key) or 0)
    except Exception:
        return None


def incr_with_ttl(key: str, ttl_seconds: int) -> Optional[int]:
    """Increment a counter and refresh TTL. Returns None when Redis is unavailable."""
    client = get_redis()
    if not client:
        return None
    try:
        pipe = client.pipeline()
        pipe.incr(key)
        pipe.expire(key, ttl_seconds)
        count, _ = pipe.execute()
        return int(count)
    except Exception as exc:
        logger.warning("Redis incr failed for %s: %s", key, exc)
        return None


def get_json(key: str) -> Optional[Any]:
    client = get_redis()
    if not client:
        return None
    try:
        raw = client.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


def set_json(key: str, value: Any, ttl_seconds: int) -> bool:
    client = get_redis()
    if not client:
        return False
    try:
        client.setex(key, ttl_seconds, json.dumps(value))
        return True
    except Exception:
        return False
