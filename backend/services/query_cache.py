"""
Query Cache Service - In-memory caching for frequently accessed data.

This cache significantly reduces MongoDB round-trips for data that doesn't
change frequently. Each cache entry has a TTL and can be invalidated manually.
"""
import time
import logging
from typing import Any, Optional, Dict, Callable
from functools import wraps
import hashlib
import json

logger = logging.getLogger(__name__)


class QueryCache:
    """Simple in-memory cache with TTL support.
    
    Note: Cache keys automatically include the current database environment
    to prevent cross-database cache pollution when using multi-database switching.
    """
    
    def __init__(self):
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._stats = {
            "hits": 0,
            "misses": 0,
        }
    
    def _get_db_prefix(self) -> str:
        """Get the current database name for cache key prefix."""
        try:
            from database import get_current_db_name
            return get_current_db_name()
        except Exception:
            return "default"
    
    def _make_key(self, prefix: str, params: dict = None) -> str:
        """Generate a cache key from prefix and params, including database context."""
        db_name = self._get_db_prefix()
        if params:
            param_str = json.dumps(params, sort_keys=True, default=str)
            param_hash = hashlib.md5(param_str.encode()).hexdigest()[:12]
            return f"{db_name}:{prefix}:{param_hash}"
        return f"{db_name}:{prefix}"
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache if not expired.
        
        Note: The key should be a raw key. The database context is automatically prefixed.
        """
        # Add database prefix to ensure isolation between environments
        full_key = self._make_key(key) if ":" not in key or not key.startswith(("assetiq", "default")) else key
        
        entry = self._cache.get(full_key)
        if entry is None:
            self._stats["misses"] += 1
            return None
        
        if time.time() > entry["expires_at"]:
            del self._cache[full_key]
            self._stats["misses"] += 1
            return None
        
        self._stats["hits"] += 1
        return entry["value"]
    
    def set(self, key: str, value: Any, ttl: int = 300):
        """Set value in cache with TTL in seconds.
        
        Note: The key is automatically prefixed with the current database environment.
        """
        # Add database prefix to ensure isolation between environments
        full_key = self._make_key(key) if ":" not in key or not key.startswith(("assetiq", "default")) else key
        
        self._cache[full_key] = {
            "value": value,
            "expires_at": time.time() + ttl,
            "created_at": time.time(),
        }
    
    def invalidate(self, pattern: str):
        """Invalidate all cache entries containing the given pattern."""
        keys_to_delete = [k for k in self._cache.keys() if pattern in k]
        for key in keys_to_delete:
            del self._cache[key]
        if keys_to_delete:
            logger.debug(f"Invalidated {len(keys_to_delete)} cache entries for pattern: {pattern}")
        return len(keys_to_delete)
    
    def invalidate_all(self):
        """Clear entire cache."""
        count = len(self._cache)
        self._cache.clear()
        logger.info(f"Cleared entire cache ({count} entries)")
    
    def get_stats(self) -> dict:
        """Get cache statistics."""
        total = self._stats["hits"] + self._stats["misses"]
        hit_rate = (self._stats["hits"] / total * 100) if total > 0 else 0
        return {
            "entries": len(self._cache),
            "hits": self._stats["hits"],
            "misses": self._stats["misses"],
            "hit_rate": f"{hit_rate:.1f}%",
        }


# Global cache instance
query_cache = QueryCache()


# Cache TTL settings (in seconds)
CACHE_TTL = {
    "equipment_hierarchy": 600,    # 10 minutes - rarely changes
    "form_templates": 300,         # 5 minutes
    "task_templates": 300,         # 5 minutes
    "failure_modes": 300,          # 5 minutes (already cached in service)
    "installations": 600,          # 10 minutes
    "equipment_types": 600,        # 10 minutes
    "users_list": 120,             # 2 minutes
    "dashboard": 60,               # 1 minute
    "my_tasks": 30,                # 30 seconds - changes frequently
}


def cached(prefix: str, ttl: int = None):
    """
    Decorator for caching async function results.
    
    Usage:
        @cached("equipment_hierarchy", ttl=600)
        async def get_hierarchy(self, **params):
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Build cache key from function args (skip 'self')
            cache_params = {
                "args": str(args[1:]) if len(args) > 1 else "",
                **{k: v for k, v in kwargs.items() if k not in ['db', 'current_user']}
            }
            cache_key = query_cache._make_key(prefix, cache_params)
            
            # Check cache
            cached_value = query_cache.get(cache_key)
            if cached_value is not None:
                logger.debug(f"Cache HIT: {prefix}")
                return cached_value
            
            # Execute function
            logger.debug(f"Cache MISS: {prefix}")
            result = await func(*args, **kwargs)
            
            # Store in cache
            cache_ttl = ttl or CACHE_TTL.get(prefix, 300)
            query_cache.set(cache_key, result, cache_ttl)
            
            return result
        return wrapper
    return decorator


def invalidate_cache(prefix: str):
    """Invalidate cache entries for a given prefix."""
    query_cache.invalidate(prefix)


def get_cache_stats() -> dict:
    """Get cache statistics."""
    return query_cache.get_stats()
