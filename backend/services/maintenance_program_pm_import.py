"""Custom PM Import helpers — extracted from maintenance_program_service."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from database import db
from services.maintenance_tenant_scope import maintenance_scoped_job
from services.pm_import_constants import (
    is_pm_import_incorporated_into_strategy,
    normalize_pm_import_display_status,
)
from models.maintenance_program import (
    MaintenanceProgramTask,
    ProgramStatus,
    TaskCategory,
    TaskFrequency,
    TaskSource,
    TaskTraceability,
    frequency_to_days,
)

TASK_TYPE_TO_CATEGORY = {
    "preventive": TaskCategory.PREVENTIVE_MAINTENANCE,
    "predictive": TaskCategory.PREDICTIVE,
    "condition_based": TaskCategory.CONDITION_MONITORING,
    "inspection": TaskCategory.INSPECTION,
    "lubrication": TaskCategory.LUBRICATION,
    "calibration": TaskCategory.CALIBRATION,
    "cleaning": TaskCategory.CLEANING,
    "functional_test": TaskCategory.FUNCTIONAL_TEST,
    "safety": TaskCategory.SAFETY_VERIFICATION,
    "regulatory": TaskCategory.REGULATORY_COMPLIANCE,
    "corrective": TaskCategory.CORRECTIVE,
    "reactive": TaskCategory.CORRECTIVE,
    "pm": TaskCategory.PREVENTIVE_MAINTENANCE,
    "pdm": TaskCategory.PREDICTIVE,
    "cbm": TaskCategory.CONDITION_MONITORING,
    "cm": TaskCategory.CORRECTIVE,
}

PM_FREQUENCY_ALIASES = {
    "biweekly": "bi_weekly",
    "semi-annual": "semi_annual",
    "semi_annual": "semi_annual",
    "every_2_years": "biennial",
    "every_3_years": "biennial",
    "condition_based": "on_condition",
    "one_time": "not_required",
    "one-time": "not_required",
}


def normalize_pm_import_frequency(freq: Optional[str]) -> TaskFrequency:
    if not freq:
        return TaskFrequency.MONTHLY
    key = str(freq).strip().lower().replace(" ", "_").replace("-", "_")
    key = PM_FREQUENCY_ALIASES.get(key, key)
    try:
        return TaskFrequency(key)
    except ValueError:
        return TaskFrequency.MONTHLY


def pm_import_matches_equipment(
    task: Dict[str, Any],
    equipment_id: str,
    equipment_tag: Optional[str],
) -> bool:
    em = task.get("equipment_match") or {}
    if em.get("equipment_id") == equipment_id:
        return True
    if not equipment_tag:
        return False
    tag = (task.get("equipment_tag") or task.get("asset") or "").strip()
    em_tag = (em.get("tag") or "").strip()
    return tag.lower() == equipment_tag.strip().lower() or (
        em_tag and em_tag.lower() == equipment_tag.strip().lower()
    )


def existing_pm_import_refs(program_tasks: List[Dict[str, Any]]) -> set:
    refs = set()
    for task in program_tasks:
        tr = task.get("traceability") or {}
        pm_ref = tr.get("pm_import_task_id")
        if pm_ref:
            refs.add(pm_ref)
    return refs


def parse_pm_import_ref(
    *,
    task: Optional[Dict[str, Any]] = None,
    task_id: Optional[str] = None,
) -> Optional[Tuple[str, str, str]]:
    """Return (session_id, task_id, pm_ref) when task is PM-import backed."""
    pm_ref: Optional[str] = None
    if task:
        trace = task.get("traceability") or {}
        pm_ref = trace.get("pm_import_task_id")
        raw_id = str(task.get("id") or "")
        if not pm_ref and raw_id.startswith("pm-import:"):
            pm_ref = raw_id[len("pm-import:") :]
        source = (task.get("task_source") or "").lower()
        if not pm_ref and source == TaskSource.CUSTOMER_IMPORTED.value:
            return None
    if not pm_ref and task_id:
        if str(task_id).startswith("pm-import:"):
            pm_ref = str(task_id)[len("pm-import:") :]
    if not pm_ref or ":" not in pm_ref:
        return None
    session_id, _, extracted_task_id = pm_ref.partition(":")
    if not session_id or not extracted_task_id:
        return None
    return session_id, extracted_task_id, pm_ref


def is_incorporated_pm_program_task(task: Optional[Dict[str, Any]] = None) -> bool:
    """Whether a program task row represents incorporated (merged/applied) PM import."""
    if not task:
        return False
    display = task.get("pm_import_display_status")
    if display in ("merged", "applied"):
        return True
    if task.get("pm_import_incorporated"):
        return True
    return False


def is_pm_import_program_task(task: Optional[Dict[str, Any]] = None, task_id: Optional[str] = None) -> bool:
    if parse_pm_import_ref(task=task, task_id=task_id):
        return True
    if task:
        if (task.get("task_source") or "").lower() == TaskSource.CUSTOMER_IMPORTED.value:
            return bool((task.get("traceability") or {}).get("pm_import_task_id"))
        if str(task.get("id") or "").startswith("pm-import:"):
            return True
    return bool(task_id and str(task_id).startswith("pm-import:"))


async def set_pm_import_session_task_active(
    session_id: str,
    task_id: str,
    is_active: bool,
) -> bool:
    """Persist enable/disable on the canonical PM import session row."""
    from services.pm_import_service import PMImportService

    result = await PMImportService(db).update_task(
        session_id,
        task_id,
        {"is_active": is_active},
    )
    return result is not None


def pm_import_task_to_program_dict(
    pm_task: Dict[str, Any],
    session: Dict[str, Any],
) -> Dict[str, Any]:
    session_id = session.get("session_id", "")
    task_id = pm_task.get("task_id") or pm_task.get("id") or str(uuid.uuid4())
    pm_ref = f"{session_id}:{task_id}"
    title = (
        pm_task.get("task_description")
        or pm_task.get("original_task")
        or pm_task.get("task_name")
        or "Imported PM Task"
    )
    raw_type = (pm_task.get("task_type") or pm_task.get("action_type") or "PM")
    task_type = str(raw_type).lower().strip()
    category = TASK_TYPE_TO_CATEGORY.get(task_type, TaskCategory.PREVENTIVE_MAINTENANCE)
    from models.disciplines import normalize_discipline_or_default

    discipline = normalize_discipline_or_default(pm_task.get("discipline"))
    frequency = normalize_pm_import_frequency(pm_task.get("frequency"))
    review_status = pm_task.get("review_status") or "pending"
    estimated_hours = pm_task.get("estimated_hours")
    if estimated_hours is None:
        estimated_hours = pm_task.get("estimated_duration") or 1.0

    program_task = MaintenanceProgramTask(
        id=f"pm-import:{pm_ref}",
        task_title=title[:500],
        task_description=pm_task.get("equipment_description") or pm_task.get("component"),
        frequency=frequency,
        frequency_days=frequency_to_days(frequency.value),
        estimated_duration_hours=float(estimated_hours) if estimated_hours else 1.0,
        task_category=category,
        task_source=TaskSource.CUSTOMER_IMPORTED,
        discipline=discipline,
        traceability=TaskTraceability(
            import_session_id=session_id,
            import_source_file=session.get("file_name"),
            import_row_reference=str(pm_task.get("row_index") or task_id),
            failure_mode_id=pm_task.get("matched_failure_mode_id"),
            failure_mode_name=pm_task.get("matched_failure_mode_name"),
        ),
        is_active=bool(pm_task.get("is_active", True)) and review_status != "rejected",
        is_mandatory=True,
    ).model_dump()
    program_task["traceability"]["pm_import_task_id"] = pm_ref
    program_task["is_pm_import_pending"] = True
    program_task["pm_import_review_status"] = review_status
    program_task["task_type"] = task_type
    program_task["pm_import_task_type"] = str(raw_type).upper()
    program_task["pm_import_display_status"] = normalize_pm_import_display_status(pm_task)
    return program_task


PM_IMPORT_DISABLE_CANCEL_NOTE = "Auto-cancelled: PM import task disabled"
PM_IMPORT_INCORPORATED_CANCEL_NOTE = "Auto-cancelled: PM import incorporated into strategy"


async def reschedule_pm_import_task_occurrences(
    equipment_id: str,
    pm_ref: str,
) -> Dict[str, int]:
    """Restore or create schedule rows for one PM import task (no full equipment refresh)."""
    restore_result = await db.scheduled_tasks.update_many(
        {
            "pm_import_task_id": pm_ref,
            "status": "cancelled",
            "notes": PM_IMPORT_DISABLE_CANCEL_NOTE,
        },
        {
            "$set": {
                "status": "scheduled",
                "notes": "",
                "updated_at": datetime.utcnow().isoformat(),
            }
        },
    )
    scheduled_restored = restore_result.modified_count

    scheduled_created = 0
    if scheduled_restored == 0:
        from services.maintenance_scheduling import schedule_program
        from services.scheduler_program_source import load_schedulable_programs

        programs = await load_schedulable_programs(equipment_ids=[equipment_id])
        for program in programs:
            if program.get("pm_import_task_id") != pm_ref:
                continue
            scheduled_created += len(await schedule_program(program))

    return {
        "scheduled_tasks_restored": scheduled_restored,
        "scheduled_tasks_created": scheduled_created,
    }


async def propagate_pm_import_task_active_state(
    session_id: str,
    task_id: str,
    is_active: bool,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Mirror PM Import task enable/disable to programs and the maintenance schedule."""
    pm_ref = f"{session_id}:{task_id}"
    await set_pm_import_session_task_active(session_id, task_id, is_active)

    session = await db.pm_import_sessions.find_one(
        maintenance_scoped_job({"session_id": session_id}),
        {"_id": 0, "tasks_extracted": 1},
    )
    equipment_id = None
    if session:
        for pm_task in session.get("tasks_extracted") or []:
            if pm_task.get("task_id") == task_id:
                em = pm_task.get("equipment_match") or {}
                equipment_id = em.get("equipment_id")
                break

    programs_updated = 0
    if equipment_id:
        stored = await db.maintenance_programs_v2.find_one(
            maintenance_scoped_job({"equipment_id": equipment_id}),
            {"_id": 0, "tasks": 1},
        )
        if stored:
            tasks = list(stored.get("tasks") or [])
            changed = False
            for i, task in enumerate(tasks):
                trace = task.get("traceability") or {}
                if (
                    trace.get("pm_import_task_id") == pm_ref
                    or task.get("id") == f"pm-import:{pm_ref}"
                ):
                    if task.get("is_active", True) != is_active:
                        tasks[i] = {**task, "is_active": is_active}
                        changed = True
            if changed:
                stored["tasks"] = tasks
                recalculate_program_task_stats(stored)
                await db.maintenance_programs_v2.update_one(
                    {"equipment_id": equipment_id},
                    {
                        "$set": {
                            "tasks": tasks,
                            "total_tasks": stored.get("total_tasks", len(tasks)),
                            "active_tasks": stored.get("active_tasks", 0),
                            "strategy_tasks": stored.get("strategy_tasks", 0),
                            "imported_tasks": stored.get("imported_tasks", 0),
                            "ai_tasks": stored.get("ai_tasks", 0),
                            "manual_tasks": stored.get("manual_tasks", 0),
                            "updated_at": datetime.utcnow().isoformat(),
                        }
                    },
                )
                programs_updated += 1

        legacy_result = await db.maintenance_programs.update_many(
            {"equipment_id": equipment_id, "pm_import_task_id": pm_ref},
            {
                "$set": {
                    "is_active": is_active,
                    "updated_at": datetime.utcnow().isoformat(),
                }
            },
        )
        programs_updated += legacy_result.modified_count

    scheduled_cancelled = 0
    scheduled_restored = 0
    scheduled_created = 0
    if not is_active:
        cancel_result = await db.scheduled_tasks.update_many(
            {
                "pm_import_task_id": pm_ref,
                "status": {"$nin": ["completed", "cancelled"]},
            },
            {
                "$set": {
                    "status": "cancelled",
                    "notes": PM_IMPORT_DISABLE_CANCEL_NOTE,
                    "updated_at": datetime.utcnow().isoformat(),
                }
            },
        )
        scheduled_cancelled = cancel_result.modified_count
    elif equipment_id:
        reschedule = await reschedule_pm_import_task_occurrences(equipment_id, pm_ref)
        scheduled_restored = reschedule["scheduled_tasks_restored"]
        scheduled_created = reschedule["scheduled_tasks_created"]

    return {
        "pm_import_task_id": pm_ref,
        "equipment_id": equipment_id,
        "is_active": is_active,
        "programs_updated": programs_updated,
        "scheduled_tasks_cancelled": scheduled_cancelled,
        "scheduled_tasks_restored": scheduled_restored,
        "scheduled_tasks_created": scheduled_created,
    }


