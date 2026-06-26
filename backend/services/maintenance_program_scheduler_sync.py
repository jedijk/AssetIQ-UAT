"""Sync PM-import program tasks into legacy scheduler programs."""
from datetime import datetime
from typing import Any, Dict, List, Optional

from database import db
from models.maintenance_program import TaskSource, frequency_to_days
from services.maintenance_program_pm_import import is_incorporated_pm_program_task
from services.maintenance_tenant_scope import maintenance_scoped_job
from services.scheduler_config import should_sync_legacy_maintenance_programs
from services.scheduler_helpers import normalize_program_criticality


async def _enrich_program_response_with_pm_import(stored_program, equipment_id, user_id=None):
    from services.maintenance_program_service import MaintenanceProgramService
    return await MaintenanceProgramService.enrich_program_response_with_pm_import(
        stored_program, equipment_id, user_id=user_id
    )


def is_scheduleable_imported_pm_task(task: Dict[str, Any]) -> bool:
    """Accepted Custom PM Import tasks that belong to a maintenance program."""
    if is_incorporated_pm_program_task(task):
        return False
    if task.get("task_source") != TaskSource.CUSTOMER_IMPORTED.value:
        return False
    if not task.get("is_active", True):
        return False
    raw_type = (
        task.get("task_type")
        or task.get("pm_import_task_type")
        or "pm"
    )
    task_type = str(raw_type).lower().strip()
    if task_type in ("reactive", "corrective", "cm"):
        return False
    if task.get("is_pm_import_pending"):
        from services.pm_import_constants import is_pm_import_review_accepted

        return is_pm_import_review_accepted(
            {"review_status": task.get("pm_import_review_status") or "pending"}
        )
    return True

def scheduler_task_type_from_program_task(task: Dict[str, Any]) -> str:
    raw_type = (
        task.get("task_type")
        or task.get("pm_import_task_type")
        or "preventive"
    )
    task_type = str(raw_type).lower().strip()
    aliases = {
        "pm": "preventive",
        "pdm": "predictive",
        "cbm": "condition_based",
    }
    return aliases.get(task_type, task_type)

