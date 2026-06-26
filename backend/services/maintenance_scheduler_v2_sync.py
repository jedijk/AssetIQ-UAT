"""Sync v2 program tasks to legacy scheduler programs."""
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from pymongo import InsertOne, UpdateOne

from database import db
from models.maintenance_program import TaskSource
from models.maintenance_scheduler import CriticalityLevel, EquipmentMaintenanceProgram
from services.maintenance_scheduler_shared import (
    OPEN_TASK_STATUSES,
    _cancel_open_scheduled_for_program_ids,
)
from services.maintenance_tenant_scope import tenant_id_from_record
from services.maintenance_scheduler_strategy_sync import sync_strategy_programs_for_equipment
from services.scheduler_config import should_sync_legacy_maintenance_programs
from services.scheduler_helpers import (
    build_task_to_failure_modes,
    frequency_to_days,
    is_strategy_task_active,
    normalize_program_criticality,
)

async def _cancel_open_scheduled_for_v2_task(
    equipment_id: str,
    v2_task_id: str,
    *,
    template_id: Optional[str] = None,
) -> int:
    """Cancel open schedule rows for a v2 program task (works with or without legacy sync)."""
    program_ids: List[str] = [v2_task_id]
    if template_id:
        legacy = await db.maintenance_programs.find_one(
            {"equipment_id": equipment_id, "task_template_id": template_id},
            {"id": 1, "_id": 0},
        )
        legacy_id = legacy.get("id") if legacy else None
        if legacy_id and legacy_id not in program_ids:
            program_ids.append(legacy_id)

    cancelled = await _cancel_open_scheduled_for_program_ids(program_ids)
    extra = await db.scheduled_tasks.update_many(
        {
            "equipment_id": equipment_id,
            "v2_task_id": v2_task_id,
            "status": OPEN_TASK_STATUSES,
        },
        {
            "$set": {
                "status": "cancelled",
                "notes": "Auto-cancelled: maintenance program task deactivated",
                "updated_at": datetime.utcnow().isoformat(),
            }
        },
    )
    return cancelled + extra.modified_count


