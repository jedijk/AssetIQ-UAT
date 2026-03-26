"""
My Tasks routes - User-centric task execution endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime, timezone, timedelta
from database import db
from auth import get_current_user
from bson import ObjectId

router = APIRouter(tags=["My Tasks"])


def serialize_task(task: dict) -> dict:
    """Serialize a task instance for API response."""
    if not task:
        return None
    
    # Use task_template_name as title if no direct title
    title = task.get("title") or task.get("task_template_name") or "Untitled Task"
    
    result = {
        "id": str(task.get("_id", "")),
        "title": title,
        "description": task.get("description", ""),
        "status": task.get("status", "scheduled"),
        "priority": task.get("priority", "medium"),
        "due_date": task.get("due_date").isoformat() if task.get("due_date") else None,
        "scheduled_date": task.get("scheduled_date").isoformat() if task.get("scheduled_date") else None,
        "equipment_id": str(task.get("equipment_id", "")) if task.get("equipment_id") else None,
        "equipment_name": task.get("equipment_name", ""),
        "asset": task.get("equipment_name", ""),
        "mitigation_strategy": task.get("mitigation_strategy") or task.get("discipline", ""),
        "type": task.get("mitigation_strategy") or task.get("discipline", ""),
        "discipline": task.get("discipline", ""),
        "is_recurring": task.get("is_recurring", False),
        "frequency": task.get("frequency_display", ""),
        "source": task.get("source", "manual"),
        "assigned_user_id": str(task.get("assigned_user_id", "")) if task.get("assigned_user_id") else None,
        "assigned_team": task.get("assigned_team", ""),
        "last_completed": task.get("last_completed").isoformat() if task.get("last_completed") else None,
        "form_fields": task.get("form_fields", []),
        "template": task.get("template", {}),
        "estimated_duration_minutes": task.get("estimated_duration_minutes"),
        "can_quick_complete": not task.get("form_fields") and not task.get("template", {}).get("form_fields"),
    }
    
    return result


@router.get("/my-tasks")
async def get_my_tasks(
    filter: str = Query("today", description="Filter: today, overdue, recurring, adhoc, all"),
    date: Optional[str] = Query(None, description="Date for filtering (YYYY-MM-DD)"),
    equipment_id: Optional[str] = Query(None, description="Filter by equipment"),
    status: Optional[str] = Query(None, description="Filter by status"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get tasks for the current user based on filters.
    
    Filters:
    - today: Tasks due today
    - overdue: Tasks past due date
    - recurring: Recurring tasks only
    - adhoc: One-time/manual tasks
    - all: All tasks
    """
    user_id = current_user["id"]
    
    # Build query - handle both ObjectId and UUID user IDs
    # Tasks can be assigned to specific user or unassigned
    user_id_query = []
    try:
        user_id_query.append({"assigned_user_id": ObjectId(user_id)})
    except Exception:
        # User ID might be a UUID string
        user_id_query.append({"assigned_user_id": user_id})
    
    user_id_query.extend([
        {"assigned_user_id": None},  # Unassigned tasks
        {"assigned_user_id": {"$exists": False}},
    ])
    
    query = {
        "$or": user_id_query,
        "status": {"$nin": ["completed", "cancelled"]}
    }
    
    # Apply filters
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    
    if filter == "today":
        if date:
            try:
                filter_date = datetime.fromisoformat(date)
                day_start = filter_date.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc)
                day_end = day_start + timedelta(days=1)
                query["due_date"] = {"$gte": day_start, "$lt": day_end}
            except ValueError:
                query["due_date"] = {"$gte": today_start, "$lt": today_end}
        else:
            query["due_date"] = {"$gte": today_start, "$lt": today_end}
    
    elif filter == "overdue":
        query["$or"] = [
            {"status": "overdue"},
            {"due_date": {"$lt": today_start}, "status": {"$nin": ["completed", "cancelled"]}}
        ]
    
    elif filter == "recurring":
        # Recurring tasks are those with a task_plan_id
        query["task_plan_id"] = {"$exists": True, "$ne": None}
    
    elif filter == "adhoc":
        # Adhoc tasks are those without a task_plan_id
        query["$or"] = [
            {"task_plan_id": None},
            {"task_plan_id": {"$exists": False}},
            {"source": "manual"},
        ]
    
    # Filter by equipment
    if equipment_id:
        try:
            query["equipment_id"] = ObjectId(equipment_id)
        except Exception:
            pass
    
    # Filter by status
    if status:
        query["status"] = status
    
    # Fetch tasks
    tasks_cursor = db.task_instances.find(query).sort([
        ("status", 1),  # overdue first
        ("priority", 1),  # critical/high priority first
        ("due_date", 1)  # earliest due date first
    ]).limit(100)
    
    tasks = []
    async for task in tasks_cursor:
        # Get equipment name if not cached
        if task.get("equipment_id") and not task.get("equipment_name"):
            equipment = await db.equipment.find_one({"_id": task["equipment_id"]})
            if equipment:
                task["equipment_name"] = equipment.get("name", "Unknown")
        
        # Get plan details for recurring info
        if task.get("task_plan_id"):
            plan = await db.task_plans.find_one({"_id": task["task_plan_id"]})
            if plan:
                task["is_recurring"] = True
                interval = plan.get("interval_value", 0)
                unit = plan.get("interval_unit", "days")
                task["frequency_display"] = f"Every {interval} {unit}"
                
                # Get template for form fields
                if plan.get("task_template_id"):
                    template = await db.task_templates.find_one({"_id": plan["task_template_id"]})
                    if template:
                        # Use template name as task title if not set
                        if not task.get("title"):
                            task["title"] = template.get("name", "")
                        task["task_template_name"] = template.get("name", "")
                        task["template"] = {
                            "name": template.get("name"),
                            "mitigation_strategy": template.get("mitigation_strategy"),
                            "procedure_steps": template.get("procedure_steps", []),
                        }
                        task["mitigation_strategy"] = template.get("mitigation_strategy", "")
                
                # Get form template if linked
                form_template_id = plan.get("form_template_id") or (template.get("form_template_id") if template else None)
                if form_template_id:
                    form_template = await db.form_templates.find_one({"_id": ObjectId(form_template_id)})
                    if form_template:
                        task["form_fields"] = form_template.get("fields", [])
        
        # Determine source - check after is_recurring is set
        if task.get("created_from_observation"):
            task["source"] = "observation"
        elif task.get("created_from_fmea"):
            task["source"] = "fmea"
        elif task.get("is_recurring") or task.get("task_plan_id"):
            task["source"] = "recurring"
        else:
            task["source"] = "manual"
        
        tasks.append(serialize_task(task))
    
    return {
        "tasks": tasks,
        "count": len(tasks),
        "filter": filter,
    }


