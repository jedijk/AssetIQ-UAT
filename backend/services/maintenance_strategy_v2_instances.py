"""Equipment strategy instances — task generation and per-asset customization."""
from datetime import datetime
from typing import Any, Dict, Optional
import uuid

from fastapi import HTTPException

from database import db
from models.maintenance_strategy_v2 import (
    AddTaskTemplateRequest,
    CriticalityFrequency,
    CriticalityLevel,
    EquipmentStrategyInstance,
    GenerateTasksRequest,
    GeneratedTask,
    MaintenanceStrategyType,
    MaintenanceTaskTemplate,
    RegenerateStrategyRequest,
    TaskActivationState,
    TaskFrequency,
)
from services.maintenance_strategy_helpers import (
    calculate_frequency_for_criticality,
    log_strategy_audit,
)
from services.tenant_scope import scoped as _tenant_query


async def generate_tasks_for_equipment(
    equipment_type_id: str,
    request: GenerateTasksRequest, current_user: dict
):
    """Generate maintenance tasks for a specific equipment asset based on its criticality"""
    strategy = await db.equipment_type_strategies.find_one(_tenant_query(current_user, {
        "equipment_type_id": equipment_type_id
    }))
    
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found for this equipment type")
    
    # Generate tasks based on criticality
    generated_tasks = []
    disabled_fm_set = set(request.disabled_failure_modes)
    
    for task_template in strategy.get("task_templates", []):
        # Check if any of the task's failure modes are disabled
        task_fm_ids = set(task_template.get("failure_mode_ids", []))
        if task_fm_ids and task_fm_ids.issubset(disabled_fm_set):
            continue  # Skip task if all its failure modes are disabled
        
        # Get frequency based on criticality
        freq_matrix = task_template.get("frequency_matrix", {})
        frequency = calculate_frequency_for_criticality(
            CriticalityFrequency(**freq_matrix),
            request.criticality
        )
        
        # Create generated task
        gen_task = GeneratedTask(
            id=f"gen_{uuid.uuid4()}",
            equipment_id=request.equipment_id,
            equipment_name=request.equipment_name,
            equipment_type_id=equipment_type_id,
            strategy_id=strategy.get("id"),
            strategy_version=strategy.get("version", "1.0"),
            task_template_id=task_template.get("id"),
            failure_mode_ids=task_template.get("failure_mode_ids", []),
            name=task_template.get("name"),
            description=task_template.get("description"),
            task_type=MaintenanceStrategyType(task_template.get("task_type", "preventive")),
            frequency=frequency,
            asset_criticality=request.criticality,
            activation_state=TaskActivationState.INHERITED,
            duration_hours=task_template.get("duration_hours", 1.0),
            skills_required=task_template.get("skills_required", []),
            discipline=task_template.get("discipline"),
            sync_status="current"
        )
        generated_tasks.append(gen_task)
    
    # Create or update equipment strategy instance
    existing_instance = await db.equipment_strategy_instances.find_one(_tenant_query(current_user, {
        "equipment_id": request.equipment_id
    }))
    
    instance = EquipmentStrategyInstance(
        id=existing_instance.get("id") if existing_instance else str(uuid.uuid4()),
        equipment_id=request.equipment_id,
        equipment_name=request.equipment_name,
        equipment_type_id=equipment_type_id,
        criticality=request.criticality,
        operating_context=request.operating_context,
        strategy_id=strategy.get("id"),
        strategy_version=strategy.get("version", "1.0"),
        generated_tasks=generated_tasks,
        disabled_failure_modes=request.disabled_failure_modes,
        sync_status="current",
        last_synced_at=datetime.utcnow().isoformat()
    )
    
    instance_dict = instance.model_dump()
    
    if existing_instance:
        await db.equipment_strategy_instances.update_one(
            _tenant_query(current_user, {"equipment_id": request.equipment_id}),
            {"$set": instance_dict}
        )
    else:
        await db.equipment_strategy_instances.insert_one(instance_dict)
    
    instance_dict.pop("_id", None)
    
    return {
        "equipment_id": request.equipment_id,
        "criticality": request.criticality.value,
        "generated_tasks": [t.model_dump() for t in generated_tasks],
        "total_tasks": len(generated_tasks),
        "strategy_version": strategy.get("version", "1.0")
    }


# ============= Equipment Strategy Instance Endpoints =============