async def sync_imported_program_tasks_to_scheduler(
    equipment_type_id: Optional[str] = None,
    equipment_ids: Optional[List[str]] = None,
    user_id: Optional[str] = None,
    schedule: bool = True,
    horizon_days: int = 365,
) -> Dict[str, Any]:
    """
    Mirror accepted Custom PM Import tasks from maintenance_programs_v2 into
    legacy maintenance_programs so the scheduler can generate occurrences.
    PM Import equipment does not require an equipment-type strategy.
    """
    from models.maintenance_scheduler import (
        EquipmentMaintenanceProgram,
        CriticalityLevel,
    )
    from services.pm_import_constants import is_pm_import_review_accepted

    if equipment_ids:
        target_ids = list(dict.fromkeys(e for e in equipment_ids if e))
    elif equipment_type_id:
        nodes = await db.equipment_nodes.find(
            maintenance_scoped_job({"equipment_type_id": equipment_type_id}),
            {"id": 1, "_id": 0},
        ).to_list(500)
        target_ids = [n["id"] for n in nodes if n.get("id")]
    else:
        v2_docs = await db.maintenance_programs_v2.find(
            maintenance_scoped_job({}),
            {"equipment_id": 1, "_id": 0},
        ).to_list(500)
        target_ids = {
            p["equipment_id"] for p in v2_docs if p.get("equipment_id")
        }
        async for session in db.pm_import_sessions.find(
            maintenance_scoped_job({}),
            {"tasks_extracted": 1, "_id": 0},
        ):
            for pm_task in session.get("tasks_extracted") or []:
                if not is_pm_import_review_accepted(pm_task):
                    continue
                em = pm_task.get("equipment_match") or {}
                if em.get("equipment_id"):
                    target_ids.add(em["equipment_id"])
        target_ids = list(target_ids)

    synced_programs = 0
    scheduled_tasks = 0
    equipment_processed = 0

    for equipment_id in target_ids:
        stored_program = await db.maintenance_programs_v2.find_one(
            maintenance_scoped_job({"equipment_id": equipment_id}),
            {"_id": 0},
        )
        program, _, _ = await _enrich_program_response_with_pm_import(
            stored_program,
            equipment_id,
            user_id=user_id,
        )
        if not program:
            continue

        imported_tasks = [
            t
            for t in (program.get("tasks") or [])
            if is_scheduleable_imported_pm_task(t)
        ]
        if not imported_tasks:
            continue

        equipment = await db.equipment_nodes.find_one(
            maintenance_scoped_job({"id": equipment_id}),
            {
                "_id": 0,
                "name": 1,
                "tag": 1,
                "criticality": 1,
                "equipment_type_id": 1,
                "equipment_type_name": 1,
            },
        )
        if not equipment:
            continue

        equipment_processed += 1
        active_v2_ids: List[str] = [
            t.get("id") for t in imported_tasks if t.get("id")
        ]

        if not should_sync_legacy_maintenance_programs():
            synced_programs += len(active_v2_ids)
            if schedule:
                from services.maintenance_scheduling import (
                    schedule_programs_for_equipment,
                )

                scheduled_tasks += await schedule_programs_for_equipment(
                    [equipment_id], horizon_days
                )
            continue

        equip_criticality = normalize_program_criticality(equipment.get("criticality"))
        today = datetime.utcnow().date().isoformat()
        active_v2_ids = []

        for task in imported_tasks:
            v2_task_id = task.get("id")
            if not v2_task_id:
                continue
            active_v2_ids.append(v2_task_id)

            trace = task.get("traceability") or {}
            pm_import_ref = trace.get("pm_import_task_id")
            freq_raw = task.get("frequency") or "monthly"
            if hasattr(freq_raw, "value"):
                freq_raw = freq_raw.value
            frequency = str(freq_raw).lower().strip()
            freq_days = int(task.get("frequency_days") or frequency_to_days(frequency))
            task_type = scheduler_task_type_from_program_task(task)

            existing = await db.maintenance_programs.find_one(
                maintenance_scoped_job({"equipment_id": equipment_id, "v2_task_id": v2_task_id}),
            )

            update_fields: Dict[str, Any] = {
                "equipment_name": program.get("equipment_name") or equipment.get("name", ""),
                "equipment_tag": program.get("equipment_tag") or equipment.get("tag"),
                "equipment_type_id": program.get("equipment_type_id")
                or equipment.get("equipment_type_id")
                or "",
                "equipment_type_name": program.get("equipment_type_name")
                or equipment.get("equipment_type_name")
                or "",
                "task_template_id": pm_import_ref or v2_task_id,
                "v2_task_id": v2_task_id,
                "pm_import_task_id": pm_import_ref,
                "task_name": task.get("task_title") or "Imported PM Task",
                "task_description": task.get("task_description"),
                "task_type": task_type,
                "task_source": TaskSource.CUSTOMER_IMPORTED.value,
                "frequency": frequency,
                "frequency_days": freq_days,
                "criticality": equip_criticality,
                "estimated_duration_hours": float(
                    task.get("estimated_duration_hours") or 1.0
                ),
                "strategy_id": program.get("source_strategy_id")
                or program.get("equipment_type_id")
                or equipment.get("equipment_type_id")
                or "pm_import",
                "strategy_version": program.get("source_strategy_version") or "pm_import",
                "failure_mode_id": trace.get("failure_mode_id"),
                "failure_mode_name": trace.get("failure_mode_name"),
                "discipline": task.get("discipline"),
                "is_active": bool(task.get("is_active", True)),
                "updated_at": datetime.utcnow().isoformat(),
            }

            if existing:
                await db.maintenance_programs.update_one(
                    {"_id": existing["_id"]},
                    {"$set": update_fields},
                )
                program_doc = {**existing, **update_fields}
            else:
                scheduler_program = EquipmentMaintenanceProgram(
                    equipment_id=equipment_id,
                    equipment_name=update_fields["equipment_name"],
                    equipment_tag=update_fields["equipment_tag"],
                    equipment_type_id=update_fields["equipment_type_id"],
                    equipment_type_name=update_fields["equipment_type_name"],
                    task_template_id=update_fields["task_template_id"],
                    task_name=update_fields["task_name"],
                    task_description=update_fields["task_description"],
                    task_type=task_type,
                    frequency=frequency,
                    frequency_days=freq_days,
                    criticality=CriticalityLevel(equip_criticality),
                    estimated_duration_hours=update_fields["estimated_duration_hours"],
                    next_due_date=today,
                    strategy_id=update_fields["strategy_id"],
                    strategy_version=update_fields["strategy_version"],
                    failure_mode_id=update_fields["failure_mode_id"],
                    failure_mode_name=update_fields["failure_mode_name"],
                    discipline=update_fields["discipline"],
                )
                program_doc = scheduler_program.model_dump()
                program_doc["v2_task_id"] = v2_task_id
                program_doc["pm_import_task_id"] = pm_import_ref
                program_doc["task_source"] = TaskSource.CUSTOMER_IMPORTED.value
                await db.maintenance_programs.insert_one(program_doc)

            synced_programs += 1

            if schedule:
                from services.maintenance_scheduling import schedule_program

                created = await schedule_program(program_doc, horizon_days)
                scheduled_tasks += len(created)

        deactivate_query: Dict[str, Any] = maintenance_scoped_job({
            "equipment_id": equipment_id,
            "task_source": TaskSource.CUSTOMER_IMPORTED.value,
        })
        if active_v2_ids:
            deactivate_query["v2_task_id"] = {"$nin": active_v2_ids}
        await db.maintenance_programs.update_many(
            deactivate_query,
            {"$set": {"is_active": False, "updated_at": datetime.utcnow().isoformat()}},
        )

    return {
        "equipment_processed": equipment_processed,
        "programs_synced": synced_programs,
        "scheduled_tasks_created": scheduled_tasks,
    }
