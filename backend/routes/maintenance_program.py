"""
Maintenance Program Routes
API endpoints for the Maintenance Program Module

The Maintenance Program provides a single executable maintenance program for each equipment item.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging

from database import db
from auth import get_current_user, require_permission

_scheduler_write = require_permission("scheduler:write")
from models.maintenance_program import (
    MaintenanceProgram,
    MaintenanceProgramTask,
    TaskTraceability,
    TaskSource,
    TaskCategory,
    TaskFrequency,
    TaskPriority,
    SkillRequirement,
    ProgramStatus,
    ApprovalStatus,
    CreateMaintenanceProgramRequest,
    AddTaskRequest,
    UpdateTaskRequest,
    RegenerateProgramRequest,
    ImportTasksRequest,
    AIRecommendationRequest,
    ApprovalRequest,
    frequency_to_days,
)
from services.maintenance_program_service import MaintenanceProgramService
from services.maintenance_scheduler_sync import (
    clear_equipment_schedule_after_program_delete,
    refresh_equipment_schedule,
    refresh_equipment_type_schedules,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/maintenance-programs", tags=["Maintenance Programs"])


def _current_user_id(current_user: dict) -> str:
    return current_user.get("id") or current_user.get("user_id") or current_user.get("email", "unknown")


async def _refresh_equipment_schedule_after_change(
    equipment_id: str,
    current_user: dict,
) -> Optional[Dict[str, Any]]:
    try:
        return await refresh_equipment_schedule(
            equipment_id,
            user_id=_current_user_id(current_user),
        )
    except Exception:
        logger.exception("Failed to refresh maintenance schedule for %s", equipment_id)
        return None


# ============= Program CRUD =============

@router.get("")
async def list_maintenance_programs(
    equipment_type_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    offset: int = 0,
    current_user: dict = Depends(get_current_user)
):
    """
    List all maintenance programs with optional filtering.
    
    Query Parameters:
    - equipment_type_id: Filter by equipment type
    - status: Filter by program status (draft, active, archived)
    - search: Search by equipment name or program name
    - limit: Maximum results (default 100, max 500)
    - offset: Pagination offset
    """
    query = {}
    
    if equipment_type_id:
        query["equipment_type_id"] = equipment_type_id
    if status:
        query["status"] = status
    
    # Get programs
    programs = await db.maintenance_programs_v2.find(
        query, {"_id": 0}
    ).skip(offset).limit(limit).to_list(limit)
    
    # Apply search filter
    if search:
        search_lower = search.lower()
        programs = [
            p for p in programs
            if search_lower in p.get("equipment_name", "").lower()
            or search_lower in p.get("program_name", "").lower()
            or search_lower in (p.get("equipment_tag") or "").lower()
        ]
    
    # Get total count
    total = await db.maintenance_programs_v2.count_documents(query)
    
    return {
        "programs": programs,
        "total": total,
        "limit": limit,
        "offset": offset
    }


@router.get("/summary")
async def get_programs_summary(
    equipment_type_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get summary statistics for maintenance programs.
    """
    match_query = {}
    if equipment_type_id:
        match_query["equipment_type_id"] = equipment_type_id
    
    pipeline = [
        {"$match": match_query},
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1},
            "total_tasks": {"$sum": "$total_tasks"},
            "active_tasks": {"$sum": "$active_tasks"},
            "strategy_tasks": {"$sum": "$strategy_tasks"},
            "imported_tasks": {"$sum": "$imported_tasks"},
            "ai_tasks": {"$sum": "$ai_tasks"},
            "manual_tasks": {"$sum": "$manual_tasks"}
        }}
    ]
    
    results = await db.maintenance_programs_v2.aggregate(pipeline).to_list(10)
    
    # Build summary
    summary = {
        "total_programs": 0,
        "by_status": {},
        "task_totals": {
            "total": 0,
            "active": 0,
            "strategy": 0,
            "imported": 0,
            "ai": 0,
            "manual": 0
        }
    }
    
    for row in results:
        status = row["_id"] or "unknown"
        summary["by_status"][status] = row["count"]
        summary["total_programs"] += row["count"]
        summary["task_totals"]["total"] += row["total_tasks"]
        summary["task_totals"]["active"] += row["active_tasks"]
        summary["task_totals"]["strategy"] += row["strategy_tasks"]
        summary["task_totals"]["imported"] += row["imported_tasks"]
        summary["task_totals"]["ai"] += row["ai_tasks"]
        summary["task_totals"]["manual"] += row["manual_tasks"]
    
    return summary


