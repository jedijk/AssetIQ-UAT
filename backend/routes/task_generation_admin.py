"""
Admin endpoints for task generation: manual trigger + run history.
The weekly cron in P3 will call the same bridge service.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import db
from auth import require_permission
from services.task_instance_bridge import sync_scheduled_tasks_to_instances, next_monday
from services.flush_my_tasks_overdue import flush_overdue_my_tasks_backlog
from services.scheduler_job import (
    get_task_generation_config,
    save_task_generation_config,
    reload_task_generation_schedule,
    get_scheduler_status,
    compute_next_runs,
)

router = APIRouter(prefix="/admin/task-generation", tags=["admin", "task-generation"])

_admin_dep = require_permission("scheduler:write")


class GenerateRequest(BaseModel):
    week_start: Optional[str] = None  # YYYY-MM-DD, defaults to next Monday
    look_ahead_days: int = 7  # 7-day window per the agreed plan
    dry_run: bool = False


class FlushOverdueMyTasksRequest(BaseModel):
    dry_run: bool = True
    include_actions: bool = True
    tenant_id: Optional[str] = None


class CleanupOrphanTasksRequest(BaseModel):
    dry_run: bool = True
    future_only: bool = True  # Only delete future tasks, not past/historical


@router.post("/run")
async def generate_tasks(
    payload: GenerateRequest,
    current_user: dict = Depends(_admin_dep),
):
    """Run the task generation bridge for a single week (manual trigger)."""
    if payload.week_start:
        try:
            start = datetime.fromisoformat(payload.week_start).replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(status_code=400, detail="week_start must be YYYY-MM-DD")
    else:
        start = next_monday()
    end = start + timedelta(days=max(1, min(payload.look_ahead_days, 60)))
    result = await sync_scheduled_tasks_to_instances(
        week_start=start,
        week_end=end,
        dry_run=payload.dry_run,
        triggered_by="manual",
        triggered_by_user_id=current_user.get("id") or current_user.get("user_id"),
    )
    return result


@router.post("/flush-overdue-my-tasks")
async def flush_overdue_my_tasks(
    payload: FlushOverdueMyTasksRequest,
    current_user: dict = Depends(_admin_dep),
):
    """One-off: cancel overdue rows that appear in My Tasks (dry-run by default)."""
    return await flush_overdue_my_tasks_backlog(
        db,
        dry_run=payload.dry_run,
        tenant_id=payload.tenant_id,
        include_actions=payload.include_actions,
    )


@router.post("/cleanup-orphan-tasks")
async def cleanup_orphan_tasks(
    payload: CleanupOrphanTasksRequest,
    current_user: dict = Depends(_admin_dep),
):
    """
    Remove orphan scheduled_tasks that have no active maintenance program.
    By default only removes future tasks (due_date >= today).
    
    Orphan tasks occur when:
    - Maintenance programs are deleted but scheduled_tasks remain
    - Strategy is removed but scheduled_tasks weren't cleaned up
    - Task instances were created from programs that no longer exist
    
    Note: Equipment with active PM Import tasks (accepted/edited/implemented) 
    are treated as having an "active program" to match Intelligence Map logic.
    """
    from datetime import date
    
    today = date.today().isoformat()
    
    # Get all active maintenance program IDs (both legacy and v2)
    active_program_ids = set()
    
    # Legacy maintenance_programs
    async for prog in db.maintenance_programs.find(
        {"is_active": True},
        {"id": 1, "_id": 0}
    ):
        if prog.get("id"):
            active_program_ids.add(prog["id"])
    
    # V2 maintenance_programs
    async for prog in db.maintenance_programs_v2.find(
        {"status": {"$in": ["active", "draft"]}},
        {"id": 1, "_id": 0}
    ):
        if prog.get("id"):
            active_program_ids.add(prog["id"])
    
    # Get all active v2 task IDs
    active_v2_task_ids = set()
    async for prog in db.maintenance_programs_v2.find(
        {"status": {"$in": ["active", "draft"]}},
        {"tasks": 1, "_id": 0}
    ):
        for task in prog.get("tasks", []):
            if task.get("id"):
                active_v2_task_ids.add(task["id"])
    
    from services.intelligence_map_routes_service import (
        _active_v2_program_match,
        _pm_import_equipment_linked_task_match,
    )
    
    # ========== PM IMPORT EQUIPMENT (matches Intelligence Map logic) ==========
    pm_import_equipment_match = _pm_import_equipment_linked_task_match(
        enabled_only=True,
    )
    
    pm_equipment_pipeline = [
        {"$unwind": "$tasks_extracted"},
        {"$match": pm_import_equipment_match},
        {"$group": {"_id": "$tasks_extracted.equipment_match.equipment_id"}},
    ]
    pm_equipment_result = await db.pm_import_sessions.aggregate(pm_equipment_pipeline).to_list(None)
    equipment_ids_with_pm_import = set(r["_id"] for r in pm_equipment_result if r.get("_id"))
    
    # Equipment IDs that have v2 programs with active tasks
    equipment_ids_with_active_v2_program = set()
    async for prog in db.maintenance_programs_v2.find(
        _active_v2_program_match(),
        {"equipment_id": 1, "_id": 0},
    ):
        if prog.get("equipment_id"):
            equipment_ids_with_active_v2_program.add(prog["equipment_id"])
    
    # For display: count PM-only equipment (not already covered by active v2 programs)
    pm_only_equipment_count = len(equipment_ids_with_pm_import - equipment_ids_with_active_v2_program)
    
    active_v2_program_count = await db.maintenance_programs_v2.count_documents(
        _active_v2_program_match(),
    )
    total_active_programs_count = active_v2_program_count + pm_only_equipment_count
    
    # Build query for orphan scheduled_tasks
    # A task is orphan if:
    # 1. It has a maintenance_program_id that's not in active programs, OR
    # 2. It has a v2_program_id that's not in active programs, OR
    # 3. It has a v2_task_id that's not in active v2 tasks, OR
    # 4. It has NO program reference at all AND its equipment doesn't have PM import tasks
    
    base_query = {
        "status": {"$nin": ["completed", "cancelled"]},  # Only open tasks
    }
    
    # Only future tasks if requested
    if payload.future_only:
        base_query["due_date"] = {"$gte": today}
    
    # Find tasks with program references that are orphaned
    orphan_conditions = []
    
    if active_program_ids:
        # Tasks with maintenance_program_id not in active programs
        orphan_conditions.append({
            "maintenance_program_id": {"$nin": list(active_program_ids), "$ne": None, "$exists": True}
        })
        # Tasks with v2_program_id not in active programs  
        orphan_conditions.append({
            "v2_program_id": {"$nin": list(active_program_ids), "$ne": None, "$exists": True}
        })
    else:
        # No active programs - all tasks with program refs are orphaned
        orphan_conditions.append({
            "maintenance_program_id": {"$ne": None, "$exists": True}
        })
        orphan_conditions.append({
            "v2_program_id": {"$ne": None, "$exists": True}
        })
    
    if active_v2_task_ids:
        # Tasks with v2_task_id not in active v2 tasks
        orphan_conditions.append({
            "v2_task_id": {"$nin": list(active_v2_task_ids), "$ne": None, "$exists": True}
        })
    else:
        # No active v2 tasks - all tasks with v2_task_id refs are orphaned
        orphan_conditions.append({
            "v2_task_id": {"$ne": None, "$exists": True}
        })
    
    # Tasks with no program reference are orphan ONLY if their equipment
    # doesn't have an active PM import (which acts as a virtual program)
    no_program_ref_condition = {
        "$and": [
            {"$or": [{"maintenance_program_id": None}, {"maintenance_program_id": {"$exists": False}}]},
            {"$or": [{"v2_program_id": None}, {"v2_program_id": {"$exists": False}}]},
            {"$or": [{"v2_task_id": None}, {"v2_task_id": {"$exists": False}}]},
        ]
    }
    
    # If there are equipment with PM imports, exclude them from the "no program ref" orphan condition
    if equipment_ids_with_pm_import:
        no_program_ref_condition["equipment_id"] = {"$nin": list(equipment_ids_with_pm_import)}
    
    orphan_conditions.append(no_program_ref_condition)
    
    orphan_query = {**base_query, "$or": orphan_conditions}
    
    # Find orphan task instances too
    task_instance_query = {
        "status": {"$nin": ["completed", "cancelled", "skipped"]},
    }
    if payload.future_only:
        task_instance_query["due_date"] = {"$gte": today}
    
    instance_conditions = []
    if active_program_ids:
        instance_conditions.append({"plan_id": {"$nin": list(active_program_ids), "$ne": None, "$exists": True}})
        instance_conditions.append({"maintenance_program_id": {"$nin": list(active_program_ids), "$ne": None, "$exists": True}})
        instance_conditions.append({"v2_program_id": {"$nin": list(active_program_ids), "$ne": None, "$exists": True}})
    
    if instance_conditions:
        task_instance_query["$or"] = instance_conditions
    else:
        # No instance conditions - skip task_instances query
        task_instance_query = None
    
    if payload.dry_run:
        # Count what would be deleted
        scheduled_count = await db.scheduled_tasks.count_documents(orphan_query)
        instance_count = 0
        if task_instance_query:
            instance_count = await db.task_instances.count_documents(task_instance_query)
        
        # Get sample of what would be deleted
        sample_scheduled = await db.scheduled_tasks.find(
            orphan_query,
            {"task_name": 1, "equipment_name": 1, "due_date": 1, "maintenance_program_id": 1, "v2_task_id": 1, "_id": 0}
        ).limit(10).to_list(10)
        
        sample_instances = []
        if task_instance_query:
            sample_instances = await db.task_instances.find(
                task_instance_query,
                {"name": 1, "equipment_name": 1, "due_date": 1, "plan_id": 1, "_id": 0}
            ).limit(10).to_list(10)
        
        return {
            "dry_run": True,
            "future_only": payload.future_only,
            "active_programs_count": total_active_programs_count,  # Now matches Intelligence Map
            "active_program_records": len(active_program_ids),  # Actual DB records
            "pm_import_equipment_count": len(equipment_ids_with_pm_import),  # Equipment with PM imports
            "pm_only_equipment_count": pm_only_equipment_count,  # PM-only (not strategy)
            "active_v2_tasks_count": len(active_v2_task_ids),
            "orphan_scheduled_tasks_count": scheduled_count,
            "orphan_task_instances_count": instance_count,
            "total_to_delete": scheduled_count + instance_count,
            "sample_scheduled_tasks": sample_scheduled,
            "sample_task_instances": sample_instances,
        }
    else:
        # Actually delete
        scheduled_result = await db.scheduled_tasks.delete_many(orphan_query)
        instance_count = 0
        if task_instance_query:
            instance_result = await db.task_instances.delete_many(task_instance_query)
            instance_count = instance_result.deleted_count
        
        # Also invalidate work item projections to refresh My Tasks view
        await db.work_item_projections.delete_many({})
        
        return {
            "dry_run": False,
            "future_only": payload.future_only,
            "active_programs_count": total_active_programs_count,  # Now matches Intelligence Map
            "active_program_records": len(active_program_ids),  # Actual DB records
            "pm_import_equipment_count": len(equipment_ids_with_pm_import),  # Equipment with PM imports
            "active_v2_tasks_count": len(active_v2_task_ids),
            "scheduled_tasks_deleted": scheduled_result.deleted_count,
            "task_instances_deleted": instance_count,
            "total_deleted": scheduled_result.deleted_count + instance_count,
            "projections_cleared": True,
        }


@router.get("/runs")
async def list_runs(
    limit: int = 20,
    current_user: dict = Depends(_admin_dep),
):
    """Return the most recent task_generation_runs entries."""
    cursor = (
        db.task_generation_runs.find({}, {"_id": 0})
        .sort("started_at", -1)
        .limit(max(1, min(limit, 200)))
    )
    runs = await cursor.to_list(limit)
    return {"runs": runs, "total": len(runs)}


# ---------- Schedule config + status ----------
class ScheduleUpdate(BaseModel):
    cron_expression: Optional[str] = None
    timezone: Optional[str] = None
    look_ahead_days: Optional[int] = None
    enabled: Optional[bool] = None


@router.get("/schedule")
async def get_schedule(current_user: dict = Depends(_admin_dep)):
    """Return the active cron config + next 3 fire times + scheduler health."""
    cfg = await get_task_generation_config()
    return {
        **cfg,
        "next_fire_times": compute_next_runs(cfg["cron_expression"], cfg["timezone"], n=3),
        "scheduler": get_scheduler_status(),
    }


@router.put("/schedule")
async def update_schedule(
    payload: ScheduleUpdate,
    current_user: dict = Depends(_admin_dep),
):
    """Update the cron config and reload the scheduler in place."""
    try:
        merged = await save_task_generation_config(
            {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        )
    except ValueError as ex:
        raise HTTPException(status_code=400, detail=str(ex))
    cfg = await reload_task_generation_schedule()
    return {
        **cfg,
        "next_fire_times": compute_next_runs(cfg["cron_expression"], cfg["timezone"], n=3),
        "scheduler": get_scheduler_status(),
        "saved": merged,
    }


@router.post("/schedule/preview")
async def preview_schedule(
    payload: ScheduleUpdate,
    current_user: dict = Depends(_admin_dep),
):
    """Compute the next 3 fire times for an unsaved cron+tz combo."""
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
    from croniter import croniter

    cfg = await get_task_generation_config()
    cron_expression = payload.cron_expression or cfg["cron_expression"]
    timezone = payload.timezone or cfg["timezone"]
    try:
        ZoneInfo(timezone)
    except ZoneInfoNotFoundError:
        raise HTTPException(status_code=400, detail=f"Unknown timezone: {timezone}")
    try:
        croniter(cron_expression)
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f"Invalid cron expression: {ex}")
    return {
        "cron_expression": cron_expression,
        "timezone": timezone,
        "next_fire_times": compute_next_runs(cron_expression, timezone, n=3),
    }