async def load_incorporated_pm_refs_for_equipment(equipment_id: str) -> set:
    """PM import refs merged/applied into strategy for one equipment node."""
    equipment = await db.equipment_nodes.find_one(
        maintenance_scoped_job({"id": equipment_id}),
        {"_id": 0, "tag": 1},
    )
    if not equipment:
        return set()

    equipment_tag = equipment.get("tag")
    refs: set = set()
    cursor = db.pm_import_sessions.find(
        maintenance_scoped_job({}), {"_id": 0, "session_id": 1, "tasks_extracted": 1}
    )
    async for session in cursor:
        session_id = session.get("session_id")
        if not session_id:
            continue
        for pm_task in session.get("tasks_extracted") or []:
            if not is_pm_import_incorporated_into_strategy(pm_task):
                continue
            if not pm_import_matches_equipment(pm_task, equipment_id, equipment_tag):
                continue
            task_id = pm_task.get("task_id") or pm_task.get("id")
            if task_id:
                refs.add(f"{session_id}:{task_id}")
    return refs


async def purge_standalone_pm_import_program_task(
    equipment_id: str,
    pm_ref: str,
) -> Dict[str, Any]:
    """Remove standalone CUSTOMER_IMPORTED program rows for an incorporated PM import task."""
    removed_from_v2 = 0
    stored = await db.maintenance_programs_v2.find_one(
        maintenance_scoped_job({"equipment_id": equipment_id}),
        {"_id": 0, "tasks": 1},
    )
    if stored:
        tasks = list(stored.get("tasks") or [])
        kept: List[Dict[str, Any]] = []
        for task in tasks:
            trace = task.get("traceability") or {}
            is_pm_row = (
                trace.get("pm_import_task_id") == pm_ref
                or task.get("id") == f"pm-import:{pm_ref}"
            )
            if is_pm_row and (task.get("task_source") or "").lower() == TaskSource.CUSTOMER_IMPORTED.value:
                removed_from_v2 += 1
                continue
            kept.append(task)
        if removed_from_v2:
            stored["tasks"] = kept
            recalculate_program_task_stats(stored)
            await db.maintenance_programs_v2.update_one(
                {"equipment_id": equipment_id},
                {
                    "$set": {
                        "tasks": kept,
                        "total_tasks": stored.get("total_tasks", len(kept)),
                        "active_tasks": stored.get("active_tasks", 0),
                        "strategy_tasks": stored.get("strategy_tasks", 0),
                        "imported_tasks": stored.get("imported_tasks", 0),
                        "ai_tasks": stored.get("ai_tasks", 0),
                        "manual_tasks": stored.get("manual_tasks", 0),
                        "updated_at": datetime.utcnow().isoformat(),
                    }
                },
            )

    legacy_result = await db.maintenance_programs.delete_many(
        {"equipment_id": equipment_id, "pm_import_task_id": pm_ref},
    )

    cancel_result = await db.scheduled_tasks.update_many(
        {
            "equipment_id": equipment_id,
            "pm_import_task_id": pm_ref,
            "status": {"$nin": ["completed", "cancelled"]},
        },
        {
            "$set": {
                "status": "cancelled",
                "notes": PM_IMPORT_INCORPORATED_CANCEL_NOTE,
                "updated_at": datetime.utcnow().isoformat(),
            }
        },
    )

    return {
        "equipment_id": equipment_id,
        "pm_import_task_id": pm_ref,
        "v2_tasks_removed": removed_from_v2,
        "legacy_programs_deleted": legacy_result.deleted_count,
        "scheduled_tasks_cancelled": cancel_result.modified_count,
    }


