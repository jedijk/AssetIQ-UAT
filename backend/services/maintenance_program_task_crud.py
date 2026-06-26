"""Maintenance program task add/update/delete."""
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from database import db
from models.maintenance_program import (
    MaintenanceProgramTask,
    ProgramVersionEntry,
    SkillRequirement,
    TaskCategory,
    TaskFrequency,
    TaskPriority,
    TaskSource,
    TaskTraceability,
    frequency_to_days,
)
from services.maintenance_program_enrichment import recalculate_program_task_stats
from services.maintenance_program_helpers import bump_version, log_program_audit
from services.maintenance_tenant_scope import maintenance_scoped_job


async def add_task(
    equipment_id: str,
    task_title: str,
    task_description: Optional[str] = None,
    frequency: TaskFrequency = TaskFrequency.MONTHLY,
    estimated_duration_hours: float = 1.0,
    task_category: TaskCategory = TaskCategory.PREVENTIVE_MAINTENANCE,
    task_source: TaskSource = TaskSource.MANUAL,
    priority: TaskPriority = TaskPriority.MEDIUM,
    skill_requirement: SkillRequirement = SkillRequirement.TECHNICIAN,
    discipline: Optional[str] = None,
    procedure_steps: List[str] = None,
    acceptance_criteria: List[str] = None,
    tools_required: List[str] = None,
    spare_parts: List[str] = None,
    traceability: Optional[TaskTraceability] = None,
    user_id: Optional[str] = None
) -> Tuple[MaintenanceProgramTask, str]:
    """Add a task to a maintenance program. Returns (task, new_version)"""
    
    program = await db.maintenance_programs_v2.find_one(
        maintenance_scoped_job({"equipment_id": equipment_id})
    )
    if not program:
        raise ValueError(f"No maintenance program found for equipment: {equipment_id}")
    
    # Create task
    task = MaintenanceProgramTask(
        id=str(uuid.uuid4()),
        task_title=task_title,
        task_description=task_description,
        frequency=frequency,
        frequency_days=frequency_to_days(frequency.value),
        estimated_duration_hours=estimated_duration_hours,
        task_category=task_category,
        task_source=task_source,
        priority=priority,
        skill_requirement=skill_requirement,
        discipline=discipline,
        procedure_steps=procedure_steps or [],
        acceptance_criteria=acceptance_criteria or [],
        tools_required=tools_required or [],
        spare_parts=spare_parts or [],
        traceability=traceability or TaskTraceability(),
        created_by=user_id
    )
    
    # Bump version
    new_version = bump_version(program.get("version", "1.0"))
    
    # Update program
    await db.maintenance_programs_v2.update_one(
        {"equipment_id": equipment_id},
        {
            "$push": {
                "tasks": task.model_dump(),
                "version_history": ProgramVersionEntry(
                    version=new_version,
                    change_type="task_added",
                    change_summary=f"Added task: {task_title}",
                    tasks_added=1,
                    previous_version=program.get("version"),
                    changed_by=user_id
                ).model_dump()
            },
            "$set": {
                "version": new_version,
                "updated_at": datetime.utcnow().isoformat()
            },
            "$inc": {
                "total_tasks": 1,
                "active_tasks": 1 if task.is_active else 0,
                "manual_tasks": 1 if task_source == TaskSource.MANUAL else 0,
                "imported_tasks": 1 if task_source == TaskSource.CUSTOMER_IMPORTED else 0,
                "ai_tasks": 1 if task_source == TaskSource.AI_GENERATED else 0
            }
        }
    )
    
    # Log audit
    await log_program_audit(
        action="add_task",
        equipment_id=equipment_id,
        user_id=user_id,
        details={"task_id": task.id, "task_title": task_title, "source": task_source.value}
    )
    
    return task, new_version
    
