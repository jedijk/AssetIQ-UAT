"""
Load schedulable maintenance programs from canonical v2 documents,
with legacy ``maintenance_programs`` fallback for equipment not yet on v2.
"""
from typing import Any, Dict, List, Optional, Set

from database import db
from models.maintenance_program import TaskSource
from services.scheduler_helpers import (
    frequency_to_days,
    normalize_program_criticality,
    program_is_schedulable,
)


def _task_type_for_scheduler(task: Dict[str, Any]) -> str:
    raw = task.get("task_type") or task.get("task_category") or "preventive"
    if hasattr(raw, "value"):
        raw = raw.value
    return str(raw).lower()


def _frequency_for_scheduler(task: Dict[str, Any]) -> tuple:
    freq = task.get("frequency") or "monthly"
    if hasattr(freq, "value"):
        freq = freq.value
    frequency = str(freq).lower()
    if frequency in ("not_required", "hourly", "shift"):
        return None, 0
    freq_days = int(task.get("frequency_days") or frequency_to_days(frequency))
    return frequency, max(1, freq_days)


def expand_v2_program_to_scheduler_rows(
    program_v2: Dict[str, Any],
    active_strategy_type_ids: Set[str],
) -> List[Dict[str, Any]]:
    """Flatten one maintenance_programs_v2 document into scheduler-ready rows."""
    rows: List[Dict[str, Any]] = []
    equipment_id = program_v2.get("equipment_id")
    if not equipment_id:
        return rows

    status = (program_v2.get("status") or "active").lower()
    if status not in ("active", "draft"):
        return rows

    equip_criticality = normalize_program_criticality(
        program_v2.get("criticality_level") or program_v2.get("criticality")
    )
    equipment_type_id = program_v2.get("equipment_type_id") or ""
    trace_strategy_id = program_v2.get("source_strategy_id") or equipment_type_id

    for task in program_v2.get("tasks") or []:
        if not task.get("is_active", True):
            continue

        task_type = _task_type_for_scheduler(task)
        if task_type in ("reactive", "corrective"):
            continue

        frequency, freq_days = _frequency_for_scheduler(task)
        if not frequency or freq_days <= 0:
            continue

        source = (task.get("task_source") or TaskSource.MANUAL.value).lower()
        if source == TaskSource.STRATEGY_GENERATED.value:
            if equipment_type_id and equipment_type_id not in active_strategy_type_ids:
                continue

        trace = task.get("traceability") or {}
        task_id = task.get("id")
        if not task_id:
            continue

        rows.append(
            {
                "id": task_id,
                "program_source": "v2",
                "v2_program_id": program_v2.get("id"),
                "v2_task_id": task_id,
                "equipment_id": equipment_id,
                "equipment_name": program_v2.get("equipment_name", ""),
                "equipment_tag": program_v2.get("equipment_tag"),
                "equipment_type_id": equipment_type_id,
                "equipment_type_name": program_v2.get("equipment_type_name", ""),
                "task_name": task.get("task_title") or task.get("name") or "Maintenance Task",
                "task_description": task.get("task_description"),
                "task_type": task_type,
                "frequency": frequency,
                "frequency_days": freq_days,
                "criticality": equip_criticality,
                "estimated_duration_hours": float(
                    task.get("estimated_duration_hours") or 1.0
                ),
                "next_due_date": task.get("next_due_date"),
                "strategy_id": trace_strategy_id,
                "strategy_version": program_v2.get("source_strategy_version")
                or program_v2.get("version")
                or "1.0",
                "failure_mode_id": trace.get("failure_mode_id"),
                "failure_mode_name": trace.get("failure_mode_name"),
                "task_source": source,
                "discipline": task.get("discipline"),
                "pm_import_task_id": trace.get("pm_import_task_id"),
                "is_active": True,
            }
        )
    return rows


async def get_active_strategy_type_ids() -> Set[str]:
    ids = set()
    async for doc in db.equipment_type_strategies.find({}, {"equipment_type_id": 1, "_id": 0}):
        etid = doc.get("equipment_type_id")
        if etid:
            ids.add(etid)
    return ids


async def load_schedulable_programs(
    *,
    equipment_type_id: Optional[str] = None,
    equipment_ids: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Primary: v2 nested tasks. Fallback: legacy flat maintenance_programs for
    equipment that has no v2 program document yet.
    """
    active_strategy_types = await get_active_strategy_type_ids()

    v2_query: Dict[str, Any] = {}
    if equipment_type_id:
        v2_query["equipment_type_id"] = equipment_type_id
    if equipment_ids:
        v2_query["equipment_id"] = {"$in": equipment_ids}

    v2_docs = await db.maintenance_programs_v2.find(v2_query).to_list(5000)
    v2_rows: List[Dict[str, Any]] = []
    for doc in v2_docs:
        v2_rows.extend(expand_v2_program_to_scheduler_rows(doc, active_strategy_types))

    covered_equipment = {row["equipment_id"] for row in v2_rows if row.get("equipment_id")}

    legacy_query: Dict[str, Any] = {"is_active": True}
    if equipment_type_id:
        legacy_query["equipment_type_id"] = equipment_type_id
    if equipment_ids:
        missing = [eid for eid in equipment_ids if eid not in covered_equipment]
        if not missing:
            return v2_rows
        legacy_query["equipment_id"] = {"$in": missing}
    elif covered_equipment:
        legacy_query["equipment_id"] = {"$nin": list(covered_equipment)}

    legacy_programs = await db.maintenance_programs.find(legacy_query).to_list(5000)
    schedulable_legacy = [
        p
        for p in legacy_programs
        if program_is_schedulable(p, active_strategy_types)
    ]
    return v2_rows + schedulable_legacy
