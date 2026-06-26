"""Intelligence map routes — service layer facade."""

from __future__ import annotations

import logging
from typing import Optional

from database import db, installation_filter
from services.equipment_type_registry import list_equipment_types
from services.intelligence_map_helpers import (
    PM_IMPORT_ACTIVE_TASK_MATCH,
    PM_IMPORT_EQUIPMENT_LINKED_TASK_MATCH,
    PM_IMPORT_IMPORTED_TASK_MATCH,
    _active_v2_program_match,
    _count_imported_pm_import_tasks,
    _count_scheduler_scoped_open_tasks,
    _count_schedulable_program_tasks,
    _intelligence_map_schedule_query,
    _normalize_equipment_tags,
    _pm_import_equipment_linked_task_match,
    _pm_import_imported_task_match,
    _pm_import_task_match,
    _schedules_missing_frequency_filter,
    _scope_pipeline,
    _scope_query,
    _serialize_scheduled_task_missing_frequency,
)
from services.intelligence_map_stats import get_intelligence_map_stats

logger = logging.getLogger(__name__)


async def get_schedules_missing_frequency(
    plant_id: Optional[str] = None,
    system_id: Optional[str] = None,
    equipment_type_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    limit: int = 100,
    skip: int = 0, *, current_user: dict,
):
    """
    List scheduled tasks missing a frequency value.

    Uses the same equipment_type_id / equipment_id scope as GET /stats schedule counts.
    plant_id and system_id are accepted for API parity but do not narrow schedule_query.
    """
    limit = max(1, min(limit, 500))
    skip = max(0, skip)

    try:
        schedule_query = _intelligence_map_schedule_query(equipment_type_id, equipment_id)
        query = _scope_query(_schedules_missing_frequency_filter(schedule_query), current_user)

        total = await db.scheduled_tasks.count_documents(query)
        cursor = (
            db.scheduled_tasks.find(
                query,
                {
                    "id": 1,
                    "task_name": 1,
                    "equipment_name": 1,
                    "equipment_tag": 1,
                    "equipment_id": 1,
                    "status": 1,
                    "task_source": 1,
                    "due_date": 1,
                    "maintenance_program_id": 1,
                    "_id": 0,
                },
            )
            .sort([("equipment_name", 1), ("task_name", 1)])
            .skip(skip)
            .limit(limit)
        )
        docs = await cursor.to_list(limit)
        tasks = [_serialize_scheduled_task_missing_frequency(doc) for doc in docs]

        return {"tasks": tasks, "total": total, "limit": limit, "skip": skip}
    except Exception:
        logger.exception("Error listing schedules missing frequency")
        raise


async def get_intelligence_map_filters(*, current_user: dict):
    """
    Get available filter options for the Intelligence Map dashboard.

    Returns:
    - plants: List of plants/installations
    - systems: List of systems/sections (can be filtered by plant)
    - equipment_types: List of equipment types
    """
    try:
        installation_ids = await installation_filter.get_user_installation_ids(current_user)

        plants_query = {"level": "installation"}
        if installation_ids:
            plants_query["id"] = {"$in": installation_ids}

        plants = await db.equipment_nodes.find(
            _scope_query(plants_query, current_user),
            {"id": 1, "name": 1, "_id": 0}
        ).to_list(100)

        systems = await db.equipment_nodes.find(
            _scope_query({"level": {"$in": ["section_system", "plant_unit", "system"]}}, current_user),
            {"id": 1, "name": 1, "parent_id": 1, "_id": 0}
        ).to_list(500)

        equipment_types = await list_equipment_types(
            db,
            projection={"id": 1, "name": 1, "category": 1, "_id": 0},
            limit=500,
            user=current_user,
        )

        return {
            "plants": plants,
            "systems": systems,
            "equipment_types": equipment_types
        }

    except Exception:
        logger.exception("Error getting intelligence map filters")
        raise
