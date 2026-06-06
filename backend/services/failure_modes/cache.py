"""Failure modes in-memory cache."""
_cache = {
    "all_modes": None,
    "all_modes_timestamp": 0,
    "cache_ttl": 300,
}


def _invalidate_cache() -> None:
    _cache["all_modes"] = None
    _cache["all_modes_timestamp"] = 0

