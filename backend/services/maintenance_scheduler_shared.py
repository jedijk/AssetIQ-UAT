"""Shared constants and helpers for maintenance scheduler sync."""
import logging
import time
from datetime import datetime
from typing import Dict, List, Optional, Set, Tuple

from database import db
from services.maintenance_tenant_scope import maintenance_scoped_job

logger = logging.getLogger(__name__)

OPEN_TASK_STATUSES = {"$nin": ["completed", "cancelled"]}
_ACTIVE_STRATEGY_TYPE_QUERY = {"$nor": [{"status": "disabled"}]}
_ACTIVE_STRATEGY_CACHE: Optional[Tuple[float, Set[str]]] = None
_ACTIVE_STRATEGY_CACHE_TTL = 60.0


def invalidate_active_strategy_type_cache() -> None:
    """Clear cached active strategy type ids after enable/disable/delete."""
    global _ACTIVE_STRATEGY_CACHE
    _ACTIVE_STRATEGY_CACHE = None


async def _cancel_open_scheduled_for_program_ids(program_ids: List[str]) -> int:
    if not program_ids:
        return 0
    result = await db.scheduled_tasks.update_many(
        maintenance_scoped_job({
            "maintenance_program_id": {"$in": program_ids},
            "status": OPEN_TASK_STATUSES,
        }),
        {
            "$set": {
                "status": "cancelled",
                "notes": "Auto-cancelled: maintenance program task removed or deactivated",
                "updated_at": datetime.utcnow().isoformat(),
            }
        },
    )
    return result.modified_count


async def _active_strategy_type_ids() -> Set[str]:
    global _ACTIVE_STRATEGY_CACHE
    now = time.monotonic()
    if _ACTIVE_STRATEGY_CACHE is not None:
        cached_at, cached_ids = _ACTIVE_STRATEGY_CACHE
        if now - cached_at < _ACTIVE_STRATEGY_CACHE_TTL:
            return cached_ids

    ids = {
        doc["equipment_type_id"]
        async for doc in db.equipment_type_strategies.find(
            maintenance_scoped_job(_ACTIVE_STRATEGY_TYPE_QUERY),
            {"equipment_type_id": 1, "_id": 0},
        )
        if doc.get("equipment_type_id")
    }
    _ACTIVE_STRATEGY_CACHE = (now, ids)
    return ids


async def _equipment_ids_for_type(equipment_type_id: str) -> Set[str]:
    equipment_ids: Set[str] = set()
    async for eq in db.equipment_nodes.find(
        maintenance_scoped_job({"equipment_type_id": equipment_type_id}),
        {"id": 1, "_id": 0},
    ):
        if eq.get("id"):
            equipment_ids.add(eq["id"])
    async for prog in db.maintenance_programs.find(
        maintenance_scoped_job(
            {"$or": [{"equipment_type_id": equipment_type_id}, {"strategy_id": equipment_type_id}]}
        ),
        {"equipment_id": 1, "_id": 0},
    ):
        if prog.get("equipment_id"):
            equipment_ids.add(prog["equipment_id"])
    return equipment_ids