async def refresh_schedule_after_v2_task_active_toggle(
    equipment_id: str,
    v2_task_id: str,
    *,
    enable: bool,
    template_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Sync the maintenance schedule when a v2 program task is enabled or disabled."""
    from services.maintenance_scheduling import schedule_program, schedule_programs_for_equipment
    from services.scheduler_program_source import load_schedulable_programs

    result: Dict[str, Any] = {
        "equipment_id": equipment_id,
        "v2_task_id": v2_task_id,
        "enable": enable,
    }

    if not enable:
        result["scheduled_tasks_cancelled"] = await _cancel_open_scheduled_for_v2_task(
            equipment_id,
            v2_task_id,
            template_id=template_id,
        )
        if should_sync_legacy_maintenance_programs():
            equipment = await db.equipment_nodes.find_one({"id": equipment_id}, {"_id": 0})
            if equipment:
                strategy = None
                et_id = equipment.get("equipment_type_id")
                if et_id:
                    strategy = await db.equipment_type_strategies.find_one(
                        {"equipment_type_id": et_id},
                        {"_id": 0},
                    )
                result["v2_tasks_synced"] = await sync_v2_program_tasks_to_scheduler(
                    equipment, strategy=strategy
                )
        return result

    if should_sync_legacy_maintenance_programs():
        equipment = await db.equipment_nodes.find_one({"id": equipment_id}, {"_id": 0})
        if equipment:
            strategy = None
            et_id = equipment.get("equipment_type_id")
            if et_id:
                strategy = await db.equipment_type_strategies.find_one(
                    {"equipment_type_id": et_id},
                    {"_id": 0},
                )
            result["v2_tasks_synced"] = await sync_v2_program_tasks_to_scheduler(
                equipment, strategy=strategy
            )

    programs = await load_schedulable_programs(equipment_ids=[equipment_id])
    target_programs = [
        p
        for p in programs
        if p.get("id") == v2_task_id or p.get("v2_task_id") == v2_task_id
    ]
    if target_programs:
        created = 0
        for program in target_programs:
            created += len(await schedule_program(program))
        result["scheduled_tasks_created"] = created
    else:
        result["scheduled_tasks_created"] = await schedule_programs_for_equipment(
            [equipment_id]
        )

    return result


async def sync_v2_program_tasks_to_scheduler(
    equipment: Dict[str, Any],
    strategy: Optional[Dict[str, Any]] = None,
) -> int:
    """Mirror v2 program tasks (manual, overrides, inactive state) to legacy programs."""
    if not should_sync_legacy_maintenance_programs():
        return 0

    equipment_id = equipment.get("id")
    if not equipment_id:
        return 0

    tenant_id = tenant_id_from_record(equipment)

    program_v2 = await db.maintenance_programs_v2.find_one(
        maintenance_scoped_tenant(tenant_id, {"equipment_id": equipment_id}),
        {"_id": 0},
    )
    if not program_v2:
        return 0

    equipment_type_id = (
        program_v2.get("equipment_type_id") or equipment.get("equipment_type_id") or ""
    )
    if strategy is None and equipment_type_id:
        strategy = await db.equipment_type_strategies.find_one(
            maintenance_scoped_tenant(
                tenant_id or tenant_id_from_record(program_v2),
                {"equipment_type_id": equipment_type_id},
            ),
            {"_id": 0},
        )

    synced = 0
    active_v2_ids: Set[str] = set()
    today = datetime.utcnow().date().isoformat()
    equip_criticality = normalize_program_criticality(equipment.get("criticality"))
    task_to_fms = build_task_to_failure_modes(strategy) if strategy else {}
    template_by_id = {
        t.get("id"): t for t in (strategy.get("task_templates") or []) if t.get("id")
    } if strategy else {}

    legacy_by_template: Dict[str, Dict[str, Any]] = {}
    legacy_by_v2: Dict[str, Dict[str, Any]] = {}
    async for legacy in db.maintenance_programs.find(
        maintenance_scoped_tenant(tenant_id, {"equipment_id": equipment_id})
    ):
        tid = legacy.get("task_template_id")
        if tid:
            legacy_by_template[tid] = legacy
        v2id = legacy.get("v2_task_id")
        if v2id:
            legacy_by_v2[v2id] = legacy

    bulk_ops: List[Any] = []
    templates_to_deactivate: Set[str] = set()
    v2_to_deactivate: Set[str] = set()
    now_iso = datetime.utcnow().isoformat()

    async def deactivate_legacy_for_template(template_id: str) -> None:
        templates_to_deactivate.add(template_id)

    for task in program_v2.get("tasks") or []:
        v2_task_id = task.get("id")
        if not v2_task_id:
            continue

        source = task.get("task_source")
        is_active = task.get("is_active", True)
        trace = task.get("traceability") or {}

        if source == TaskSource.CUSTOMER_IMPORTED.value:
            continue

        if source == TaskSource.STRATEGY_GENERATED.value:
            template_id = trace.get("task_template_id")
            if not template_id:
                continue

            template = template_by_id.get(template_id)
            strategy_active = bool(
                template and is_strategy_task_active(template, task_to_fms=task_to_fms)
            ) if strategy else False

            if not strategy_active or not is_active:
                await deactivate_legacy_for_template(template_id)
                continue

            active_v2_ids.add(v2_task_id)

            legacy = legacy_by_template.get(template_id)
            reactivate_fields: Dict[str, Any] = {
                "is_active": True,
                "updated_at": datetime.utcnow().isoformat(),
            }

            override_fields: Dict[str, Any] = {}
            if task.get("is_overridden"):
                freq = task.get("frequency") or "monthly"
                if hasattr(freq, "value"):
                    freq = freq.value
                freq = str(freq).lower()
                override_fields = {
                    "task_name": task.get("task_title"),
                    "task_description": task.get("task_description"),
                    "frequency": freq,
                    "frequency_days": int(task.get("frequency_days") or frequency_to_days(freq)),
                    "estimated_duration_hours": float(
                        task.get("estimated_duration_hours") or 1.0
                    ),
                    "discipline": task.get("discipline"),
                    "is_active": True,
                    "updated_at": datetime.utcnow().isoformat(),
                }

            if legacy:
                await db.maintenance_programs.update_one(
                    {"equipment_id": equipment_id, "task_template_id": template_id},
                    {"$set": {**reactivate_fields, **override_fields}},
                )
                synced += 1
            continue

        if source not in (
            TaskSource.MANUAL.value,
            TaskSource.AI_GENERATED.value,
            TaskSource.EQUIPMENT_SPECIFIC.value,
        ):
            continue

        active_v2_ids.add(v2_task_id)
        if not is_active:
            v2_to_deactivate.add(v2_task_id)
            continue

        freq = task.get("frequency") or "monthly"
        if hasattr(freq, "value"):
            freq = freq.value
        frequency = str(freq).lower()
        freq_days = int(task.get("frequency_days") or frequency_to_days(frequency))
        raw_type = (task.get("task_type") or "preventive").lower()

        existing = legacy_by_v2.get(v2_task_id)
        update_fields: Dict[str, Any] = {
            "equipment_name": equipment.get("name", ""),
            "equipment_tag": equipment.get("tag"),
            "equipment_type_id": equipment_type_id,
            "equipment_type_name": program_v2.get("equipment_type_name")
            or equipment.get("equipment_type_name")
            or "",
            "task_template_id": v2_task_id,
            "v2_task_id": v2_task_id,
            "task_name": task.get("task_title") or "Maintenance Task",
            "task_description": task.get("task_description"),
            "task_type": raw_type,
            "task_source": source,
            "frequency": frequency,
            "frequency_days": freq_days,
            "criticality": equip_criticality,
            "estimated_duration_hours": float(task.get("estimated_duration_hours") or 1.0),
            "strategy_id": equipment_type_id or "program",
            "strategy_version": program_v2.get("version") or "1.0",
            "failure_mode_id": trace.get("failure_mode_id"),
            "failure_mode_name": trace.get("failure_mode_name"),
            "discipline": task.get("discipline"),
            "is_active": True,
            "updated_at": now_iso,
        }

        if existing:
            bulk_ops.append(UpdateOne({"_id": existing["_id"]}, {"$set": update_fields}))
        else:
            scheduler_program = EquipmentMaintenanceProgram(
                equipment_id=equipment_id,
                equipment_name=update_fields["equipment_name"],
                equipment_tag=update_fields["equipment_tag"],
                equipment_type_id=equipment_type_id,
                equipment_type_name=update_fields["equipment_type_name"],
                task_template_id=v2_task_id,
                task_name=update_fields["task_name"],
                task_description=update_fields["task_description"],
                task_type=raw_type,
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
            doc = scheduler_program.model_dump()
            doc["v2_task_id"] = v2_task_id
            doc["task_source"] = source
            bulk_ops.append(InsertOne(doc))

        synced += 1

    if templates_to_deactivate:
        deactivate_ids = [
            legacy_by_template[t]["id"]
            for t in templates_to_deactivate
            if t in legacy_by_template and legacy_by_template[t].get("id")
        ]
        await db.maintenance_programs.update_many(
            {
                "equipment_id": equipment_id,
                "task_template_id": {"$in": list(templates_to_deactivate)},
            },
            {"$set": {"is_active": False, "updated_at": now_iso}},
        )
        if deactivate_ids:
            await _cancel_open_scheduled_for_program_ids(deactivate_ids)

    if v2_to_deactivate:
        inactive_ids = [
            legacy_by_v2[v]["id"]
            for v in v2_to_deactivate
            if v in legacy_by_v2 and legacy_by_v2[v].get("id")
        ]
        await db.maintenance_programs.update_many(
            {"equipment_id": equipment_id, "v2_task_id": {"$in": list(v2_to_deactivate)}},
            {"$set": {"is_active": False, "updated_at": now_iso}},
        )
        if inactive_ids:
            await _cancel_open_scheduled_for_program_ids(inactive_ids)

    if bulk_ops:
        await db.maintenance_programs.bulk_write(bulk_ops, ordered=False)

    stale = await db.maintenance_programs.find(
        {
            "equipment_id": equipment_id,
            "v2_task_id": {"$exists": True, "$nin": list(active_v2_ids)},
            "task_source": {
                "$in": [
                    TaskSource.MANUAL.value,
                    TaskSource.AI_GENERATED.value,
                    TaskSource.EQUIPMENT_SPECIFIC.value,
                ]
            },
        },
        {"id": 1, "_id": 0},
    ).to_list(100)
    if stale:
        stale_ids = [p["id"] for p in stale]
        await db.maintenance_programs.update_many(
            {"id": {"$in": stale_ids}},
            {"$set": {"is_active": False, "updated_at": datetime.utcnow().isoformat()}},
        )
        await _cancel_open_scheduled_for_program_ids(stale_ids)

    return synced
