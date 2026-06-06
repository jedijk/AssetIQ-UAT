"""
Failure Modes Service - MongoDB-backed failure mode operations.

Thin facade delegating to focused modules under services.failure_modes/.
"""
from __future__ import annotations

from typing import Optional, List, Dict, Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from services.failure_modes.cache import _invalidate_cache
from services.failure_modes.crud import FailureModesMixin as _CrudMixin
from services.failure_modes.library_queries import FailureModesMixin as _LibraryQueriesMixin
from services.failure_modes.actions_sync import FailureModesMixin as _ActionsSyncMixin

__all__ = [
    "FailureModesService",
    "find_matching_failure_modes_db",
    "get_failure_mode_for_threat_db",
    "_invalidate_cache",
]


class FailureModesService(_CrudMixin, _LibraryQueriesMixin, _ActionsSyncMixin):
    """Service class for failure mode operations using MongoDB."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db["failure_modes"]
        self.versions_collection = db["failure_mode_versions"]


# ============== UTILITY FUNCTIONS (for backward compatibility) ==============

async def find_matching_failure_modes_db(db: AsyncIOMotorDatabase, text: str) -> List[Dict]:
    """
    Find failure modes matching text (for AI/chat integration).
    Searches keywords, failure mode names, and equipment.
    """
    service = FailureModesService(db)
    
    # Extract potential keywords from text
    words = text.lower().split()
    
    # Search by keywords
    results = await service.search_by_keywords(words)
    
    if not results:
        # Fallback to general search
        response = await service.get_all(search=text, limit=5)
        results = response["failure_modes"]
    
    return results[:5]  # Return top 5 matches


async def get_failure_mode_for_threat_db(
    db: AsyncIOMotorDatabase,
    failure_mode_name: str
) -> Optional[Dict]:
    """
    Get failure mode data for linking to a threat.
    Used during threat creation/linking.
    """
    service = FailureModesService(db)
    return await service.get_by_name(failure_mode_name)