@router.get("/{equipment_id}")
async def get_maintenance_program(
    equipment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get the maintenance program for a specific equipment item.
    Returns program details including all tasks.
    """
    stored_program = await db.maintenance_programs_v2.find_one(
        {"equipment_id": equipment_id},
        {"_id": 0}
    )

    user_id = current_user.get("id", current_user.get("email", "unknown"))
    program, has_stored_program, pm_added = (
        await MaintenanceProgramService.enrich_program_response_with_pm_import(
            stored_program,
            equipment_id,
            user_id=user_id,
        )
    )

    if not program:
        return {
            "program": None,
            "exists": False,
            "equipment_id": equipment_id,
            "pm_import_tasks_included": 0,
            "strategy_tasks_included": 0,
        }

    program, strategy_added = (
        await MaintenanceProgramService.enrich_program_response_with_strategy_tasks(
            program,
            equipment_id,
            user_id=user_id,
        )
    )

    equipment = await db.equipment_nodes.find_one(
        {"id": equipment_id},
        {"_id": 0, "name": 1, "tag": 1, "criticality": 1, "equipment_type_name": 1, "equipment_type_id": 1}
    )

    strategy = None
    equipment_type_id = program.get("equipment_type_id") or (equipment or {}).get("equipment_type_id")
    if equipment_type_id:
        strategy = await db.equipment_type_strategies.find_one(
            {"equipment_type_id": equipment_type_id},
            {"version": 1, "_id": 0}
        )

    program = await MaintenanceProgramService.enrich_criticality_context(
        program, equipment=equipment, strategy=strategy
    )

    strategy_update_available = False
    if strategy:
        current_sync_version = program.get("applied_strategy_version") or program.get("source_strategy_version", "0.0")
        latest_version = program.get("latest_strategy_version", "1.0")
        strategy_update_available = current_sync_version != latest_version

    return {
        "program": program,
        "exists": has_stored_program,
        "equipment_id": equipment_id,
        "strategy_update_available": strategy_update_available,
        "pm_import_tasks_included": pm_added,
        "strategy_tasks_included": strategy_added,
        "has_tasks": len(program.get("tasks") or []) > 0,
    }


@router.post("/{equipment_id}")
async def create_maintenance_program(
    equipment_id: str,
    request: CreateMaintenanceProgramRequest,
    current_user: dict = Depends(_scheduler_write),
):
    """
    Create or initialize a maintenance program for an equipment item.
    
    Options:
    - generate_from_strategy: Auto-generate tasks from equipment type strategy
    - include_ai_recommendations: Generate AI recommendations
    """
    # Check if program already exists
    existing = await db.maintenance_programs_v2.find_one({"equipment_id": equipment_id})
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Maintenance program already exists for this equipment"
        )
    
    try:
        program = await MaintenanceProgramService.get_or_create_program(
            equipment_id=equipment_id,
            generate_from_strategy=request.generate_from_strategy,
            user_id=_current_user_id(current_user)
        )
        
        # Generate AI recommendations if requested
        ai_recommendations = []
        if request.include_ai_recommendations:
            try:
                ai_recommendations = await MaintenanceProgramService.generate_ai_recommendations(
                    equipment_id=equipment_id,
                    user_id=_current_user_id(current_user)
                )
            except Exception as e:
                logger.warning(f"AI recommendations failed: {e}")
        
        schedule_refresh = await _refresh_equipment_schedule_after_change(
            equipment_id, current_user
        )

        return {
            "message": "Maintenance program created",
            "program": program.model_dump(),
            "ai_recommendations": [r.model_dump() for r in ai_recommendations],
            "schedule_refresh": schedule_refresh,
        }
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{equipment_id}")
async def delete_maintenance_program(
    equipment_id: str,
    current_user: dict = Depends(_scheduler_write),
):
    """
    Delete a maintenance program.
    This will also cancel any scheduled tasks associated with this program.
    """
    program = await db.maintenance_programs_v2.find_one({"equipment_id": equipment_id})
    if not program:
        raise HTTPException(status_code=404, detail="Maintenance program not found")

    schedule_refresh = await clear_equipment_schedule_after_program_delete(equipment_id)

    await db.maintenance_programs_v2.delete_one({"equipment_id": equipment_id})

    await MaintenanceProgramService._log_audit(
        action="delete_program",
        equipment_id=equipment_id,
        user_id=_current_user_id(current_user)
    )

    return {
        "message": "Maintenance program deleted",
        "equipment_id": equipment_id,
        "scheduled_tasks_cancelled": schedule_refresh.get("scheduled_tasks_cancelled", 0),
        "legacy_programs_deactivated": schedule_refresh.get("legacy_programs_deactivated", 0),
        "schedule_refresh": schedule_refresh,
    }


# ============= Task Management =============

@router.get("/{equipment_id}/tasks")
async def get_program_tasks(
    equipment_id: str,
    source: Optional[str] = None,
    category: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get tasks for a maintenance program with optional filtering.
    
    Query Parameters:
    - source: Filter by task source (strategy_generated, customer_imported, ai_generated, manual)
    - category: Filter by task category
    - is_active: Filter by active status
    """
    program = await db.maintenance_programs_v2.find_one(
        {"equipment_id": equipment_id},
        {"_id": 0, "tasks": 1}
    )
    
    if not program:
        raise HTTPException(status_code=404, detail="Maintenance program not found")
    
    tasks = program.get("tasks", [])
    
    # Apply filters
    if source:
        tasks = [t for t in tasks if t.get("task_source") == source]
    if category:
        tasks = [t for t in tasks if t.get("task_category") == category]
    if is_active is not None:
        tasks = [t for t in tasks if t.get("is_active", True) == is_active]
    
    return {
        "tasks": tasks,
        "total": len(tasks)
    }


@router.post("/{equipment_id}/tasks")
async def add_task(
    equipment_id: str,
    request: AddTaskRequest,
    current_user: dict = Depends(_scheduler_write),
):
    """
    Add a manual task to a maintenance program.
    """
    try:
        task, new_version = await MaintenanceProgramService.add_task(
            equipment_id=equipment_id,
            task_title=request.task_title,
            task_description=request.task_description,
            frequency=request.frequency,
            estimated_duration_hours=request.estimated_duration_hours,
            task_category=request.task_category,
            task_source=TaskSource.MANUAL,
            priority=request.priority,
            skill_requirement=request.skill_requirement,
            discipline=request.discipline,
            procedure_steps=request.procedure_steps,
            acceptance_criteria=request.acceptance_criteria,
            tools_required=request.tools_required,
            spare_parts=request.spare_parts,
            user_id=_current_user_id(current_user)
        )
        
        schedule_refresh = await _refresh_equipment_schedule_after_change(
            equipment_id, current_user
        )

        return {
            "message": "Task added",
            "task": task.model_dump(),
            "version": new_version,
            "schedule_refresh": schedule_refresh,
        }
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/{equipment_id}/tasks/{task_id}")
async def update_task(
    equipment_id: str,
    task_id: str,
    request: UpdateTaskRequest,
    current_user: dict = Depends(_scheduler_write),
):
    """
    Update or override a task in a maintenance program.
    For strategy-generated tasks, this creates an override.
    """
    updates = {}
    
    if request.task_title is not None:
        updates["task_title"] = request.task_title
    if request.task_description is not None:
        updates["task_description"] = request.task_description
    if request.frequency is not None:
        updates["frequency"] = request.frequency.value
    if request.estimated_duration_hours is not None:
        updates["estimated_duration_hours"] = request.estimated_duration_hours
    if request.task_category is not None:
        updates["task_category"] = request.task_category.value
    if request.priority is not None:
        updates["priority"] = request.priority.value
    if request.skill_requirement is not None:
        updates["skill_requirement"] = request.skill_requirement.value
    if request.discipline is not None:
        updates["discipline"] = request.discipline
    if request.procedure_steps is not None:
        updates["procedure_steps"] = request.procedure_steps
    if request.acceptance_criteria is not None:
        updates["acceptance_criteria"] = request.acceptance_criteria
    if request.is_active is not None:
        updates["is_active"] = request.is_active
    if request.is_mandatory is not None:
        updates["is_mandatory"] = request.is_mandatory
    
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    try:
        updated_task, new_version = await MaintenanceProgramService.update_task(
            equipment_id=equipment_id,
            task_id=task_id,
            updates=updates,
            override_reason=request.override_reason,
            user_id=_current_user_id(current_user)
        )
        
        schedule_refresh = await _refresh_equipment_schedule_after_change(
            equipment_id, current_user
        )

        return {
            "message": "Task updated",
            "task": updated_task,
            "version": new_version,
            "schedule_refresh": schedule_refresh,
        }
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{equipment_id}/tasks/{task_id}")
async def delete_task(
    equipment_id: str,
    task_id: str,
    current_user: dict = Depends(_scheduler_write),
):
    """
    Delete a task from a maintenance program.
    """
    try:
        new_version = await MaintenanceProgramService.delete_task(
            equipment_id=equipment_id,
            task_id=task_id,
            user_id=_current_user_id(current_user)
        )
        
        schedule_refresh = await _refresh_equipment_schedule_after_change(
            equipment_id, current_user
        )

        return {
            "message": "Task deleted",
            "task_id": task_id,
            "version": new_version,
            "schedule_refresh": schedule_refresh,
        }
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ============= Program Operations =============

@router.post("/{equipment_id}/regenerate")
async def regenerate_program(
    equipment_id: str,
    request: RegenerateProgramRequest,
    current_user: dict = Depends(_scheduler_write),
):
    """
    Regenerate a maintenance program from the equipment type strategy.
    
    Options:
    - preserve_overrides: Keep manual overrides (default: true)
    - preserve_manual_tasks: Keep manually added tasks (default: true)
    - preserve_imported_tasks: Keep imported tasks (default: true)
    - preview_only: Only show what would change (default: false)
    """
    try:
        program, preview = await MaintenanceProgramService.regenerate_program(
            equipment_id=equipment_id,
            preserve_overrides=request.preserve_overrides,
            preserve_manual_tasks=request.preserve_manual_tasks,
            preserve_imported_tasks=request.preserve_imported_tasks,
            preview_only=request.preview_only,
            user_id=_current_user_id(current_user)
        )
        
        if request.preview_only:
            return {
                "message": "Regeneration preview",
                "preview": preview.model_dump()
            }

        schedule_refresh = await _refresh_equipment_schedule_after_change(
            equipment_id, current_user
        )
        
        return {
            "message": "Program regenerated",
            "program": program.model_dump(),
            "changes": preview.model_dump(),
            "schedule_refresh": schedule_refresh,
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{equipment_id}/import-tasks")
async def import_tasks(
    equipment_id: str,
    request: ImportTasksRequest,
    current_user: dict = Depends(_scheduler_write),
):
    """
    Import tasks from a PM Import session into this maintenance program.
    """
    try:
        imported_count, new_version = await MaintenanceProgramService.import_tasks_from_session(
            equipment_id=equipment_id,
            import_session_id=request.import_session_id,
            task_ids=request.task_ids,
            user_id=_current_user_id(current_user)
        )
        
        schedule_refresh = await _refresh_equipment_schedule_after_change(
            equipment_id, current_user
        )

        return {
            "message": f"Imported {imported_count} tasks",
            "tasks_imported": imported_count,
            "version": new_version,
            "schedule_refresh": schedule_refresh,
        }
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{equipment_id}/ai-recommendations")
async def generate_ai_recommendations(
    equipment_id: str,
    request: AIRecommendationRequest,
    current_user: dict = Depends(_scheduler_write),
):
    """
    Generate AI maintenance recommendations for this equipment.
    Recommendations are returned but not automatically added to the program.
    """
    try:
        recommendations = await MaintenanceProgramService.generate_ai_recommendations(
            equipment_id=equipment_id,
            include_failure_history=request.include_failure_history,
            include_industry_standards=request.include_industry_standards,
            max_recommendations=request.max_recommendations,
            user_id=_current_user_id(current_user)
        )
        
        return {
            "message": f"Generated {len(recommendations)} recommendations",
            "recommendations": [r.model_dump() for r in recommendations]
        }
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"AI recommendation generation failed: {e}")
        raise HTTPException(status_code=500, detail="AI recommendation generation failed")


@router.post("/{equipment_id}/ai-recommendations/accept")
async def accept_ai_recommendation(
    equipment_id: str,
    task: Dict[str, Any],
    current_user: dict = Depends(_scheduler_write),
):
    """
    Accept an AI recommendation and add it to the maintenance program.
    """
    try:
        # Convert dict to task model
        task_obj = MaintenanceProgramTask(**task)
        
        result_task, new_version = await MaintenanceProgramService.accept_ai_recommendation(
            equipment_id=equipment_id,
            task=task_obj,
            user_id=_current_user_id(current_user)
        )
        
        return {
            "message": "AI recommendation accepted",
            "task": result_task.model_dump(),
            "version": new_version
        }
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ============= Program Status & Approval =============

@router.patch("/{equipment_id}/status")
async def update_program_status(
    equipment_id: str,
    status: ProgramStatus,
    current_user: dict = Depends(_scheduler_write),
):
    """
    Update the status of a maintenance program.
    """
    result = await db.maintenance_programs_v2.update_one(
        {"equipment_id": equipment_id},
        {
            "$set": {
                "status": status.value,
                "updated_at": datetime.utcnow().isoformat()
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Maintenance program not found")
    
    return {
        "message": f"Program status updated to {status.value}",
        "status": status.value
    }


@router.post("/{equipment_id}/approve")
async def approve_program(
    equipment_id: str,
    request: ApprovalRequest,
    current_user: dict = Depends(_scheduler_write),
):
    """
    Approve or reject a maintenance program.
    """
    update_data = {
        "approval_status": request.approval_status.value,
        "updated_at": datetime.utcnow().isoformat()
    }
    
    if request.approval_status == ApprovalStatus.APPROVED:
        update_data["approved_by"] = current_user.get("user_id")
        update_data["approved_at"] = datetime.utcnow().isoformat()
        update_data["status"] = ProgramStatus.ACTIVE.value
    
    result = await db.maintenance_programs_v2.update_one(
        {"equipment_id": equipment_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Maintenance program not found")
    
    # Log audit
    await MaintenanceProgramService._log_audit(
        action=f"program_{request.approval_status.value}",
        equipment_id=equipment_id,
        user_id=_current_user_id(current_user),
        details={"comments": request.comments}
    )
    
    return {
        "message": f"Program {request.approval_status.value}",
        "approval_status": request.approval_status.value
    }


# ============= Version History & Audit =============

@router.get("/{equipment_id}/version-history")
async def get_version_history(
    equipment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get version history for a maintenance program.
    """
    program = await db.maintenance_programs_v2.find_one(
        {"equipment_id": equipment_id},
        {"_id": 0, "version": 1, "version_history": 1}
    )
    
    if not program:
        raise HTTPException(status_code=404, detail="Maintenance program not found")
    
    return {
        "current_version": program.get("version", "1.0"),
        "version_history": program.get("version_history", [])
    }


@router.get("/{equipment_id}/audit-log")
async def get_audit_log(
    equipment_id: str,
    limit: int = Query(default=50, le=200),
    current_user: dict = Depends(get_current_user)
):
    """
    Get audit log for a maintenance program.
    """
    audit_entries = await db.maintenance_program_audit.find(
        {"equipment_id": equipment_id},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return {
        "audit_log": audit_entries,
        "total": len(audit_entries)
    }


# ============= Bulk Operations =============

@router.post("/bulk/generate")
async def bulk_generate_programs(
    equipment_ids: List[str],
    generate_from_strategy: bool = True,
    current_user: dict = Depends(_scheduler_write),
):
    """
    Generate maintenance programs for multiple equipment items.
    """
    results = {
        "created": [],
        "already_exists": [],
        "errors": []
    }
    
    for equipment_id in equipment_ids:
        try:
            # Check if already exists
            existing = await db.maintenance_programs_v2.find_one({"equipment_id": equipment_id})
            if existing:
                results["already_exists"].append(equipment_id)
                continue
            
            program = await MaintenanceProgramService.get_or_create_program(
                equipment_id=equipment_id,
                generate_from_strategy=generate_from_strategy,
                user_id=_current_user_id(current_user)
            )
            results["created"].append({
                "equipment_id": equipment_id,
                "program_id": program.id,
                "tasks_count": len(program.tasks)
            })
            
        except Exception as e:
            results["errors"].append({
                "equipment_id": equipment_id,
                "error": str(e)
            })
    
    return {
        "message": f"Processed {len(equipment_ids)} equipment items",
        "results": results
    }


@router.post("/bulk/regenerate")
async def bulk_regenerate_programs(
    equipment_type_id: str,
    preserve_overrides: bool = True,
    preserve_manual_tasks: bool = True,
    current_user: dict = Depends(_scheduler_write),
):
    """
    Regenerate all maintenance programs for an equipment type.
    Useful after strategy changes.
    """
    # Get all programs for this equipment type
    programs = await db.maintenance_programs_v2.find(
        {"equipment_type_id": equipment_type_id},
        {"equipment_id": 1, "_id": 0}
    ).to_list(500)
    
    results = {
        "regenerated": [],
        "errors": []
    }
    
    for prog in programs:
        try:
            equipment_id = prog["equipment_id"]
            _, preview = await MaintenanceProgramService.regenerate_program(
                equipment_id=equipment_id,
                preserve_overrides=preserve_overrides,
                preserve_manual_tasks=preserve_manual_tasks,
                user_id=_current_user_id(current_user)
            )
            results["regenerated"].append({
                "equipment_id": equipment_id,
                "tasks_added": len(preview.tasks_to_add),
                "tasks_removed": len(preview.tasks_to_remove)
            })
        except Exception as e:
            results["errors"].append({
                "equipment_id": prog.get("equipment_id"),
                "error": str(e)
            })
    
    return {
        "message": f"Regenerated {len(results['regenerated'])} programs",
        "results": results
    }