async def update_task(
    equipment_id: str,
    task_id: str,
    updates: Dict[str, Any],
    override_reason: Optional[str] = None,
    user_id: Optional[str] = None
) -> Tuple[Dict[str, Any], str]:
    """Update a task in a maintenance program. Returns (updated_task, new_version)"""
    
    program = await db.maintenance_programs_v2.find_one(
        maintenance_scoped_job({"equipment_id": equipment_id})
    )
    if not program:
        raise ValueError(f"No maintenance program found for equipment: {equipment_id}")
    
    tasks = program.get("tasks", [])
    task_found = False
    updated_task = None
    
    for i, task in enumerate(tasks):
        if task.get("id") == task_id:
            # Track if this is an override
            is_override = task.get("task_source") == TaskSource.STRATEGY_GENERATED.value
            
            # Apply updates
            for key, value in updates.items():
                if key == "frequency" and isinstance(value, str):
                    tasks[i]["frequency"] = value
                    tasks[i]["frequency_days"] = frequency_to_days(value)
                elif key in ["task_title", "task_description", "estimated_duration_hours",
                            "task_category", "priority", "skill_requirement", "discipline",
                            "procedure_steps", "acceptance_criteria", "is_active", "is_mandatory",
                            "tools_required", "spare_parts", "skills_required", "spare_part_requirements"]:
                    if isinstance(value, Enum):
                        tasks[i][key] = value.value
                    else:
                        tasks[i][key] = value
            
            # Mark as overridden if strategy task
            if is_override and override_reason:
                tasks[i]["is_overridden"] = True
                if "traceability" not in tasks[i]:
                    tasks[i]["traceability"] = {}
                tasks[i]["traceability"]["override_reason"] = override_reason
                tasks[i]["traceability"]["overridden_at"] = datetime.utcnow().isoformat()
                tasks[i]["traceability"]["overridden_by"] = user_id
            
            tasks[i]["updated_at"] = datetime.utcnow().isoformat()
            updated_task = tasks[i]
            task_found = True
            break
    
    if not task_found:
        raise ValueError(f"Task not found: {task_id}")
    
    # Bump version
    new_version = bump_version(program.get("version", "1.0"))

    program["tasks"] = tasks
    _recalculate_program_task_stats(program)
    
    # Update program
    await db.maintenance_programs_v2.update_one(
        {"equipment_id": equipment_id},
        {
            "$set": {
                "tasks": tasks,
                "version": new_version,
                "updated_at": datetime.utcnow().isoformat(),
                "total_tasks": program["total_tasks"],
                "active_tasks": program["active_tasks"],
                "strategy_tasks": program["strategy_tasks"],
                "imported_tasks": program["imported_tasks"],
                "ai_tasks": program["ai_tasks"],
                "manual_tasks": program["manual_tasks"],
            },
            "$push": {
                "version_history": ProgramVersionEntry(
                    version=new_version,
                    change_type="task_modified",
                    change_summary=f"Modified task: {updated_task.get('task_title', task_id)}",
                    tasks_modified=1,
                    previous_version=program.get("version"),
                    changed_by=user_id
                ).model_dump()
            }
        }
    )
    
    # Log audit
    await log_program_audit(
        action="update_task",
        equipment_id=equipment_id,
        user_id=user_id,
        details={"task_id": task_id, "updates": list(updates.keys())}
    )
    
    return updated_task, new_version
    
async def delete_task(
    equipment_id: str,
    task_id: str,
    user_id: Optional[str] = None
) -> str:
    """Delete a task from a maintenance program. Returns new_version"""
    
    program = await db.maintenance_programs_v2.find_one(
        maintenance_scoped_job({"equipment_id": equipment_id})
    )
    if not program:
        raise ValueError(f"No maintenance program found for equipment: {equipment_id}")
    
    tasks = program.get("tasks", [])
    task_to_delete = None
    
    for task in tasks:
        if task.get("id") == task_id:
            task_to_delete = task
            break
    
    if not task_to_delete:
        raise ValueError(f"Task not found: {task_id}")
    
    # Bump version
    new_version = bump_version(program.get("version", "1.0"))
    
    # Determine count decrements
    source = task_to_delete.get("task_source", "manual")
    
    # Update program
    await db.maintenance_programs_v2.update_one(
        {"equipment_id": equipment_id},
        {
            "$pull": {"tasks": {"id": task_id}},
            "$set": {
                "version": new_version,
                "updated_at": datetime.utcnow().isoformat()
            },
            "$push": {
                "version_history": ProgramVersionEntry(
                    version=new_version,
                    change_type="task_removed",
                    change_summary=f"Removed task: {task_to_delete.get('task_title', task_id)}",
                    tasks_removed=1,
                    previous_version=program.get("version"),
                    changed_by=user_id
                ).model_dump()
            },
            "$inc": {
                "total_tasks": -1,
                "active_tasks": -1 if task_to_delete.get("is_active", True) else 0,
                "manual_tasks": -1 if source == "manual" else 0,
                "imported_tasks": -1 if source == "customer_imported" else 0,
                "ai_tasks": -1 if source == "ai_generated" else 0,
                "strategy_tasks": -1 if source == "strategy_generated" else 0
            }
        }
    )
    
    # Log audit
    await log_program_audit(
        action="delete_task",
        equipment_id=equipment_id,
        user_id=user_id,
        details={"task_id": task_id, "task_title": task_to_delete.get("task_title")}
    )
    
    return new_version
    