"""
Tasks routes.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from database import db, task_service
from auth import get_current_user
from models.task_models import (
    TaskTemplateCreate, TaskTemplateUpdate,
    TaskPlanCreate, TaskPlanUpdate,
    TaskInstanceCreate, TaskInstanceUpdate, TaskExecutionSubmit
)

router = APIRouter(tags=["Tasks"])

# ============= TASK MANAGEMENT ENDPOINTS =============

# --- Task Templates ---

@router.get("/task-templates")
async def get_task_templates(
    discipline: Optional[str] = None,
    mitigation_strategy: Optional[str] = None,
    equipment_type_id: Optional[str] = None,
    search: Optional[str] = None,
    active_only: bool = True,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get task templates with optional filters."""
    return await task_service.get_templates(
        discipline=discipline,
        mitigation_strategy=mitigation_strategy,
        equipment_type_id=equipment_type_id,
        search=search,
        active_only=active_only,
        skip=skip,
        limit=limit
    )

@router.get("/task-templates/{template_id}")
async def get_task_template(
    template_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific task template."""
    template = await task_service.get_template_by_id(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Task template not found")
    return template

@router.post("/task-templates")
async def create_task_template(
    data: TaskTemplateCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new task template."""
    return await task_service.create_template(data.model_dump(), current_user["id"])

@router.patch("/task-templates/{template_id}")
async def update_task_template(
    template_id: str,
    data: TaskTemplateUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a task template."""
    result = await task_service.update_template(template_id, data.model_dump(exclude_unset=True))
    if not result:
        raise HTTPException(status_code=404, detail="Task template not found")
    return result

@router.delete("/task-templates/{template_id}")
async def delete_task_template(
    template_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete (deactivate) a task template."""
    try:
        deleted = await task_service.delete_template(template_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Task template not found")
        return {"message": "Task template deactivated"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- Task Plans ---

@router.get("/task-plans")
async def get_task_plans(
    equipment_id: Optional[str] = None,
    template_id: Optional[str] = None,
    active_only: bool = True,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get task plans with optional filters."""
    return await task_service.get_plans(
        equipment_id=equipment_id,
        template_id=template_id,
        active_only=active_only,
        skip=skip,
        limit=limit
    )

@router.get("/task-plans/due")
async def get_due_task_plans(
    days: int = 7,
    current_user: dict = Depends(get_current_user)
):
    """Get task plans due within specified days."""
    due_before = datetime.now(timezone.utc) + timedelta(days=days)
    return await task_service.get_plans(due_before=due_before, active_only=True)

@router.get("/task-plans/{plan_id}")
async def get_task_plan(
    plan_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific task plan."""
    plan = await task_service.get_plan_by_id(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Task plan not found")
    return plan

@router.post("/task-plans")
async def create_task_plan(
    data: TaskPlanCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a task plan for specific equipment."""
    try:
        return await task_service.create_plan(data.model_dump(), current_user["id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.patch("/task-plans/{plan_id}")
async def update_task_plan(
    plan_id: str,
    data: TaskPlanUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a task plan."""
    result = await task_service.update_plan(plan_id, data.model_dump(exclude_unset=True))
    if not result:
        raise HTTPException(status_code=404, detail="Task plan not found")
    return result

@router.delete("/task-plans/{plan_id}")
async def delete_task_plan(
    plan_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete (deactivate) a task plan."""
    deleted = await task_service.delete_plan(plan_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Task plan not found")
    return {"message": "Task plan deactivated"}

# --- Task Instances ---

@router.get("/task-instances")
async def get_task_instances(
    equipment_id: Optional[str] = None,
    plan_id: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get task instances with optional filters."""
    from_dt = datetime.fromisoformat(from_date) if from_date else None
    to_dt = datetime.fromisoformat(to_date) if to_date else None
    
    return await task_service.get_instances(
        equipment_id=equipment_id,
        plan_id=plan_id,
        status=status,
        priority=priority,
        from_date=from_dt,
        to_date=to_dt,
        skip=skip,
        limit=limit
    )

@router.get("/task-instances/calendar")
async def get_task_calendar(
    from_date: str,
    to_date: str,
    equipment_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get tasks for calendar view."""
    from_dt = datetime.fromisoformat(from_date)
    to_dt = datetime.fromisoformat(to_date)
    
    return await task_service.get_calendar_view(from_dt, to_dt, equipment_id)

@router.get("/task-instances/{instance_id}")
async def get_task_instance(
    instance_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific task instance."""
    instance = await task_service.get_instance_by_id(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Task instance not found")
    return instance

@router.post("/task-instances")
async def create_task_instance(
    data: TaskInstanceCreate,
    current_user: dict = Depends(get_current_user)
):
    """Manually create a task instance."""
    try:
        return await task_service.create_instance(data.model_dump(), current_user["id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.patch("/task-instances/{instance_id}")
async def update_task_instance(
    instance_id: str,
    data: TaskInstanceUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a task instance."""
    result = await task_service.update_instance(instance_id, data.model_dump(exclude_unset=True))
    if not result:
        raise HTTPException(status_code=404, detail="Task instance not found")
    return result

@router.post("/task-instances/{instance_id}/start")
async def start_task_instance(
    instance_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a task as started."""
    result = await task_service.start_task(instance_id, current_user["id"])
    if not result:
        raise HTTPException(status_code=404, detail="Task instance not found")
    return result

@router.post("/task-instances/{instance_id}/complete")
async def complete_task_instance(
    instance_id: str,
    data: TaskExecutionSubmit,
    current_user: dict = Depends(get_current_user)
):
    """Mark a task as completed."""
    result = await task_service.complete_task(instance_id, data.model_dump())
    if not result:
        raise HTTPException(status_code=404, detail="Task instance not found")
    return result

@router.delete("/task-instances/{instance_id}")
async def delete_task_instance(
    instance_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a task instance."""
    result = await task_service.delete_instance(instance_id)
    if not result:
        raise HTTPException(status_code=404, detail="Task instance not found")
    return {"message": "Task instance deleted successfully"}

# --- Task Scheduling ---

@router.post("/task-plans/{plan_id}/generate-instances")
async def generate_instances_for_plan(
    plan_id: str,
    horizon_days: int = 30,
    current_user: dict = Depends(get_current_user)
):
    """Generate task instances for a specific plan."""
    instances = await task_service.generate_instances_for_plan(
        plan_id, horizon_days, current_user["id"]
    )
    return {
        "plan_id": plan_id,
        "generated": len(instances),
        "instances": instances
    }

@router.post("/tasks/generate-all")
async def generate_all_task_instances(
    horizon_days: int = 30,
    current_user: dict = Depends(get_current_user)
):
    """Generate task instances for all active plans."""
    return await task_service.generate_all_due_instances(
        horizon_days, current_user["id"]
    )

@router.post("/tasks/mark-overdue")
async def mark_overdue_tasks(
    current_user: dict = Depends(get_current_user)
):
    """Mark all past-due tasks as overdue."""
    count = await task_service.mark_overdue_tasks()
    return {"marked_overdue": count}

# --- Task Stats ---

@router.get("/tasks/stats")
async def get_task_stats(
    current_user: dict = Depends(get_current_user)
):
    """Get task statistics."""
    return await task_service.get_task_stats(current_user["id"])

# ============= FORM DESIGNER ENDPOINTS =============

# --- Form Templates ---