async def fetch_pm_import_tasks_for_equipment(
    equipment_id: str,
    user_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Collect Custom PM Import tasks mapped to this equipment node."""
    equipment = await db.equipment_nodes.find_one(
        maintenance_scoped_job({"id": equipment_id}),
        {"_id": 0, "tag": 1},
    )
    if not equipment:
        return []

    equipment_tag = equipment.get("tag")
    query: Dict[str, Any] = {}
    if user_id:
        query["created_by"] = user_id

    matched: List[Dict[str, Any]] = []
    cursor = db.pm_import_sessions.find(
        maintenance_scoped_job(query), {"_id": 0}
    )
    async for session in cursor:
        for pm_task in session.get("tasks_extracted") or []:
            if pm_task.get("review_status") == "rejected":
                continue
            if not pm_import_matches_equipment(pm_task, equipment_id, equipment_tag):
                continue
            if is_pm_import_incorporated_into_strategy(pm_task):
                continue
            matched.append(pm_import_task_to_program_dict(pm_task, session))
    return matched


def recalculate_program_task_stats(program: Dict[str, Any]) -> None:
    tasks = program.get("tasks") or []
    program["total_tasks"] = len(tasks)
    program["active_tasks"] = sum(1 for t in tasks if t.get("is_active", True))
    program["strategy_tasks"] = sum(
        1 for t in tasks if t.get("task_source") == TaskSource.STRATEGY_GENERATED.value
    )
    program["imported_tasks"] = sum(
        1 for t in tasks if t.get("task_source") == TaskSource.CUSTOMER_IMPORTED.value
    )
    program["ai_tasks"] = sum(
        1 for t in tasks if t.get("task_source") == TaskSource.AI_GENERATED.value
    )
    program["manual_tasks"] = sum(
        1 for t in tasks if t.get("task_source") == TaskSource.MANUAL.value
    )


async def enrich_program_response_with_pm_import(
    program: Optional[Dict[str, Any]],
    equipment_id: str,
    user_id: Optional[str] = None,
) -> Tuple[Optional[Dict[str, Any]], bool, int]:
    """
    Merge Custom PM Import tasks into the program task list for hierarchy display.
    Returns (program_dict, has_stored_program, pm_tasks_added_count).
    """
    has_stored_program = program is not None
    incorporated_refs = await load_incorporated_pm_refs_for_equipment(equipment_id)
    pm_tasks = await fetch_pm_import_tasks_for_equipment(equipment_id, user_id=user_id)

    if program and incorporated_refs:
        stored_tasks = list(program.get("tasks") or [])
        filtered_tasks: List[Dict[str, Any]] = []
        stripped = 0
        for task in stored_tasks:
            trace = task.get("traceability") or {}
            pm_ref = trace.get("pm_import_task_id")
            if (
                pm_ref
                and pm_ref in incorporated_refs
                and (task.get("task_source") or "").lower() == TaskSource.CUSTOMER_IMPORTED.value
            ):
                stripped += 1
                continue
            filtered_tasks.append(task)
        if stripped:
            program["tasks"] = filtered_tasks
            recalculate_program_task_stats(program)
            if has_stored_program:
                await db.maintenance_programs_v2.update_one(
                    {"equipment_id": equipment_id},
                    {
                        "$set": {
                            "tasks": filtered_tasks,
                            "total_tasks": program.get("total_tasks", len(filtered_tasks)),
                            "active_tasks": program.get("active_tasks", 0),
                            "strategy_tasks": program.get("strategy_tasks", 0),
                            "imported_tasks": program.get("imported_tasks", 0),
                            "ai_tasks": program.get("ai_tasks", 0),
                            "manual_tasks": program.get("manual_tasks", 0),
                            "updated_at": datetime.utcnow().isoformat(),
                        }
                    },
                )

    if not program and not pm_tasks:
        return None, False, 0

    equipment = await db.equipment_nodes.find_one(
        maintenance_scoped_job({"id": equipment_id}),
        {"_id": 0, "name": 1, "tag": 1, "equipment_type_id": 1, "equipment_type_name": 1},
    )

    if not program:
        program = {
            "id": f"ephemeral-{equipment_id}",
            "program_name": f"Maintenance Program - {equipment.get('name', equipment_id) if equipment else equipment_id}",
            "equipment_id": equipment_id,
            "equipment_name": (equipment or {}).get("name", ""),
            "equipment_tag": (equipment or {}).get("tag"),
            "equipment_type_id": (equipment or {}).get("equipment_type_id"),
            "equipment_type_name": (equipment or {}).get("equipment_type_name"),
            "status": ProgramStatus.DRAFT.value,
            "version": "0.0",
            "tasks": [],
        }

    existing_refs = existing_pm_import_refs(program.get("tasks") or [])
    existing_titles = {
        (t.get("task_title") or "").strip().lower()
        for t in (program.get("tasks") or [])
    }
    added = 0
    merged_tasks = list(program.get("tasks") or [])

    for pm_task_dict in pm_tasks:
        tr = pm_task_dict.get("traceability") or {}
        pm_ref = tr.get("pm_import_task_id")
        if pm_ref and pm_ref in existing_refs:
            for i, existing in enumerate(merged_tasks):
                etr = (existing.get("traceability") or {})
                if etr.get("pm_import_task_id") != pm_ref:
                    continue
                merged_tasks[i] = {
                    **existing,
                    "task_category": pm_task_dict.get("task_category", existing.get("task_category")),
                    "discipline": pm_task_dict.get("discipline") or existing.get("discipline"),
                    "task_type": pm_task_dict.get("task_type", existing.get("task_type")),
                    "pm_import_task_type": pm_task_dict.get(
                        "pm_import_task_type", existing.get("pm_import_task_type")
                    ),
                    "pm_import_review_status": pm_task_dict.get(
                        "pm_import_review_status", existing.get("pm_import_review_status")
                    ),
                    "frequency": pm_task_dict.get("frequency", existing.get("frequency")),
                    "frequency_days": pm_task_dict.get(
                        "frequency_days", existing.get("frequency_days")
                    ),
                    "estimated_duration_hours": pm_task_dict.get(
                        "estimated_duration_hours", existing.get("estimated_duration_hours")
                    ),
                    "is_active": existing.get(
                        "is_active", pm_task_dict.get("is_active", True)
                    ),
                }
            continue
        title_key = (pm_task_dict.get("task_title") or "").strip().lower()
        if title_key and title_key in existing_titles:
            continue
        merged_tasks.append(pm_task_dict)
        if pm_ref:
            existing_refs.add(pm_ref)
        if title_key:
            existing_titles.add(title_key)
        added += 1

    program["tasks"] = merged_tasks
    recalculate_program_task_stats(program)
    return program, has_stored_program, added


async def count_active_tasks_for_equipment_program(
    equipment_id: str,
    v2_tasks: Optional[List[Dict[str, Any]]] = None,
    *,
    user_id: Optional[str] = None,
) -> int:
    """Active program tasks: v2 rows plus PM import rows not already represented in v2."""
    tasks = list(v2_tasks or [])
    active_count = sum(1 for task in tasks if task.get("is_active", True))
    v2_pm_refs = {
        (task.get("traceability") or {}).get("pm_import_task_id")
        for task in tasks
        if (task.get("traceability") or {}).get("pm_import_task_id")
    }

    for pm_task in await fetch_pm_import_tasks_for_equipment(equipment_id, user_id=user_id):
        pm_ref = (pm_task.get("traceability") or {}).get("pm_import_task_id")
        if pm_ref and pm_ref in v2_pm_refs:
            continue
        if pm_task.get("is_active", True):
            active_count += 1

    return active_count
