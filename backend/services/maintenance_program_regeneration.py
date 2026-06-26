"""Regenerate maintenance program tasks from equipment-type strategy."""
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from database import db
from models.maintenance_program import (
    MaintenanceProgram,
    ProgramChangePreview,
    TaskSource,
)
from services.maintenance_program_helpers import (
    bump_version,
    criticality_fields_from_equipment,
    log_program_audit,
)
from services.maintenance_program_pm_import import (
    is_incorporated_pm_program_task,
    load_incorporated_pm_refs_for_equipment,
)
from services.maintenance_tenant_scope import maintenance_scoped_job
from services.scheduler_helpers import (
    build_task_to_failure_modes,
    is_strategy_task_active,
    normalize_program_criticality,
)


async def generate_tasks_from_strategy(*args, **kwargs):
    from services.maintenance_program_service import MaintenanceProgramService
    return await MaintenanceProgramService.generate_tasks_from_strategy(*args, **kwargs)


async def regenerate_program(
    equipment_id: str,
    preserve_overrides: bool = True,
    preserve_manual_tasks: bool = True,
    preserve_imported_tasks: bool = True,
    preview_only: bool = False,
    user_id: Optional[str] = None
) -> Tuple[MaintenanceProgram, ProgramChangePreview]:
    """Regenerate a maintenance program from strategy"""
    
    program_doc = await db.maintenance_programs_v2.find_one(
        maintenance_scoped_job({"equipment_id": equipment_id})
    )
    if not program_doc:
        raise ValueError(f"No maintenance program found for equipment: {equipment_id}")
    
    program = MaintenanceProgram(**program_doc)
    equipment_type_id = program.equipment_type_id
    
    if not equipment_type_id:
        raise ValueError("Equipment has no equipment type - cannot regenerate from strategy")
    
    # Get current strategy
    strategy = await db.equipment_type_strategies.find_one(
        {"equipment_type_id": equipment_type_id},
        {"_id": 0}
    )
    
    if not strategy:
        raise ValueError(f"No strategy found for equipment type: {equipment_type_id}")

    task_to_fms = build_task_to_failure_modes(strategy)
    template_by_id = {
        t.get("id"): t for t in (strategy.get("task_templates") or []) if t.get("id")
    }

    def strategy_template_is_active(template_id: Optional[str]) -> bool:
        if not template_id:
            return False
        template = template_by_id.get(template_id)
        return bool(
            template and is_strategy_task_active(template, task_to_fms=task_to_fms)
        )

    equipment = await db.equipment_nodes.find_one(
        {"id": equipment_id},
        {"_id": 0, "criticality": 1},
    )
    strategy_band = normalize_program_criticality(
        equipment.get("criticality") if equipment else program.criticality_level
    )

    inactive_strategy_templates = set()
    for task in program.tasks:
        task_dict = task.model_dump() if hasattr(task, "model_dump") else task
        if task_dict.get("task_source") != TaskSource.STRATEGY_GENERATED.value:
            continue
        if task_dict.get("is_active", True):
            continue
        traceability = task_dict.get("traceability") or {}
        template_id = traceability.get("task_template_id")
        if template_id:
            inactive_strategy_templates.add(template_id)

    incorporated_pm_refs = await load_incorporated_pm_refs_for_equipment(equipment_id)
    
    # Collect preserved tasks
    preserved_tasks = []
    preserved_overrides = []
    current_strategy_task_ids = set()
    
    for task in program.tasks:
        source = task.task_source if hasattr(task, 'task_source') else task.get("task_source")
        
        # Preserve manual tasks
        if preserve_manual_tasks and source == TaskSource.MANUAL.value:
            preserved_tasks.append(task)
        
        # Preserve imported tasks
        elif preserve_imported_tasks and source == TaskSource.CUSTOMER_IMPORTED.value:
            task_dict = task.model_dump() if hasattr(task, "model_dump") else task
            traceability = task_dict.get("traceability") or {}
            pm_ref = traceability.get("pm_import_task_id")
            if pm_ref and pm_ref in incorporated_pm_refs:
                continue
            if is_incorporated_pm_program_task(task_dict):
                continue
            preserved_tasks.append(task)
        
        # Preserve AI tasks
        elif source == TaskSource.AI_GENERATED.value:
            preserved_tasks.append(task)
        
        # Preserve overridden strategy tasks
        elif preserve_overrides and source == TaskSource.STRATEGY_GENERATED.value:
            is_overridden = task.is_overridden if hasattr(task, 'is_overridden') else task.get("is_overridden", False)
            if is_overridden:
                traceability = task.traceability if hasattr(task, 'traceability') else task.get("traceability", {})
                template_id = traceability.get("task_template_id") if isinstance(traceability, dict) else getattr(traceability, 'task_template_id', None)
                if template_id and strategy_template_is_active(template_id):
                    current_strategy_task_ids.add(template_id)
                    preserved_overrides.append(task)
    
    # Generate new tasks from strategy
    new_strategy_tasks = await generate_tasks_from_strategy(
        equipment_type_id=equipment_type_id,
        equipment_id=equipment_id,
        criticality_level=strategy_band,
        user_id=user_id
    )
    
    # Build change preview
    preview = ProgramChangePreview()
    final_tasks = []
    
    # Add preserved non-strategy tasks
    for task in preserved_tasks:
        task_dict = task.model_dump() if hasattr(task, 'model_dump') else task
        final_tasks.append(task_dict)
        if task_dict.get("task_source") == TaskSource.MANUAL.value:
            preview.preserved_manual_tasks.append({"task_title": task_dict.get("task_title"), "id": task_dict.get("id")})
    
    # Process new strategy tasks
    for new_task in new_strategy_tasks:
        template_id = new_task.traceability.task_template_id
        
        # Check if we have an override for this task
        override_found = False
        for override in preserved_overrides:
            override_traceability = override.traceability if hasattr(override, 'traceability') else override.get("traceability", {})
            override_template_id = override_traceability.get("task_template_id") if isinstance(override_traceability, dict) else getattr(override_traceability, 'task_template_id', None)
            
            if override_template_id == template_id:
                # Keep the override
                override_dict = override.model_dump() if hasattr(override, 'model_dump') else override
                final_tasks.append(override_dict)
                preview.preserved_overrides.append({
                    "task_title": override_dict.get("task_title"),
                    "id": override_dict.get("id"),
                    "template_id": template_id
                })
                override_found = True
                break
        
        if not override_found:
            # Add new strategy task
            task_dict = new_task.model_dump()
            if template_id in inactive_strategy_templates:
                task_dict["is_active"] = False
            final_tasks.append(task_dict)
            preview.tasks_to_add.append({
                "task_title": task_dict.get("task_title"),
                "id": task_dict.get("id"),
                "frequency": task_dict.get("frequency")
            })
    
    # Identify tasks to remove (old strategy tasks not in new strategy)
    old_strategy_template_ids = set()
    for task in program.tasks:
        task_dict = task.model_dump() if hasattr(task, 'model_dump') else task
        if task_dict.get("task_source") == TaskSource.STRATEGY_GENERATED.value:
            traceability = task_dict.get("traceability", {})
            if traceability.get("task_template_id"):
                old_strategy_template_ids.add(traceability["task_template_id"])
    
    new_strategy_template_ids = {t.traceability.task_template_id for t in new_strategy_tasks}
    removed_template_ids = old_strategy_template_ids - new_strategy_template_ids - current_strategy_task_ids
    
    for task in program.tasks:
        task_dict = task.model_dump() if hasattr(task, 'model_dump') else task
        traceability = task_dict.get("traceability", {})
        if traceability.get("task_template_id") in removed_template_ids:
            preview.tasks_to_remove.append({
                "task_title": task_dict.get("task_title"),
                "id": task_dict.get("id")
            })

    filtered_final_tasks = []
    for task_dict in final_tasks:
        if task_dict.get("task_source") != TaskSource.STRATEGY_GENERATED.value:
            filtered_final_tasks.append(task_dict)
            continue
        template_id = (task_dict.get("traceability") or {}).get("task_template_id")
        if strategy_template_is_active(template_id):
            filtered_final_tasks.append(task_dict)
    final_tasks = filtered_final_tasks
    
    if preview_only:
        return program, preview
    
    # Apply changes
    new_version = bump_version(program.version)
    
    # Update program document
    update_data = {
        "tasks": final_tasks,
        "version": new_version,
        "source_strategy_version": strategy.get("version", "1.0"),
        "last_strategy_sync": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
        **criticality_fields_from_equipment(equipment),
    }
    
    # Calculate new statistics
    total_tasks = len(final_tasks)
    active_tasks = sum(1 for t in final_tasks if t.get("is_active", True))
    strategy_tasks = sum(1 for t in final_tasks if t.get("task_source") == TaskSource.STRATEGY_GENERATED.value)
    imported_tasks = sum(1 for t in final_tasks if t.get("task_source") == TaskSource.CUSTOMER_IMPORTED.value)
    ai_tasks = sum(1 for t in final_tasks if t.get("task_source") == TaskSource.AI_GENERATED.value)
    manual_tasks = sum(1 for t in final_tasks if t.get("task_source") == TaskSource.MANUAL.value)
    
    update_data.update({
        "total_tasks": total_tasks,
        "active_tasks": active_tasks,
        "strategy_tasks": strategy_tasks,
        "imported_tasks": imported_tasks,
        "ai_tasks": ai_tasks,
        "manual_tasks": manual_tasks
    })
    
    await db.maintenance_programs_v2.update_one(
        {"equipment_id": equipment_id},
        {
            "$set": update_data,
            "$push": {
                "version_history": ProgramVersionEntry(
                    version=new_version,
                    change_type="regenerated",
                    change_summary=f"Regenerated from strategy v{strategy.get('version', '1.0')}: +{len(preview.tasks_to_add)} tasks, -{len(preview.tasks_to_remove)} tasks",
                    tasks_added=len(preview.tasks_to_add),
                    tasks_removed=len(preview.tasks_to_remove),
                    previous_version=program.version,
                    changed_by=user_id
                ).model_dump()
            }
        }
    )
    
    # Log audit
    await log_program_audit(
        action="regenerate_program",
        equipment_id=equipment_id,
        user_id=user_id,
        details={
            "tasks_added": len(preview.tasks_to_add),
            "tasks_removed": len(preview.tasks_to_remove),
            "overrides_preserved": len(preview.preserved_overrides)
        }
    )
    
    # Fetch updated program
    updated_doc = await db.maintenance_programs_v2.find_one(
        maintenance_scoped_job({"equipment_id": equipment_id}), {"_id": 0}
    )
    return MaintenanceProgram(**updated_doc), preview
    