"""Intelligence map routes — shared query helpers and PM-import matchers."""
from __future__ import annotations

from typing import Optional

from database import db
from services.db_monitoring import timed_aggregate
from services.intelligence_map_pm_import_matchers import (
    PM_IMPORT_ACTIVE_TASK_MATCH,
    PM_IMPORT_EQUIPMENT_LINKED_TASK_MATCH,
    PM_IMPORT_IMPORTED_TASK_MATCH,
    normalize_equipment_tags,
    pm_import_equipment_linked_task_match,
    pm_import_imported_task_match,
    pm_import_task_match,
)
from services.tenant_schema import prepend_tenant_match
from services.tenant_scope import scoped

_normalize_equipment_tags = normalize_equipment_tags
_pm_import_imported_task_match = pm_import_imported_task_match
_pm_import_equipment_linked_task_match = pm_import_equipment_linked_task_match
_pm_import_task_match = pm_import_task_match


def _scope_query(base: dict, user: dict) -> dict:
    """Apply migration-safe tenant filter to intelligence map aggregations."""
    return scoped(user, base or {})


def _scope_pipeline(pipeline: list, user: dict) -> list:
    return prepend_tenant_match(pipeline, user)


def _current_user_id(current_user: dict) -> str:
    return current_user.get("id") or current_user.get("user_id") or current_user.get("email", "unknown")


def _active_v2_program_match(base_query: Optional[dict] = None) -> dict:
    """V2 programs with at least one enabled task (not just a stale active_tasks counter)."""
    query = dict(base_query or {})
    query["status"] = {"$in": ["active", "draft"]}
    query["$or"] = [
        {"tasks": {"$elemMatch": {"is_active": {"$ne": False}}}},
        {
            "$and": [
                {"active_tasks": {"$gt": 0}},
                {
                    "$or": [
                        {"tasks": {"$exists": False}},
                        {"tasks": []},
                    ]
                },
            ]
        },
    ]
    return query


async def _count_imported_pm_import_tasks(
    user: dict,
    equipment_ids: Optional[list] = None,
    equipment_tags: Optional[list] = None,
) -> int:
    rows = await timed_aggregate(
        db.pm_import_sessions,
        _scope_pipeline([
            {"$unwind": "$tasks_extracted"},
            {"$match": _pm_import_imported_task_match(equipment_ids, equipment_tags)},
            {"$count": "c"},
        ], user),
    )
    return rows[0]["c"] if rows else 0


def _intelligence_map_schedule_query(
    equipment_type_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
) -> dict:
    """Build scheduled_tasks filter used by intelligence map stats (equipment scope only)."""
    schedule_query: dict = {}
    if equipment_type_id:
        schedule_query["equipment_type_id"] = equipment_type_id
    if equipment_id:
        schedule_query["equipment_id"] = equipment_id
    return schedule_query


def _schedules_missing_frequency_filter(schedule_query: dict) -> dict:
    """Match scheduled_tasks with null, empty, or missing frequency."""
    return {
        **schedule_query,
        "$or": [
            {"frequency": None},
            {"frequency": ""},
            {"frequency": {"$exists": False}},
        ],
    }


_OPEN_SCHEDULED_TASK_STATUSES = ["completed", "cancelled"]
_CORRECTIVE_SCHEDULED_TASK_TYPES = ["reactive", "corrective"]


async def _count_scheduler_scoped_open_tasks(
    user: dict,
    *,
    equipment_type_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    equipment_ids: Optional[list] = None,
) -> int:
    """Count open scheduled_tasks using the same scoping as the maintenance scheduler."""
    from services.maintenance_scheduler_scope import scope_scheduled_tasks_query

    query: dict = {
        "status": {"$nin": _OPEN_SCHEDULED_TASK_STATUSES},
        "task_type": {"$nin": _CORRECTIVE_SCHEDULED_TASK_TYPES},
    }
    await scope_scheduled_tasks_query(query, equipment_type_id, user=user)

    if query.get("_id") == {"$exists": False}:
        return 0

    if equipment_id:
        query = {"$and": [query, {"equipment_id": equipment_id}]}
    elif equipment_ids is not None:
        if not equipment_ids:
            return 0
        query = {"$and": [query, {"equipment_id": {"$in": equipment_ids}}]}

    return await db.scheduled_tasks.count_documents(_scope_query(query, user))


async def _count_schedulable_program_tasks(
    *,
    equipment_type_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    equipment_ids: Optional[list] = None,
) -> tuple[int, int, int]:
    """Return (total, from_strategy, from_pm_import) schedulable task templates."""
    from models.maintenance_program import TaskSource
    from services.scheduler_program_source import load_schedulable_programs

    eq_ids = [equipment_id] if equipment_id else equipment_ids
    rows = await load_schedulable_programs(
        equipment_type_id=equipment_type_id,
        equipment_ids=eq_ids,
    )

    if equipment_ids is not None and not equipment_id:
        eq_set = set(equipment_ids)
        rows = [row for row in rows if row.get("equipment_id") in eq_set]

    from_strategy = 0
    from_pm_import = 0
    for row in rows:
        source = (row.get("task_source") or "").lower()
        if (
            row.get("program_source") == "pm_import"
            or source == TaskSource.CUSTOMER_IMPORTED.value
        ):
            from_pm_import += 1
        else:
            from_strategy += 1

    return len(rows), from_strategy, from_pm_import


def _serialize_scheduled_task_missing_frequency(doc: dict) -> dict:
    return {
        "id": doc.get("id"),
        "task_name": doc.get("task_name") or "",
        "equipment_name": doc.get("equipment_name") or "",
        "equipment_tag": doc.get("equipment_tag"),
        "equipment_id": doc.get("equipment_id"),
        "status": doc.get("status"),
        "task_source": doc.get("task_source"),
        "due_date": doc.get("due_date"),
        "maintenance_program_id": doc.get("maintenance_program_id"),
    }


async def _count_active_pm_import_tasks(
    user: dict,
    equipment_ids: Optional[list] = None,
) -> int:
    rows = await timed_aggregate(
        db.pm_import_sessions,
        _scope_pipeline([
            {"$unwind": "$tasks_extracted"},
            {"$match": _pm_import_equipment_linked_task_match(equipment_ids, enabled_only=True)},
            {"$count": "c"},
        ], user),
    )
    return rows[0]["c"] if rows else 0
