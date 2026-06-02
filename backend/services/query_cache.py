"""
Query result cache facade. Implementation lives in unified_cache.py.
"""
from services.unified_cache import (
    CACHE_TTL,
    QueryCache,
    cached,
    get_cache_stats,
    invalidate_cache,
    query_cache,
    unified_cache,
)

__all__ = [
    "QueryCache",
    "query_cache",
    "cached",
    "invalidate_cache",
    "get_cache_stats",
    "CACHE_TTL",
    "unified_cache",
]
