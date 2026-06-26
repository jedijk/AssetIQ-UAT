"""Sync legacy maintenance programs from equipment-type strategy."""
from datetime import datetime
from typing import Any, Dict, List, Set, Tuple

from pymongo import InsertOne, UpdateOne

from database import db
from models.maintenance_program import TaskSource
from models.maintenance_scheduler import CriticalityLevel, EquipmentMaintenanceProgram
from services.maintenance_scheduler_shared import (
    OPEN_TASK_STATUSES,
    _cancel_open_scheduled_for_program_ids,
)
from services.maintenance_tenant_scope import maintenance_scoped_tenant, tenant_id_from_record
from services.scheduler_config import should_sync_legacy_maintenance_programs
from services.scheduler_helpers import (
    build_task_to_failure_modes,
    coerce_optional_str_id,
    frequency_to_days,
    is_strategy_task_active,
    normalize_program_criticality,
    program_is_strategy_backed,
)

async def sync_strategy_programs_for_equipment(
    equipment: Dict[str, Any],
    strategy: Dict[str, Any],
) -> Tuple[int, int, int]:
    """Upsert legacy maintenance_programs from active strategy task templates for one equipment."""
    if not should_sync_legacy_maintenance_programs():
        return 0, 0, 0

    equipment_type_id = strategy.get("equipment_type_id") or equipment.get("equipment_type_id")
    equipment_id = equipment.get("id")
    if not equipment_id or not equipment_type_id:
        return 0, 0, 0

    task_templates = strategy.get("task_templates") or []
    task_to_fms = build_task_to_failure_modes(strategy)

    created = 0
    updated = 0
    deactivated = 0
    active_task_ids: Set[str] = set()
    today = datetime.utcnow().date().isoformat()
    equip_criticality = normalize_program_criticality(equipment.get("criticality"))
    strategy_version = strategy.get("version", "1.0")
    tenant_id = tenant_id_from_record(equipment) or tenant_id_from_record(strategy)

    existing_by_template: Dict[str, Dict[str, Any]] = {}
    async for doc in db.maintenance_programs.find(
        maintenance_scoped_tenant(tenant_id, {
            "equipment_id": equipment_id,
            "equipment_type_id": equipment_type_id,
        }),
    ):
        template_id = doc.get("task_template_id")
        if template_id:
            existing_by_template[template_id] = doc

    bulk_ops: List[Any] = []
    now_iso = datetime.utcnow().isoformat()

    for task in task_templates:
        if not is_strategy_task_active(task, task_to_fms=task_to_fms):
            continue

        task_id = task.get("id")
        if not task_id:
            continue
        active_task_ids.add(task_id)

        task_type = task.get("task_type", "preventive")
        freq_matrix = task.get("frequency_matrix") or {}
        frequency = freq_matrix.get(equip_criticality, "monthly")
        linked_fms = task_to_fms.get(task_id, [])
        enabled_fm = next(
            (fm for fm in linked_fms if fm.get("enabled") is not False),
            linked_fms[0] if linked_fms else None,
        )
        fm_id = coerce_optional_str_id(
            enabled_fm.get("failure_mode_id") if enabled_fm else None
        )
        fm_name = enabled_fm.get("failure_mode_name") if enabled_fm else None

        common_fields = {
            "equipment_name": equipment.get("name"),
            "equipment_tag": equipment.get("tag"),
            "equipment_type_id": equipment_type_id,
            "equipment_type_name": strategy.get("equipment_type_name", ""),
            "task_name": task.get("name") or "Maintenance Task",
            "task_description": task.get("description"),
            "task_type": task_type,
            "frequency": frequency,
            "frequency_days": frequency_to_days(frequency),
            "criticality": equip_criticality,
            "estimated_duration_hours": task.get("duration_hours", 1.0),
            "strategy_id": equipment_type_id,
            "strategy_version": strategy_version,
            "failure_mode_id": fm_id,
            "failure_mode_name": fm_name,
            "discipline": task.get("discipline"),
            "skills_required": task.get("skills_required") or [],
            "requires_downtime": bool(task.get("requires_downtime")),
            "task_source": TaskSource.STRATEGY_GENERATED.value,
            "is_active": True,
            "updated_at": now_iso,
        }

        existing = existing_by_template.get(task_id)
        if existing:
            bulk_ops.append(UpdateOne({"_id": existing["_id"]}, {"$set": common_fields}))
            updated += 1
        else:
            program = EquipmentMaintenanceProgram(
                equipment_id=equipment_id,
                equipment_name=equipment.get("name", ""),
                equipment_tag=equipment.get("tag"),
                equipment_type_id=equipment_type_id,
                equipment_type_name=strategy.get("equipment_type_name", ""),
                task_template_id=task_id,
                task_name=task.get("name") or "Maintenance Task",
                task_description=task.get("description"),
                task_type=task_type,
                frequency=frequency,
                frequency_days=frequency_to_days(frequency),
                criticality=CriticalityLevel(equip_criticality),
                estimated_duration_hours=task.get("duration_hours", 1.0),
                next_due_date=today,
                strategy_id=equipment_type_id,
                strategy_version=strategy_version,
                failure_mode_id=fm_id,
                failure_mode_name=fm_name,
                discipline=task.get("discipline"),
                skills_required=task.get("skills_required") or [],
                requires_downtime=bool(task.get("requires_downtime")),
            )
            doc = program.model_dump()
            doc["task_source"] = TaskSource.STRATEGY_GENERATED.value
            bulk_ops.append(InsertOne(doc))
            created += 1

    if bulk_ops:
        await db.maintenance_programs.bulk_write(bulk_ops, ordered=False)

    stale_program_ids: List[str] = []
    async for prog in db.maintenance_programs.find(
        maintenance_scoped_tenant(tenant_id, {
            "equipment_id": equipment_id,
            "equipment_type_id": equipment_type_id,
        }),
        {"id": 1, "task_template_id": 1, "is_active": 1, "_id": 1},
    ):
        if not program_is_strategy_backed(prog):
            continue
        template_id = prog.get("task_template_id")
        if not template_id or template_id in active_task_ids:
            continue
        if not prog.get("is_active", True):
            continue
        stale_program_ids.append(prog["id"])
        deactivated += 1

    if stale_program_ids:
        await db.maintenance_programs.update_many(
            {"id": {"$in": stale_program_ids}},
            {"$set": {"is_active": False, "updated_at": now_iso}},
        )
        await _cancel_open_scheduled_for_program_ids(stale_program_ids)

    return created, updated, deactivated
