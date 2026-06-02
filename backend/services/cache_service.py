"""
Entity-level cache facade. Implementation lives in unified_cache.py.
"""
from services.unified_cache import (
    CACHE_TTL,
    CacheService,
    cache,
    invalidate_equipment_related,
    unified_cache,
)

__all__ = [
    "CacheService",
    "cache",
    "unified_cache",
    "invalidate_equipment_related",
    "CACHE_TTL",
]