@router.get("/my-tasks/{task_id}")
async def get_my_task_detail(
    task_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get detailed information about a specific task."""
    try:
        task = await db.task_instances.find_one({"_id": ObjectId(task_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid task ID")
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Enrich with related data
    if task.get("equipment_id"):
        equipment = await db.equipment.find_one({"_id": task["equipment_id"]})
        if equipment:
            task["equipment_name"] = equipment.get("name", "Unknown")
            task["equipment_tag"] = equipment.get("tag", "")
    
    # Get plan and template details
    if task.get("task_plan_id"):
        plan = await db.task_plans.find_one({"_id": task["task_plan_id"]})
        if plan:
            task["is_recurring"] = True
            task["frequency_display"] = f"Every {plan.get('interval_value', 0)} {plan.get('interval_unit', 'days')}"
            
            if plan.get("task_template_id"):
                template = await db.task_templates.find_one({"_id": plan["task_template_id"]})
                if template:
                    task["template"] = {
                        "name": template.get("name"),
                        "description": template.get("description"),
                        "mitigation_strategy": template.get("mitigation_strategy"),
                        "procedure_steps": template.get("procedure_steps", []),
                        "safety_requirements": template.get("safety_requirements", []),
                        "tools_required": template.get("tools_required", []),
                    }
                    task["mitigation_strategy"] = template.get("mitigation_strategy", "")
            
            # Get form template
            form_template_id = plan.get("form_template_id")
            if form_template_id:
                form_template = await db.form_templates.find_one({"_id": ObjectId(form_template_id)})
                if form_template:
                    task["form_fields"] = form_template.get("fields", [])
    
    # Get last completion info
    last_execution = await db.task_executions.find_one(
        {"task_plan_id": task.get("task_plan_id"), "status": "completed"},
        sort=[("completed_at", -1)]
    )
    if last_execution:
        task["last_completed"] = last_execution.get("completed_at")
    
    return serialize_task(task)


@router.post("/my-tasks/{task_id}/start")
async def start_my_task(
    task_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a task as started/in-progress."""
    try:
        task = await db.task_instances.find_one({"_id": ObjectId(task_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid task ID")
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Update status - handle both ObjectId and UUID user IDs
    now = datetime.now(timezone.utc)
    user_id = current_user["id"]
    try:
        user_id_value = ObjectId(user_id)
    except Exception:
        user_id_value = user_id
    
    await db.task_instances.update_one(
        {"_id": ObjectId(task_id)},
        {
            "$set": {
                "status": "in_progress",
                "started_at": now,
                "started_by": user_id_value,
                "updated_at": now,
            }
        }
    )
    
    # Return updated task
    updated_task = await db.task_instances.find_one({"_id": ObjectId(task_id)})
    
    # Enrich with equipment name
    if updated_task.get("equipment_id"):
        equipment = await db.equipment.find_one({"_id": updated_task["equipment_id"]})
        if equipment:
            updated_task["equipment_name"] = equipment.get("name", "Unknown")
    
    return serialize_task(updated_task)
