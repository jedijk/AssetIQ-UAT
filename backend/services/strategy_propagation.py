"""Strategy-driven program resync (service layer)."""
from datetime import datetime, timezone
from typing import Dict, List

from database import db
from services.scheduler_config import should_sync_legacy_maintenance_programs
from services.scheduler_helpers import build_task_to_failure_modes, is_strategy_task_active, program_is_strategy_backed

async def resync_programs_with_strategy(equipment_type_id: str):
    """
    Re-derive ``is_active`` on v2 nested tasks (and legacy programs when dual-write
    is enabled), then cancel open scheduled_tasks for newly inactive program ids.

    Uses the same active-task rules as the strategy UI and program generation.
    """
    from models.maintenance_program import TaskSource
    from services.scheduler_helpers import build_task_to_failure_modes, is_strategy_task_active

    strategy = await db.equipment_type_strategies.find_one(
        {"equipment_type_id": equipment_type_id}
    )
    if not strategy:
        return {"programs_activated": 0, "programs_deactivated": 0, "scheduled_tasks_cancelled": 0}

    tasks = strategy.get("task_templates", []) or []
    task_to_fms = build_task_to_failure_modes(strategy)
    if (strategy.get("status") or "active") == "disabled":
        active_task_ids: set = set()
    else:
        active_task_ids = {
            t.get("id")
            for t in tasks
            if t.get("id") and is_strategy_task_active(t, task_to_fms=task_to_fms)
        }

    now = datetime.now(timezone.utc).isoformat()
    activated = 0
    deactivated = 0
    program_ids_to_cancel_tasks: List[str] = []

    v2_programs = await db.maintenance_programs_v2.find(
        {"equipment_type_id": equipment_type_id}
    ).to_list(5000)

    for prog in v2_programs:
        for task in prog.get("tasks") or []:
            source = (task.get("task_source") or "").lower()
            if source != TaskSource.STRATEGY_GENERATED.value:
                continue
            trace = task.get("traceability") or {}
            template_id = trace.get("task_template_id")
            new_active = bool(template_id and template_id in active_task_ids)
            current_active = task.get("is_active", True)
            if current_active == new_active:
                continue

            task_id = task.get("id")
            if not task_id:
                continue

            await db.maintenance_programs_v2.update_one(
                {"_id": prog["_id"]},
                {
                    "$set": {
                        "tasks.$[t].is_active": new_active,
                        "updated_at": now,
                    }
                },
                array_filters=[{"t.id": task_id}],
            )
            if new_active:
                activated += 1
            else:
                deactivated += 1
                program_ids_to_cancel_tasks.append(task_id)

    if should_sync_legacy_maintenance_programs():
        programs = await db.maintenance_programs.find(
            {"equipment_type_id": equipment_type_id}
        ).to_list(5000)

        programs_to_activate = []
        programs_to_deactivate = []

        for prog in programs:
            if not program_is_strategy_backed(prog):
                continue

            tid = prog.get("task_template_id")
            new_active = bool(tid and tid in active_task_ids)

            if prog.get("is_active") != new_active:
                if new_active:
                    programs_to_activate.append(prog["_id"])
                else:
                    programs_to_deactivate.append(prog["_id"])
                    if prog.get("id"):
                        program_ids_to_cancel_tasks.append(prog["id"])

        if programs_to_activate:
            result = await db.maintenance_programs.update_many(
                {"_id": {"$in": programs_to_activate}},
                {"$set": {"is_active": True, "updated_at": now}},
            )
            activated += result.modified_count

        if programs_to_deactivate:
            result = await db.maintenance_programs.update_many(
                {"_id": {"$in": programs_to_deactivate}},
                {"$set": {"is_active": False, "updated_at": now}},
            )
            deactivated += result.modified_count

    scheduled_cancelled = 0
    unique_cancel_ids = list(dict.fromkeys(program_ids_to_cancel_tasks))
    if unique_cancel_ids:
        result = await db.scheduled_tasks.update_many(
            {
                "maintenance_program_id": {"$in": unique_cancel_ids},
                "status": {"$nin": ["completed", "cancelled"]},
            },
            {"$set": {
                "status": "cancelled",
                "notes": "Auto-cancelled: source task or failure mode disabled",
                "updated_at": now,
            }},
        )
        scheduled_cancelled = result.modified_count

    return {
        "programs_activated": activated,
        "programs_deactivated": deactivated,
        "scheduled_tasks_cancelled": scheduled_cancelled,
    }




# Route-layer alias
_resync_programs_with_strategy = resync_programs_with_strategy