async def get_equipment_strategy_instance(
    equipment_id: str, current_user: dict
):
    """Get the strategy instance for a specific equipment asset"""
    instance = await db.equipment_strategy_instances.find_one(
        _tenant_query(current_user, {"equipment_id": equipment_id}),
        {"_id": 0}
    )
    
    if not instance:
        return {"instance": None, "exists": False}
    
    return {"instance": instance, "exists": True}


async def override_equipment_task(
    equipment_id: str,
    task_id: str,
    updates: Dict[str, Any], current_user: dict
):
    """Override a generated task at equipment level"""
    instance = await db.equipment_strategy_instances.find_one(_tenant_query(current_user, {
        "equipment_id": equipment_id
    }))
    
    if not instance:
        raise HTTPException(status_code=404, detail="Equipment strategy instance not found")
    
    generated_tasks = instance.get("generated_tasks", [])
    updated = False
    
    for i, task in enumerate(generated_tasks):
        if task.get("id") == task_id:
            # Store original values before override
            if not task.get("is_overridden"):
                generated_tasks[i]["original_frequency"] = task.get("frequency")
            
            # Apply updates
            for key, value in updates.items():
                if key in ["frequency", "activation_state", "override_reason"]:
                    generated_tasks[i][key] = value
            
            generated_tasks[i]["is_overridden"] = True
            generated_tasks[i]["activation_state"] = TaskActivationState.OVERRIDDEN.value
            updated = True
            break
    
    if not updated:
        raise HTTPException(status_code=404, detail="Task not found")
    
    await db.equipment_strategy_instances.update_one(
        _tenant_query(current_user, {"equipment_id": equipment_id}),
        {
            "$set": {
                "generated_tasks": generated_tasks,
                "sync_status": "customized",
                "updated_at": datetime.utcnow().isoformat()
            }
        }
    )
    
    return {"message": "Task overridden", "task_id": task_id}


async def disable_failure_mode_for_equipment(
    equipment_id: str,
    failure_mode_id: str,
    reason: Optional[str] = None, *, current_user: dict
):
    """Disable a specific failure mode for an equipment asset"""
    instance = await db.equipment_strategy_instances.find_one(_tenant_query(current_user, {
        "equipment_id": equipment_id
    }))
    
    if not instance:
        raise HTTPException(status_code=404, detail="Equipment strategy instance not found")
    
    # Add to disabled list
    disabled_fms = instance.get("disabled_failure_modes", [])
    disabled_reasons = instance.get("disabled_fm_reasons", {})
    
    if failure_mode_id not in disabled_fms:
        disabled_fms.append(failure_mode_id)
    
    if reason:
        disabled_reasons[failure_mode_id] = reason
    
    # Disable related tasks
    generated_tasks = instance.get("generated_tasks", [])
    for i, task in enumerate(generated_tasks):
        if failure_mode_id in task.get("failure_mode_ids", []):
            generated_tasks[i]["activation_state"] = TaskActivationState.DISABLED.value
    
    await db.equipment_strategy_instances.update_one(
        _tenant_query(current_user, {"equipment_id": equipment_id}),
        {
            "$set": {
                "disabled_failure_modes": disabled_fms,
                "disabled_fm_reasons": disabled_reasons,
                "generated_tasks": generated_tasks,
                "sync_status": "customized",
                "updated_at": datetime.utcnow().isoformat()
            }
        }
    )
    
    return {"message": "Failure mode disabled", "failure_mode_id": failure_mode_id}


