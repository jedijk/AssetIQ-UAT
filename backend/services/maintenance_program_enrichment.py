"""Program response enrichment — strategy tasks and criticality context."""
from typing import Any, Dict, List, Optional, Tuple

from database import db
from models.maintenance_program import TaskSource
from services.criticality_score import resolve_equipment_criticality_score
from services.scheduler_helpers import normalize_program_criticality


def existing_strategy_template_ids(program_tasks: List[Dict[str, Any]]) -> set:
    template_ids = set()
    for task in program_tasks:
        if task.get("task_source") != TaskSource.STRATEGY_GENERATED.value:
            continue
        tr = task.get("traceability") or {}
        template_id = tr.get("task_template_id")
        if template_id:
            template_ids.add(template_id)
    return template_ids


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


async def enrich_program_response_with_strategy_tasks(
    program: Optional[Dict[str, Any]],
    equipment_id: str,
    user_id: Optional[str] = None,
) -> Tuple[Optional[Dict[str, Any]], int]:
    """
    Merge strategy-generated tasks into the program task list for hierarchy display.
    Returns (program_dict, strategy_tasks_added_count). Does not persist to the database.
    """
    from services.maintenance_program_service import MaintenanceProgramService

    if not program:
        return None, 0

    equipment_type_id = program.get("equipment_type_id")
    equipment = None
    if not equipment_type_id:
        equipment = await db.equipment_nodes.find_one(
            {"id": equipment_id},
            {
                "_id": 0,
                "equipment_type_id": 1,
                "equipment_type_name": 1,
                "criticality": 1,
            },
        )
        equipment_type_id = (equipment or {}).get("equipment_type_id")
        if equipment_type_id:
            program["equipment_type_id"] = equipment_type_id
            if (equipment or {}).get("equipment_type_name"):
                program["equipment_type_name"] = equipment["equipment_type_name"]

    if not equipment_type_id:
        return program, 0

    if equipment is None:
        equipment = await db.equipment_nodes.find_one(
            {"id": equipment_id},
            {"_id": 0, "criticality": 1},
        )

    equipment_crit = (equipment or {}).get("criticality")
    equipment_level = (program.get("criticality_level") or "low").lower()
    if equipment_crit and isinstance(equipment_crit, dict):
        equipment_level = (equipment_crit.get("level") or equipment_level or "low").lower()
    elif equipment_crit and isinstance(equipment_crit, str):
        equipment_level = equipment_crit.lower()
    strategy_band = normalize_program_criticality(equipment_crit or equipment_level)

    existing_template_ids = existing_strategy_template_ids(program.get("tasks") or [])
    new_strategy_tasks = await MaintenanceProgramService.generate_tasks_from_strategy(
        equipment_type_id=equipment_type_id,
        equipment_id=equipment_id,
        criticality_level=strategy_band,
        user_id=user_id,
    )

    added = 0
    merged_tasks = list(program.get("tasks") or [])
    for task in new_strategy_tasks:
        template_id = task.traceability.task_template_id
        if not template_id or template_id in existing_template_ids:
            continue
        task_dict = task.model_dump() if hasattr(task, "model_dump") else task
        merged_tasks.append(task_dict)
        existing_template_ids.add(template_id)
        added += 1

    if added:
        program["tasks"] = merged_tasks
        recalculate_program_task_stats(program)

    return program, added


async def enrich_criticality_context(
    program: Dict[str, Any],
    equipment: Optional[Dict[str, Any]] = None,
    strategy: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Attach equipment criticality, strategy frequency band, and strategy versions for API/UI."""
    crit = (equipment or {}).get("criticality")
    equipment_level = (program.get("criticality_level") or "low").lower()
    score = program.get("criticality_score")

    if crit and isinstance(crit, dict):
        equipment_level = (crit.get("level") or equipment_level or "low").lower()
        score = resolve_equipment_criticality_score(crit)
        if score is None:
            score = program.get("criticality_score")
            if score is not None and float(score) > 100:
                score = min(100, round(float(score) / 3.5))
    elif crit and isinstance(crit, str):
        equipment_level = crit.lower()

    strategy_band = normalize_program_criticality(crit or equipment_level)
    latest_version = strategy.get("version", "1.0") if strategy else None
    applied_version = program.get("source_strategy_version")

    equipment_id = program.get("equipment_id")
    if equipment_id and crit and isinstance(crit, dict) and score is not None:
        stored = crit.get("risk_score")
        try:
            needs_repair = stored is None or int(round(float(stored))) != int(score)
        except (TypeError, ValueError):
            needs_repair = True
        if needs_repair:
            await db.equipment_nodes.update_one(
                {"id": equipment_id},
                {"$set": {"criticality.risk_score": score}},
            )

    program["equipment_criticality_level"] = equipment_level
    program["strategy_criticality_band"] = strategy_band
    program["criticality_score"] = score
    program["latest_strategy_version"] = latest_version
    program["applied_strategy_version"] = applied_version
    return program
