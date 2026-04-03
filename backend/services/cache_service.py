"""
In-memory caching service for frequently accessed data.
Provides TTL-based caching to reduce database load.
"""
from cachetools import TTLCache
from threading import Lock
import logging

logger = logging.getLogger(__name__)

# Cache configurations
EQUIPMENT_CACHE_TTL = 300  # 5 minutes
EQUIPMENT_CACHE_SIZE = 1000

USER_CACHE_TTL = 300  # 5 minutes
USER_CACHE_SIZE = 500

FAILURE_MODE_CACHE_TTL = 600  # 10 minutes
FAILURE_MODE_CACHE_SIZE = 500

STATS_CACHE_TTL = 60  # 1 minute
STATS_CACHE_SIZE = 100

# Thread-safe caches
_equipment_cache = TTLCache(maxsize=EQUIPMENT_CACHE_SIZE, ttl=EQUIPMENT_CACHE_TTL)
_equipment_lock = Lock()

_user_cache = TTLCache(maxsize=USER_CACHE_SIZE, ttl=USER_CACHE_TTL)
_user_lock = Lock()

_failure_mode_cache = TTLCache(maxsize=FAILURE_MODE_CACHE_SIZE, ttl=FAILURE_MODE_CACHE_TTL)
_failure_mode_lock = Lock()

_stats_cache = TTLCache(maxsize=STATS_CACHE_SIZE, ttl=STATS_CACHE_TTL)
_stats_lock = Lock()


class CacheService:
    """Centralized caching service for database queries."""
    
    @staticmethod
    def get_equipment(equipment_id: str):
        """Get equipment from cache."""
        with _equipment_lock:
            return _equipment_cache.get(equipment_id)
    
    @staticmethod
    def set_equipment(equipment_id: str, equipment: dict):
        """Cache equipment data."""
        with _equipment_lock:
            _equipment_cache[equipment_id] = equipment
    
    @staticmethod
    def invalidate_equipment(equipment_id: str = None):
        """Invalidate equipment cache."""
        with _equipment_lock:
            if equipment_id:
                _equipment_cache.pop(equipment_id, None)
            else:
                _equipment_cache.clear()
    
    @staticmethod
    def get_user(user_id: str):
        """Get user from cache."""
        with _user_lock:
            return _user_cache.get(user_id)
    
    @staticmethod
    def set_user(user_id: str, user: dict):
        """Cache user data."""
        with _user_lock:
            _user_cache[user_id] = user
    
    @staticmethod
    def invalidate_user(user_id: str = None):
        """Invalidate user cache."""
        with _user_lock:
            if user_id:
                _user_cache.pop(user_id, None)
            else:
                _user_cache.clear()
    
    @staticmethod
    def get_users_batch(user_ids: list) -> dict:
        """Get multiple users from cache. Returns dict of {id: user}."""
        result = {}
        with _user_lock:
            for uid in user_ids:
                if uid in _user_cache:
                    result[uid] = _user_cache[uid]
        return result
    
    @staticmethod
    def set_users_batch(users: dict):
        """Cache multiple users. Input: {id: user}."""
        with _user_lock:
            for uid, user in users.items():
                _user_cache[uid] = user
    
    @staticmethod
    def get_failure_mode(fm_id: str):
        """Get failure mode from cache."""
        with _failure_mode_lock:
            return _failure_mode_cache.get(fm_id)
    
    @staticmethod
    def set_failure_mode(fm_id: str, fm: dict):
        """Cache failure mode data."""
        with _failure_mode_lock:
            _failure_mode_cache[fm_id] = fm
    
    @staticmethod
    def invalidate_failure_mode(fm_id: str = None):
        """Invalidate failure mode cache."""
        with _failure_mode_lock:
            if fm_id:
                _failure_mode_cache.pop(fm_id, None)
            else:
                _failure_mode_cache.clear()
    
    @staticmethod
    def get_stats(key: str):
        """Get stats from cache."""
        with _stats_lock:
            return _stats_cache.get(key)
    
    @staticmethod
    def set_stats(key: str, value):
        """Cache stats data."""
        with _stats_lock:
            _stats_cache[key] = value
    
    @staticmethod
    def invalidate_stats(key: str = None):
        """Invalidate stats cache."""
        with _stats_lock:
            if key:
                _stats_cache.pop(key, None)
            else:
                _stats_cache.clear()
    
    @staticmethod
    def clear_all():
        """Clear all caches."""
        with _equipment_lock:
            _equipment_cache.clear()
        with _user_lock:
            _user_cache.clear()
        with _failure_mode_lock:
            _failure_mode_cache.clear()
        with _stats_lock:
            _stats_cache.clear()
        logger.info("All caches cleared")


# Singleton instance
cache = CacheService()