async def regenerate_equipment_tasks(
    equipment_id: str,
    request: RegenerateStrategyRequest, current_user: dict
):
    """Regenerate tasks for equipment after strategy template changes"""
    instance = await db.equipment_strategy_instances.find_one(_tenant_query(current_user, {
        "equipment_id": equipment_id
    }))
    
    if not instance:
        raise HTTPException(status_code=404, detail="Equipment strategy instance not found")
    
    # Get latest strategy
    strategy = await db.equipment_type_strategies.find_one(_tenant_query(current_user, {
        "equipment_type_id": instance.get("equipment_type_id")
    }))
    
    if not strategy:
        raise HTTPException(status_code=404, detail="Equipment type strategy not found")
    
    # Preview mode - just show what would change
    if request.preview_only:
        # TODO: Implement detailed preview
        return {
            "preview": True,
            "current_version": instance.get("strategy_version"),
            "new_version": strategy.get("version"),
            "changes": {
                "tasks_to_add": [],
                "tasks_to_remove": [],
                "tasks_to_update": []
            }
        }
    
    # Regenerate tasks
    criticality = CriticalityLevel(instance.get("criticality", "low"))
    disabled_fms = instance.get("disabled_failure_modes", [])
    
    # Preserve overrides if requested
    preserved_overrides = {}
    if request.preserve_overrides:
        for task in instance.get("generated_tasks", []):
            if task.get("is_overridden"):
                preserved_overrides[task.get("task_template_id")] = {
                    "frequency": task.get("frequency"),
                    "override_reason": task.get("override_reason")
                }
    
    # Generate new tasks
    generated_tasks = []
    for task_template in strategy.get("task_templates", []):
        task_fm_ids = set(task_template.get("failure_mode_ids", []))
        if task_fm_ids and task_fm_ids.issubset(set(disabled_fms)):
            continue
        
        freq_matrix = task_template.get("frequency_matrix", {})
        frequency = calculate_frequency_for_criticality(
            CriticalityFrequency(**freq_matrix),
            criticality
        )
        
        # Check for preserved override
        template_id = task_template.get("id")
        is_overridden = template_id in preserved_overrides
        
        if is_overridden:
            frequency = TaskFrequency(preserved_overrides[template_id]["frequency"])
        
        gen_task = GeneratedTask(
            id=f"gen_{uuid.uuid4()}",
            equipment_id=equipment_id,
            equipment_name=instance.get("equipment_name"),
            equipment_type_id=instance.get("equipment_type_id"),
            strategy_id=strategy.get("id"),
            strategy_version=strategy.get("version", "1.0"),
            task_template_id=template_id,
            failure_mode_ids=task_template.get("failure_mode_ids", []),
            name=task_template.get("name"),
            description=task_template.get("description"),
            task_type=MaintenanceStrategyType(task_template.get("task_type", "preventive")),
            frequency=frequency,
            asset_criticality=criticality,
            activation_state=TaskActivationState.OVERRIDDEN if is_overridden else TaskActivationState.INHERITED,
            is_overridden=is_overridden,
            override_reason=preserved_overrides.get(template_id, {}).get("override_reason") if is_overridden else None,
            original_frequency=None,
            duration_hours=task_template.get("duration_hours", 1.0),
            skills_required=task_template.get("skills_required", []),
            discipline=task_template.get("discipline"),
            sync_status="current"
        )
        generated_tasks.append(gen_task)
    
    await db.equipment_strategy_instances.update_one(
        _tenant_query(current_user, {"equipment_id": equipment_id}),
        {
            "$set": {
                "generated_tasks": [t.model_dump() for t in generated_tasks],
                "strategy_version": strategy.get("version"),
                "sync_status": "current",
                "last_synced_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            }
        }
    )
    
    return {
        "message": "Tasks regenerated",
        "equipment_id": equipment_id,
        "total_tasks": len(generated_tasks),
        "new_version": strategy.get("version"),
        "overrides_preserved": len(preserved_overrides)
    }



# ============= Local Tasks Endpoints =============

async def add_local_task(
    equipment_id: str,
    request: AddTaskTemplateRequest, current_user: dict
):
    """Add a local task to an equipment (not from template)"""
    instance = await db.equipment_strategy_instances.find_one(_tenant_query(current_user, {
        "equipment_id": equipment_id
    }))
    
    if not instance:
        raise HTTPException(status_code=404, detail="Equipment strategy instance not found")
    
    # Create local task
    local_task = MaintenanceTaskTemplate(
        id=f"local_{uuid.uuid4()}",
        name=request.name,
        description=request.description,
        task_type=request.task_type,
        frequency_matrix=request.frequency_matrix or CriticalityFrequency(),
        duration_hours=request.duration_hours,
        skills_required=request.skills_required,
        discipline=request.discipline,
        detection_methods=request.detection_methods,
        failure_mode_ids=request.failure_mode_ids,
        procedure_steps=request.procedure_steps,
        source="local"
    )
    
    local_task_dict = local_task.model_dump()
    
    await db.equipment_strategy_instances.update_one(
        _tenant_query(current_user, {"equipment_id": equipment_id}),
        {
            "$push": {"local_tasks": local_task_dict},
            "$set": {
                "sync_status": "customized",
                "updated_at": datetime.utcnow().isoformat()
            }
        }
    )
    
    # Log audit
    await log_strategy_audit(
        action="add_local_task",
        equipment_type_id=equipment_id,
        user_id=current_user.get("user_id"),
        details={"task_name": request.name},
        entity_type="equipment_strategy_instance"
    )
    
    return local_task_dict


async def delete_local_task(
    equipment_id: str,
    task_id: str, current_user: dict
):
    """Delete a local task from equipment and clean up its scheduled tasks + maintenance program."""
    result = await db.equipment_strategy_instances.update_one(
        _tenant_query(current_user, {"equipment_id": equipment_id}),
        {
            "$pull": {"local_tasks": {"id": task_id}},
            "$set": {"updated_at": datetime.utcnow().isoformat()}
        }
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Local task not found")

    # Clean up any maintenance_program + open scheduled_tasks created from this local task
    program_ids = [
        p["id"] async for p in db.maintenance_programs.find(
            _tenant_query(current_user, {"equipment_id": equipment_id, "task_template_id": task_id}),
            {"id": 1, "_id": 0},
        )
    ]
    scheduled_deleted = 0
    if program_ids:
        sched_res = await db.scheduled_tasks.delete_many(_tenant_query(current_user, {
            "maintenance_program_id": {"$in": program_ids},
        }))
        scheduled_deleted = sched_res.deleted_count
    progs_res = await db.maintenance_programs.delete_many(
        _tenant_query(current_user, {"equipment_id": equipment_id, "task_template_id": task_id}),
    )

    return {
        "message": "Local task deleted",
        "task_id": task_id,
        "programs_deleted": progs_res.deleted_count,
        "scheduled_tasks_deleted": scheduled_deleted,
    }


async def enable_failure_mode_for_equipment(
    equipment_id: str,
    failure_mode_id: str, current_user: dict
):
    """Re-enable a previously disabled failure mode for an equipment asset"""
    instance = await db.equipment_strategy_instances.find_one(_tenant_query(current_user, {
        "equipment_id": equipment_id
    }))
    
    if not instance:
        raise HTTPException(status_code=404, detail="Equipment strategy instance not found")
    
    # Remove from disabled list
    disabled_fms = instance.get("disabled_failure_modes", [])
    disabled_reasons = instance.get("disabled_fm_reasons", {})
    
    if failure_mode_id in disabled_fms:
        disabled_fms.remove(failure_mode_id)
    
    if failure_mode_id in disabled_reasons:
        del disabled_reasons[failure_mode_id]
    
    # Re-enable related tasks
    generated_tasks = instance.get("generated_tasks", [])
    for i, task in enumerate(generated_tasks):
        if failure_mode_id in task.get("failure_mode_ids", []):
            if task.get("activation_state") == TaskActivationState.DISABLED.value:
                generated_tasks[i]["activation_state"] = TaskActivationState.INHERITED.value
    
    await db.equipment_strategy_instances.update_one(
        _tenant_query(current_user, {"equipment_id": equipment_id}),
        {
            "$set": {
                "disabled_failure_modes": disabled_fms,
                "disabled_fm_reasons": disabled_reasons,
                "generated_tasks": generated_tasks,
                "updated_at": datetime.utcnow().isoformat()
            }
        }
    )
    
    return {"message": "Failure mode enabled", "failure_mode_id": failure_mode_id}


# ============= Sync Status Endpoint =============

async def get_equipment_sync_status(
    equipment_id: str, current_user: dict
):
    """Check sync status between equipment strategy and type strategy"""
    instance = await db.equipment_strategy_instances.find_one(
        _tenant_query(current_user, {"equipment_id": equipment_id}),
        {"_id": 0}
    )
    
    if not instance:
        return {"sync_status": "not_initialized", "needs_generation": True}
    
    # Get latest strategy version
    strategy = await db.equipment_type_strategies.find_one(
        _tenant_query(current_user, {"equipment_type_id": instance.get("equipment_type_id")}),
        {"_id": 0, "version": 1}
    )
    
    if not strategy:
        return {
            "sync_status": "orphaned",
            "message": "Equipment type strategy not found"
        }
    
    current_version = instance.get("strategy_version", "0.0")
    latest_version = strategy.get("version", "1.0")
    
    if current_version == latest_version:
        return {
            "sync_status": instance.get("sync_status", "current"),
            "current_version": current_version,
            "latest_version": latest_version,
            "is_up_to_date": True
        }
    else:
        return {
            "sync_status": "update_available",
            "current_version": current_version,
            "latest_version": latest_version,
            "is_up_to_date": False,
            "message": f"Strategy updated from v{current_version} to v{latest_version}"
        }
