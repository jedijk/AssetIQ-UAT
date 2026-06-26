"""
Load schedulable maintenance programs from canonical v2 documents,
with legacy ``maintenance_programs`` fallback for equipment not yet on v2.
"""
from typing import Any, Dict, List, Optional, Set

from database import db
from models.maintenance_program import TaskSource
from services.maintenance_tenant_scope import maintenance_scoped_job
from services.scheduler_config import should_read_legacy_maintenance_programs
from services.scheduler_helpers import (
    coerce_optional_str_id,
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
                "failure_mode_id": coerce_optional_str_id(trace.get("failure_mode_id")),
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
    async for doc in db.equipment_type_strategies.find(
        maintenance_scoped_job({"$nor": [{"status": "disabled"}]}),
        {"equipment_type_id": 1, "_id": 0},
    ):
        etid = doc.get("equipment_type_id")
        if etid:
            ids.add(etid)
    return ids


async def load_pm_import_scheduler_rows(
    *,
    equipment_type_id: Optional[str] = None,
    equipment_ids: Optional[List[str]] = None,
    covered_pm_refs: Optional[Set[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Build scheduler rows from Custom PM Import sessions.

    These tasks are merged into Equipment Manager responses but are not stored on
    maintenance_programs_v2 until a strategy is applied — the schedule view must
    load them directly from pm_import_sessions.
    """
    from services.maintenance_program_pm_import import pm_import_task_to_program_dict
    from services.maintenance_program_service import MaintenanceProgramService
    from services.pm_import_constants import (
        is_pm_import_incorporated_into_strategy,
        is_pm_import_review_accepted,
    )

    covered_pm_refs = covered_pm_refs or set()
    equipment_filter = set(equipment_ids) if equipment_ids else None
    rows: List[Dict[str, Any]] = []
    equipment_cache: Dict[str, Optional[Dict[str, Any]]] = {}

    async def _equipment(equipment_id: str) -> Optional[Dict[str, Any]]:
        if equipment_id not in equipment_cache:
            equipment_cache[equipment_id] = await db.equipment_nodes.find_one(
                {"id": equipment_id},
                {
                    "_id": 0,
                    "id": 1,
                    "name": 1,
                    "tag": 1,
                    "criticality": 1,
                    "equipment_type_id": 1,
                    "equipment_type_name": 1,
                },
            )
        return equipment_cache[equipment_id]

    async for session in db.pm_import_sessions.find(
        {},
        {"_id": 0, "session_id": 1, "file_name": 1, "tasks_extracted": 1},
    ):
        for pm_task in session.get("tasks_extracted") or []:
            if not is_pm_import_review_accepted(pm_task):
                continue
            if is_pm_import_incorporated_into_strategy(pm_task):
                continue
            em = pm_task.get("equipment_match") or {}
            equipment_id = em.get("equipment_id")
            if not equipment_id:
                continue
            if equipment_filter is not None and equipment_id not in equipment_filter:
                continue

            program_task = pm_import_task_to_program_dict(pm_task, session)
            if not MaintenanceProgramService._is_scheduleable_imported_pm_task(program_task):
                continue

            trace = program_task.get("traceability") or {}
            pm_ref = trace.get("pm_import_task_id")
            if pm_ref and pm_ref in covered_pm_refs:
                continue

            equipment = await _equipment(equipment_id)
            if not equipment:
                continue
            eq_type_id = equipment.get("equipment_type_id") or ""
            if equipment_type_id and eq_type_id != equipment_type_id:
                continue

            task_id = program_task.get("id")
            if not task_id:
                continue

            frequency, freq_days = _frequency_for_scheduler(program_task)
            if not frequency or freq_days <= 0:
                continue

            task_type = _task_type_for_scheduler(program_task)
            if task_type in ("reactive", "corrective"):
                continue

            rows.append(
                {
                    "id": task_id,
                    "program_source": "pm_import",
                    "v2_program_id": None,
                    "v2_task_id": task_id,
                    "equipment_id": equipment_id,
                    "equipment_name": equipment.get("name") or em.get("name") or "",
                    "equipment_tag": equipment.get("tag") or em.get("tag"),
                    "equipment_type_id": eq_type_id,
                    "equipment_type_name": equipment.get("equipment_type_name") or "",
                    "task_name": program_task.get("task_title") or "Imported PM Task",
                    "task_description": program_task.get("task_description"),
                    "task_type": task_type,
                    "frequency": frequency,
                    "frequency_days": freq_days,
                    "criticality": normalize_program_criticality(equipment.get("criticality")),
                    "estimated_duration_hours": float(
                        program_task.get("estimated_duration_hours") or 1.0
                    ),
                    "next_due_date": None,
                    "strategy_id": eq_type_id or "pm_import",
                    "strategy_version": "pm_import",
                    "failure_mode_id": trace.get("failure_mode_id"),
                    "failure_mode_name": trace.get("failure_mode_name"),
                    "task_source": TaskSource.CUSTOMER_IMPORTED.value,
                    "discipline": program_task.get("discipline"),
                    "pm_import_task_id": pm_ref,
                    "is_active": True,
                }
            )
            if pm_ref:
                covered_pm_refs.add(pm_ref)

    return rows


async def load_schedulable_programs(
    *,
    equipment_type_id: Optional[str] = None,
    equipment_ids: Optional[List[str]] = None,
    user: Optional[dict] = None,
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

    from services.maintenance_tenant_scope import maintenance_scoped

    scoped_v2 = maintenance_scoped(user, v2_query) if user else maintenance_scoped_job(v2_query)
    v2_docs = await db.maintenance_programs_v2.find(scoped_v2).to_list(5000)
    v2_rows: List[Dict[str, Any]] = []
    covered_pm_refs: Set[str] = set()
    for doc in v2_docs:
        doc_rows = expand_v2_program_to_scheduler_rows(doc, active_strategy_types)
        for row in doc_rows:
            pm_ref = row.get("pm_import_task_id")
            if pm_ref:
                covered_pm_refs.add(pm_ref)
        v2_rows.extend(doc_rows)

    pm_import_rows = await load_pm_import_scheduler_rows(
        equipment_type_id=equipment_type_id,
        equipment_ids=equipment_ids,
        covered_pm_refs=covered_pm_refs,
    )
    v2_rows.extend(pm_import_rows)

    if not should_read_legacy_maintenance_programs():
        return v2_rows

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

    scoped_legacy = maintenance_scoped(user, legacy_query) if user else maintenance_scoped_job(legacy_query)
    legacy_programs = await db.maintenance_programs.find(scoped_legacy).to_list(5000)
    schedulable_legacy = [
        p
        for p in legacy_programs
        if program_is_schedulable(p, active_strategy_types)
    ]
    return v2_rows + schedulable_legacy
