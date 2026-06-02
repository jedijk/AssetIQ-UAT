"""
Unified in-memory cache for AssetIQ.

Combines entity-level TTL caches (equipment, users, failure modes, stats) with
prefix-based query result caches. Use invalidate_domain() after mutations so
related layers stay consistent.
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
from enum import Enum
from threading import Lock
from typing import Any, Callable, Dict, Optional

from cachetools import TTLCache
from functools import wraps

logger = logging.getLogger("assetiq.cache")

# Entity cache configuration (from legacy cache_service)
EQUIPMENT_CACHE_TTL = 300
EQUIPMENT_CACHE_SIZE = 1000
USER_CACHE_TTL = 300
USER_CACHE_SIZE = 500
FAILURE_MODE_CACHE_TTL = 600
FAILURE_MODE_CACHE_SIZE = 500
STATS_CACHE_TTL = 60
STATS_CACHE_SIZE = 100

# Query cache TTL presets (from legacy query_cache)
CACHE_TTL = {
    "equipment_hierarchy": 600,
    "equipment_nodes": 60,
    "form_templates": 300,
    "task_templates": 300,
    "failure_modes": 300,
    "installations": 600,
    "equipment_types": 600,
    "users_list": 120,
    "dashboard": 60,
    "my_tasks": 30,
}


class CacheDomain(str, Enum):
    EQUIPMENT = "equipment"
    CRITICALITY = "criticality"
    FAILURE_MODES = "failure_modes"
    FORMS = "forms"
    TASKS = "tasks"
    USERS = "users"
    STATS = "stats"
    ALL = "all"


def _get_db_prefix() -> str:
    try:
        from database import get_current_db_name

        return get_current_db_name()
    except Exception:
        return "default"


def _log_cache_event(event: str, **fields: Any) -> None:
    """Structured cache logging (JSON-friendly via extra=)."""
    payload = {"cache_event": event, **fields}
    logger.info("cache %s", event, extra=payload)


class UnifiedCache:
    """Single cache service: entity stores + query store + coordinated invalidation."""

    def __init__(self) -> None:
        self._equipment = TTLCache(maxsize=EQUIPMENT_CACHE_SIZE, ttl=EQUIPMENT_CACHE_TTL)
        self._equipment_lock = Lock()
        self._users = TTLCache(maxsize=USER_CACHE_SIZE, ttl=USER_CACHE_TTL)
        self._users_lock = Lock()
        self._failure_modes = TTLCache(maxsize=FAILURE_MODE_CACHE_SIZE, ttl=FAILURE_MODE_CACHE_TTL)
        self._failure_modes_lock = Lock()
        self._stats = TTLCache(maxsize=STATS_CACHE_SIZE, ttl=STATS_CACHE_TTL)
        self._stats_lock = Lock()

        self._query: Dict[str, Dict[str, Any]] = {}
        self._query_lock = Lock()
        self._metrics = {
            "entity_hits": 0,
            "entity_misses": 0,
            "query_hits": 0,
            "query_misses": 0,
            "invalidations": 0,
        }
        self._metrics_lock = Lock()

    # ------------------------------------------------------------------ metrics
    def _inc(self, key: str, n: int = 1) -> None:
        with self._metrics_lock:
            self._metrics[key] = self._metrics.get(key, 0) + n

    def get_stats(self) -> dict:
        with self._metrics_lock:
            metrics = dict(self._metrics)
        with self._query_lock:
            query_entries = len(self._query)
        total_q = metrics["query_hits"] + metrics["query_misses"]
        hit_rate = (metrics["query_hits"] / total_q * 100) if total_q > 0 else 0.0
        return {
            "entries": query_entries,
            "hits": metrics["query_hits"],
            "misses": metrics["query_misses"],
            "hit_rate": f"{hit_rate:.1f}%",
            "entity_hits": metrics["entity_hits"],
            "entity_misses": metrics["entity_misses"],
            "invalidations": metrics["invalidations"],
            "entity_sizes": {
                "equipment": len(self._equipment),
                "users": len(self._users),
                "failure_modes": len(self._failure_modes),
                "stats": len(self._stats),
            },
        }

    # ------------------------------------------------------------------ query layer
    def _make_query_key(self, prefix: str, params: Optional[dict] = None) -> str:
        db_name = _get_db_prefix()
        if params:
            param_str = json.dumps(params, sort_keys=True, default=str)
            param_hash = hashlib.md5(param_str.encode()).hexdigest()[:12]
            return f"{db_name}:{prefix}:{param_hash}"
        return f"{db_name}:{prefix}"

    def query_get(self, key: str) -> Optional[Any]:
        """Get a query-cached value. Key may be raw prefix or full key."""
        full_key = key if key.count(":") >= 2 else self._make_query_key(key)
        with self._query_lock:
            entry = self._query.get(full_key)
            if entry is None:
                self._inc("query_misses")
                return None
            if time.time() > entry["expires_at"]:
                del self._query[full_key]
                self._inc("query_misses")
                return None
            self._inc("query_hits")
            return entry["value"]

    def query_set(self, key: str, value: Any, ttl: int = 300) -> None:
        full_key = key if key.count(":") >= 2 else self._make_query_key(key)
        with self._query_lock:
            self._query[full_key] = {
                "value": value,
                "expires_at": time.time() + ttl,
                "created_at": time.time(),
            }

    def query_invalidate(self, pattern: str) -> int:
        with self._query_lock:
            keys_to_delete = [k for k in self._query if pattern in k]
            for k in keys_to_delete:
                del self._query[k]
        if keys_to_delete:
            self._inc("invalidations", len(keys_to_delete))
            _log_cache_event(
                "query_invalidate",
                pattern=pattern,
                count=len(keys_to_delete),
            )
        return len(keys_to_delete)

    def query_invalidate_all(self) -> int:
        with self._query_lock:
            count = len(self._query)
            self._query.clear()
        self._inc("invalidations", count)
        _log_cache_event("query_invalidate_all", count=count)
        return count

    # ------------------------------------------------------------------ entity: equipment
    def get_equipment(self, equipment_id: str):
        with self._equipment_lock:
            val = self._equipment.get(equipment_id)
        if val is not None:
            self._inc("entity_hits")
        else:
            self._inc("entity_misses")
        return val

    def set_equipment(self, equipment_id: str, equipment: dict) -> None:
        with self._equipment_lock:
            self._equipment[equipment_id] = equipment

    def invalidate_equipment(self, equipment_id: Optional[str] = None) -> None:
        with self._equipment_lock:
            if equipment_id:
                self._equipment.pop(equipment_id, None)
            else:
                self._equipment.clear()
        self._inc("invalidations", 1)

    # ------------------------------------------------------------------ entity: users
    def get_user(self, user_id: str):
        with self._users_lock:
            val = self._users.get(user_id)
        if val is not None:
            self._inc("entity_hits")
        else:
            self._inc("entity_misses")
        return val

    def set_user(self, user_id: str, user: dict) -> None:
        with self._users_lock:
            self._users[user_id] = user

    def invalidate_user(self, user_id: Optional[str] = None) -> None:
        with self._users_lock:
            if user_id:
                self._users.pop(user_id, None)
            else:
                self._users.clear()
        self._inc("invalidations", 1)

    def get_users_batch(self, user_ids: list) -> dict:
        result = {}
        with self._users_lock:
            for uid in user_ids:
                if uid in self._users:
                    result[uid] = self._users[uid]
        if result:
            self._inc("entity_hits", len(result))
        return result

    def set_users_batch(self, users: dict) -> None:
        with self._users_lock:
            for uid, user in users.items():
                self._users[uid] = user

    # ------------------------------------------------------------------ entity: failure modes
    def get_failure_mode(self, fm_id: str):
        with self._failure_modes_lock:
            val = self._failure_modes.get(fm_id)
        if val is not None:
            self._inc("entity_hits")
        else:
            self._inc("entity_misses")
        return val

    def set_failure_mode(self, fm_id: str, fm: dict) -> None:
        with self._failure_modes_lock:
            self._failure_modes[fm_id] = fm

    def invalidate_failure_mode(self, fm_id: Optional[str] = None) -> None:
        with self._failure_modes_lock:
            if fm_id:
                self._failure_modes.pop(fm_id, None)
            else:
                self._failure_modes.clear()
        self._inc("invalidations", 1)

    # ------------------------------------------------------------------ entity: stats
    def get_stats(self, key: str):
        with self._stats_lock:
            val = self._stats.get(key)
        if val is not None:
            self._inc("entity_hits")
        else:
            self._inc("entity_misses")
        return val

    def set_stats(self, key: str, value) -> None:
        with self._stats_lock:
            self._stats[key] = value

    def invalidate_stats(self, key: Optional[str] = None) -> None:
        with self._stats_lock:
            if key:
                self._stats.pop(key, None)
            else:
                self._stats.clear()
        self._inc("invalidations", 1)

    def clear_all(self) -> None:
        with self._equipment_lock:
            self._equipment.clear()
        with self._users_lock:
            self._users.clear()
        with self._failure_modes_lock:
            self._failure_modes.clear()
        with self._stats_lock:
            self._stats.clear()
        self.query_invalidate_all()
        _log_cache_event("clear_all")

    # ------------------------------------------------------------------ domain invalidation
    def invalidate_domain(
        self,
        domain: CacheDomain | str,
        *,
        equipment_id: Optional[str] = None,
        equipment_name: Optional[str] = None,
        user_id: Optional[str] = None,
        reason: str = "mutation",
    ) -> dict:
        """
        Coordinated invalidation for a business domain.
        Returns counts per layer for observability.
        """
        domain_val = domain.value if isinstance(domain, CacheDomain) else str(domain)
        counts: Dict[str, int] = {"query": 0, "entity": 0}

        if domain_val in (CacheDomain.EQUIPMENT.value, CacheDomain.CRITICALITY.value, CacheDomain.ALL.value):
            if equipment_id:
                self.invalidate_equipment(equipment_id)
                counts["entity"] += 1
            if equipment_name:
                self.invalidate_equipment(f"name:{equipment_name}")
                counts["entity"] += 1
            if not equipment_id and not equipment_name and domain_val != CacheDomain.CRITICALITY.value:
                self.invalidate_equipment()
                counts["entity"] += 1
            counts["query"] += self.query_invalidate("equipment_nodes")
            counts["query"] += self.query_invalidate("equipment_hierarchy")
            counts["query"] += self.query_invalidate("installations")

        if domain_val in (CacheDomain.CRITICALITY.value, CacheDomain.EQUIPMENT.value, CacheDomain.ALL.value):
            counts["query"] += self.query_invalidate("dashboard")

        if domain_val in (CacheDomain.FAILURE_MODES.value, CacheDomain.EQUIPMENT.value, CacheDomain.ALL.value):
            if domain_val != CacheDomain.EQUIPMENT.value or equipment_id is None:
                self.invalidate_failure_mode()
                counts["entity"] += 1
            counts["query"] += self.query_invalidate("failure_modes")

        if domain_val == CacheDomain.FORMS.value or domain_val == CacheDomain.ALL.value:
            counts["query"] += self.query_invalidate("form_templates")

        if domain_val == CacheDomain.TASKS.value or domain_val == CacheDomain.ALL.value:
            counts["query"] += self.query_invalidate("task_templates")
            counts["query"] += self.query_invalidate("my_tasks")

        if domain_val == CacheDomain.USERS.value or domain_val == CacheDomain.ALL.value:
            if user_id:
                self.invalidate_user(user_id)
            else:
                self.invalidate_user()
            counts["entity"] += 1
            counts["query"] += self.query_invalidate("users_list")

        if domain_val == CacheDomain.STATS.value or domain_val == CacheDomain.ALL.value:
            self.invalidate_stats()
            counts["entity"] += 1

        _log_cache_event(
            "invalidate_domain",
            domain=domain_val,
            reason=reason,
            equipment_id=equipment_id,
            query_invalidated=counts["query"],
            entity_invalidated=counts["entity"],
        )
        return counts


# Global singleton
unified_cache = UnifiedCache()


class CacheService:
    """Backwards-compatible facade for legacy cache_service imports."""

    @staticmethod
    def get_equipment(equipment_id: str):
        return unified_cache.get_equipment(equipment_id)

    @staticmethod
    def set_equipment(equipment_id: str, equipment: dict):
        unified_cache.set_equipment(equipment_id, equipment)

    @staticmethod
    def invalidate_equipment(equipment_id: str = None):
        unified_cache.invalidate_equipment(equipment_id)

    @staticmethod
    def get_user(user_id: str):
        return unified_cache.get_user(user_id)

    @staticmethod
    def set_user(user_id: str, user: dict):
        unified_cache.set_user(user_id, user)

    @staticmethod
    def invalidate_user(user_id: str = None):
        unified_cache.invalidate_user(user_id)

    @staticmethod
    def get_users_batch(user_ids: list) -> dict:
        return unified_cache.get_users_batch(user_ids)

    @staticmethod
    def set_users_batch(users: dict):
        unified_cache.set_users_batch(users)

    @staticmethod
    def get_failure_mode(fm_id: str):
        return unified_cache.get_failure_mode(fm_id)

    @staticmethod
    def set_failure_mode(fm_id: str, fm: dict):
        unified_cache.set_failure_mode(fm_id, fm)

    @staticmethod
    def invalidate_failure_mode(fm_id: str = None):
        unified_cache.invalidate_failure_mode(fm_id)

    @staticmethod
    def get_stats(key: str):
        return unified_cache.get_stats(key)

    @staticmethod
    def set_stats(key: str, value):
        unified_cache.set_stats(key, value)

    @staticmethod
    def invalidate_stats(key: str = None):
        unified_cache.invalidate_stats(key)

    @staticmethod
    def clear_all():
        unified_cache.clear_all()


cache = CacheService()


class QueryCache:
    """Backwards-compatible facade for legacy query_cache imports."""

    def __init__(self):
        self._uc = unified_cache
        self._stats = {"hits": 0, "misses": 0}

    def _get_db_prefix(self) -> str:
        return _get_db_prefix()

    def _make_key(self, prefix: str, params: dict = None) -> str:
        return unified_cache._make_query_key(prefix, params)

    def get(self, key: str) -> Optional[Any]:
        val = unified_cache.query_get(key)
        if val is None:
            self._stats["misses"] += 1
        else:
            self._stats["hits"] += 1
        return val

    def set(self, key: str, value: Any, ttl: int = 300):
        unified_cache.query_set(key, value, ttl)

    def invalidate(self, pattern: str) -> int:
        return unified_cache.query_invalidate(pattern)

    def invalidate_all(self):
        unified_cache.query_invalidate_all()

    def get_stats(self) -> dict:
        return unified_cache.get_stats()


query_cache = QueryCache()


def cached(prefix: str, ttl: int = None):
    """Decorator for caching async function results."""

    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            cache_params = {
                "args": str(args[1:]) if len(args) > 1 else "",
                **{k: v for k, v in kwargs.items() if k not in ["db", "current_user"]},
            }
            cache_key = unified_cache._make_query_key(prefix, cache_params)
            cached_value = unified_cache.query_get(cache_key)
            if cached_value is not None:
                logger.debug("Cache HIT: %s", prefix)
                return cached_value
            logger.debug("Cache MISS: %s", prefix)
            result = await func(*args, **kwargs)
            cache_ttl = ttl or CACHE_TTL.get(prefix, 300)
            unified_cache.query_set(cache_key, result, cache_ttl)
            return result

        return wrapper

    return decorator


def invalidate_cache(prefix: str) -> int:
    return unified_cache.query_invalidate(prefix)


def get_cache_stats() -> dict:
    return unified_cache.get_stats()


def invalidate_equipment_related(
    *,
    equipment_id: Optional[str] = None,
    equipment_name: Optional[str] = None,
    user_id: Optional[str] = None,
    reason: str = "equipment_mutation",
) -> dict:
    """Single entry point for equipment hierarchy / criticality mutations."""
    return unified_cache.invalidate_domain(
        CacheDomain.EQUIPMENT,
        equipment_id=equipment_id,
        equipment_name=equipment_name,
        user_id=user_id,
        reason=reason,
    )
