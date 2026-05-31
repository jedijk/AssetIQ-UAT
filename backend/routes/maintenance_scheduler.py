"""
Maintenance Scheduler & Planning Engine Routes
"""
import json
import os
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from datetime import datetime, timedelta
import uuid

from database import db
from auth import get_current_user
from models.maintenance_scheduler import (
    EquipmentMaintenanceProgram,
    ScheduledTask,
    TechnicianCapacity,
    MaintenanceHistory,
    TaskStatus,
    TaskPriority,
    CriticalityLevel,
    ApplyStrategyRequest,
    RunSchedulerRequest,
    UpdateTaskStatusRequest,
    CompleteTaskRequest,
    AIScheduleRequest,
    DeferTaskRequest
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/maintenance-scheduler", tags=["Maintenance Scheduler"])


# ============= Helper Functions =============

def frequency_to_days(frequency: str) -> int:
    """Convert frequency string to days"""
    mapping = {
        "continuous": 1,
        "daily": 1,
        "weekly": 7,
        "bi_weekly": 14,
        "monthly": 30,
        "quarterly": 90,
        "semi_annual": 180,
        "annual": 365,
        "biennial": 730,
        "on_condition": 30,  # Default to monthly check
    }
    return mapping.get(frequency, 30)


def get_planning_horizon(criticality: str) -> int:
    """Get planning horizon days based on criticality"""
    horizons = {
        "high": 7,
        "medium": 14,
        "low": 30
    }
    return horizons.get(criticality, 14)


def calculate_priority(criticality: str, days_until_due: int, is_overdue: bool) -> TaskPriority:
    """Calculate task priority based on criticality and due date"""
    if is_overdue:
        if criticality == "high":
            return TaskPriority.CRITICAL
        return TaskPriority.HIGH
    
    if criticality == "high":
        if days_until_due <= 3:
            return TaskPriority.CRITICAL
        return TaskPriority.HIGH
    elif criticality == "medium":
        if days_until_due <= 3:
            return TaskPriority.HIGH
        return TaskPriority.MEDIUM
    else:
        if days_until_due <= 3:
            return TaskPriority.MEDIUM
        return TaskPriority.LOW


# ============= Equipment Maintenance Programs =============

@router.post("/apply-strategy/{equipment_type_id}")
async def apply_strategy_to_equipment(
    equipment_type_id: str,
    request: ApplyStrategyRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Apply maintenance strategy to selected equipment.
    Creates maintenance program records for each equipment-task combination.
    """
    # Get the strategy
    strategy = await db.equipment_type_strategies.find_one({
        "equipment_type_id": equipment_type_id
    })
    
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    if strategy.get("status") != "active":
        raise HTTPException(status_code=400, detail="Strategy must be active to apply")
    
    # Get equipment details
    equipment_list = await db.equipment_nodes.find({
        "id": {"$in": request.equipment_ids},
        "equipment_type_id": equipment_type_id
    }).to_list(500)
    
    if not equipment_list:
        raise HTTPException(status_code=404, detail="No matching equipment found")
    
    # Get task templates from strategy
    task_templates = strategy.get("task_templates", [])
    failure_mode_strategies = strategy.get("failure_mode_strategies", [])
    
    # Create FM lookup
    fm_lookup = {fm.get("failure_mode_id"): fm for fm in failure_mode_strategies}
    
    programs_created = []
    today = datetime.utcnow().date().isoformat()
    
    for equipment in equipment_list:
        equipment_id = equipment.get("id")
        equipment_name = equipment.get("name")
        equipment_tag = equipment.get("tag")
        
        # Get equipment criticality
        equip_criticality = "medium"
        if equipment.get("criticality"):
            crit = equipment["criticality"]
            if isinstance(crit, dict):
                equip_criticality = crit.get("level", "medium").lower()
            elif isinstance(crit, str):
                equip_criticality = crit.lower()
        
        for task in task_templates:
            # Skip disabled tasks
            if not task.get("is_mandatory", True):
                continue
            
            task_id = task.get("id")
            task_name = task.get("name")
            task_type = task.get("task_type", "preventive")
            
            # Get frequency based on equipment criticality
            freq_matrix = task.get("frequency_matrix", {})
            frequency = freq_matrix.get(equip_criticality, "monthly")
            
            # Get linked failure mode info
            fm_ids = task.get("failure_mode_ids", [])
            fm_name = None
            fm_id = None
            if fm_ids and fm_ids[0] in fm_lookup:
                fm = fm_lookup[fm_ids[0]]
                fm_id = fm.get("failure_mode_id")
                fm_name = fm.get("failure_mode_name")
            
            # Check if program already exists
            existing = await db.maintenance_programs.find_one({
                "equipment_id": equipment_id,
                "task_template_id": task_id
            })
            
            if existing:
                # Update existing program
                await db.maintenance_programs.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {
                        "strategy_version": strategy.get("version", "1.0"),
                        "frequency": frequency,
                        "frequency_days": frequency_to_days(frequency),
                        "criticality": equip_criticality,
                        "is_active": True,
                        "updated_at": datetime.utcnow().isoformat()
                    }}
                )
            else:
                # Create new program
                program = EquipmentMaintenanceProgram(
                    equipment_id=equipment_id,
                    equipment_name=equipment_name,
                    equipment_tag=equipment_tag,
                    equipment_type_id=equipment_type_id,
                    equipment_type_name=strategy.get("equipment_type_name", ""),
                    task_template_id=task_id,
                    task_name=task_name,
                    task_description=task.get("description"),
                    task_type=task_type,
                    frequency=frequency,
                    frequency_days=frequency_to_days(frequency),
                    criticality=CriticalityLevel(equip_criticality),
                    estimated_duration_hours=task.get("duration_hours", 1.0),
                    next_due_date=today,  # Due immediately on first application
                    strategy_id=strategy.get("equipment_type_id"),
                    strategy_version=strategy.get("version", "1.0"),
                    failure_mode_id=fm_id,
                    failure_mode_name=fm_name,
                    discipline=task.get("discipline"),
                    skills_required=task.get("skills_required", [])
                )
                
                await db.maintenance_programs.insert_one(program.model_dump())
                programs_created.append(program.id)
    
    return {
        "message": f"Strategy applied to {len(equipment_list)} equipment",
        "equipment_count": len(equipment_list),
        "programs_created": len(programs_created),
        "programs_updated": len(equipment_list) * len(task_templates) - len(programs_created)
    }


@router.get("/programs")
async def get_maintenance_programs(
    equipment_type_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    is_active: bool = True,
    current_user: dict = Depends(get_current_user)
):
    """Get all maintenance programs with optional filtering"""
    query = {"is_active": is_active}
    
    if equipment_type_id:
        query["equipment_type_id"] = equipment_type_id
    if equipment_id:
        query["equipment_id"] = equipment_id
    
    programs = await db.maintenance_programs.find(query, {"_id": 0}).to_list(1000)
    
    return {
        "programs": programs,
        "total": len(programs)
    }


@router.get("/programs/{equipment_type_id}/summary")
async def get_programs_summary(
    equipment_type_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get summary of maintenance programs for an equipment type"""
    # Count equipment with programs
    pipeline = [
        {"$match": {"equipment_type_id": equipment_type_id, "is_active": True}},
        {"$group": {
            "_id": "$equipment_id",
            "equipment_name": {"$first": "$equipment_name"},
            "equipment_tag": {"$first": "$equipment_tag"},
            "task_count": {"$sum": 1}
        }}
    ]
    
    equipment_summary = await db.maintenance_programs.aggregate(pipeline).to_list(500)
    
    # Get total programs
    total_programs = await db.maintenance_programs.count_documents({
        "equipment_type_id": equipment_type_id,
        "is_active": True
    })
    
    # Get overdue count
    today = datetime.utcnow().date().isoformat()
    overdue_count = await db.maintenance_programs.count_documents({
        "equipment_type_id": equipment_type_id,
        "is_active": True,
        "next_due_date": {"$lt": today}
    })
    
    return {
        "equipment_count": len(equipment_summary),
        "total_programs": total_programs,
        "overdue_count": overdue_count,
        "equipment": equipment_summary
    }


# ============= Scheduler Engine =============

@router.post("/run-scheduler")
async def run_scheduler(
    request: RunSchedulerRequest = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Run the scheduler engine to generate scheduled tasks.
    Reviews all active maintenance programs and creates tasks within planning horizon.
    """
    if request is None:
        request = RunSchedulerRequest()
    
    today = datetime.utcnow().date()
    today_str = today.isoformat()
    
    # Build query for maintenance programs
    query = {"is_active": True}
    if request.equipment_type_id:
        query["equipment_type_id"] = request.equipment_type_id
    
    programs = await db.maintenance_programs.find(query).to_list(5000)
    
    tasks_created = []
    tasks_skipped = 0
    
    for program in programs:
        program_id = program.get("id")
        criticality = program.get("criticality", "medium")
        
        # Get planning horizon
        horizon = request.planning_horizon_days or get_planning_horizon(criticality)
        horizon_date = (today + timedelta(days=horizon)).isoformat()
        
        # Get next due date
        next_due = program.get("next_due_date")
        if not next_due:
            next_due = today_str
        
        # Check if due within planning horizon
        if next_due > horizon_date:
            tasks_skipped += 1
            continue
        
        # Check if task already exists for this program and due date
        existing_task = await db.scheduled_tasks.find_one({
            "maintenance_program_id": program_id,
            "due_date": next_due,
            "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]}
        })
        
        if existing_task:
            tasks_skipped += 1
            continue
        
        # Calculate priority
        due_date = datetime.fromisoformat(next_due).date()
        days_until_due = (due_date - today).days
        is_overdue = days_until_due < 0
        priority = calculate_priority(criticality, days_until_due, is_overdue)
        
        # Create scheduled task
        task = ScheduledTask(
            equipment_id=program.get("equipment_id"),
            equipment_name=program.get("equipment_name"),
            equipment_tag=program.get("equipment_tag"),
            task_name=program.get("task_name"),
            task_description=program.get("task_description"),
            task_type=program.get("task_type"),
            due_date=next_due,
            planned_date=next_due,  # Default planned = due
            priority=priority,
            status=TaskStatus.SCHEDULED,
            estimated_hours=program.get("estimated_duration_hours", 1.0),
            maintenance_program_id=program_id,
            strategy_id=program.get("strategy_id"),
            strategy_version=program.get("strategy_version"),
            failure_mode_id=program.get("failure_mode_id"),
            failure_mode_name=program.get("failure_mode_name")
        )
        
        await db.scheduled_tasks.insert_one(task.model_dump())
        tasks_created.append(task.id)
        
        # Update program's last scheduled date
        await db.maintenance_programs.update_one(
            {"id": program_id},
            {"$set": {"last_scheduled_date": today_str}}
        )
    
    return {
        "message": "Scheduler run completed",
        "tasks_created": len(tasks_created),
        "tasks_skipped": tasks_skipped,
        "programs_reviewed": len(programs)
    }


# ============= Scheduled Tasks =============

@router.get("/tasks")
async def get_scheduled_tasks(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    equipment_type_id: Optional[str] = None,
    assigned_to: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    include_completed: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Get scheduled tasks with filtering"""
    query = {}
    
    if status:
        query["status"] = status
    elif not include_completed:
        query["status"] = {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]}
    
    if priority:
        query["priority"] = priority
    if assigned_to:
        query["assigned_technician_id"] = assigned_to
    if from_date:
        query["due_date"] = {"$gte": from_date}
    if to_date:
        if "due_date" in query:
            query["due_date"]["$lte"] = to_date
        else:
            query["due_date"] = {"$lte": to_date}
    
    # If equipment_type_id specified, get programs first
    if equipment_type_id:
        programs = await db.maintenance_programs.find(
            {"equipment_type_id": equipment_type_id},
            {"id": 1}
        ).to_list(1000)
        program_ids = [p["id"] for p in programs]
        query["maintenance_program_id"] = {"$in": program_ids}
    
    tasks = await db.scheduled_tasks.find(query, {"_id": 0}).sort("due_date", 1).to_list(1000)
    
    # Add overdue flag
    today = datetime.utcnow().date().isoformat()
    for task in tasks:
        task["is_overdue"] = task.get("due_date", "") < today and task.get("status") not in ["completed", "cancelled"]
    
    return {
        "tasks": tasks,
        "total": len(tasks)
    }


@router.get("/tasks/daily-planner")
async def get_daily_planner(
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get tasks for daily planner view"""
    if not date:
        date = datetime.utcnow().date().isoformat()
    
    today = datetime.utcnow().date().isoformat()
    tomorrow = (datetime.utcnow().date() + timedelta(days=1)).isoformat()
    
    # Get overdue tasks
    overdue_tasks = await db.scheduled_tasks.find({
        "due_date": {"$lt": today},
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]}
    }, {"_id": 0}).sort("priority", -1).to_list(100)
    
    # Get tasks due today
    today_tasks = await db.scheduled_tasks.find({
        "due_date": today,
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]}
    }, {"_id": 0}).sort("priority", -1).to_list(100)
    
    # Get tasks due tomorrow
    tomorrow_tasks = await db.scheduled_tasks.find({
        "due_date": tomorrow,
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]}
    }, {"_id": 0}).sort("priority", -1).to_list(100)
    
    # Mark overdue
    for task in overdue_tasks:
        task["is_overdue"] = True
    
    return {
        "date": date,
        "overdue": {
            "tasks": overdue_tasks,
            "count": len(overdue_tasks)
        },
        "today": {
            "tasks": today_tasks,
            "count": len(today_tasks)
        },
        "tomorrow": {
            "tasks": tomorrow_tasks,
            "count": len(tomorrow_tasks)
        }
    }


@router.get("/tasks/weekly-planner")
async def get_weekly_planner(
    start_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get tasks for weekly planner view"""
    if not start_date:
        # Default to start of current week (Monday)
        today = datetime.utcnow().date()
        start = today - timedelta(days=today.weekday())
    else:
        start = datetime.fromisoformat(start_date).date()
    
    end = start + timedelta(days=6)
    
    # Get all tasks for the week
    tasks = await db.scheduled_tasks.find({
        "planned_date": {"$gte": start.isoformat(), "$lte": end.isoformat()},
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]}
    }, {"_id": 0}).to_list(500)
    
    # Group by day
    days = {}
    for i in range(7):
        day = (start + timedelta(days=i)).isoformat()
        days[day] = {
            "date": day,
            "day_name": (start + timedelta(days=i)).strftime("%A"),
            "tasks": [],
            "total_hours": 0
        }
    
    today = datetime.utcnow().date().isoformat()
    
    for task in tasks:
        planned = task.get("planned_date")
        if planned in days:
            task["is_overdue"] = task.get("due_date", "") < today
            days[planned]["tasks"].append(task)
            days[planned]["total_hours"] += task.get("estimated_hours", 1.0)
    
    # Get technician capacity
    technicians = await db.technician_capacity.find({"is_active": True}, {"_id": 0}).to_list(100)
    
    return {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "days": list(days.values()),
        "technicians": technicians
    }


@router.patch("/tasks/{task_id}")
async def update_task(
    task_id: str,
    request: UpdateTaskStatusRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update a scheduled task"""
    task = await db.scheduled_tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    update_data = {"updated_at": datetime.utcnow().isoformat()}
    
    if request.status:
        update_data["status"] = request.status.value
        if request.status == TaskStatus.IN_PROGRESS:
            update_data["started_at"] = datetime.utcnow().isoformat()
    
    if request.assigned_technician_id is not None:
        update_data["assigned_technician_id"] = request.assigned_technician_id
        update_data["assigned_technician_name"] = request.assigned_technician_name
    
    if request.planned_date is not None:
        update_data["planned_date"] = request.planned_date
    
    if request.priority is not None:
        update_data["priority"] = request.priority.value
    
    if request.findings is not None:
        update_data["findings"] = request.findings
    
    if request.notes is not None:
        update_data["notes"] = request.notes
    
    if request.actual_hours is not None:
        update_data["actual_hours"] = request.actual_hours
    
    await db.scheduled_tasks.update_one(
        {"id": task_id},
        {"$set": update_data}
    )
    
    return {"message": "Task updated", "task_id": task_id}


@router.post("/tasks/{task_id}/complete")
async def complete_task(
    task_id: str,
    request: CompleteTaskRequest,
    current_user: dict = Depends(get_current_user)
):
    """Complete a scheduled task"""
    task = await db.scheduled_tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    now = datetime.utcnow().isoformat()
    today = datetime.utcnow().date().isoformat()
    
    # Update task
    await db.scheduled_tasks.update_one(
        {"id": task_id},
        {"$set": {
            "status": TaskStatus.COMPLETED.value,
            "completed_at": now,
            "actual_hours": request.actual_hours,
            "findings": request.findings,
            "notes": request.observations,
            "updated_at": now
        }}
    )
    
    # Create history record
    history = MaintenanceHistory(
        equipment_id=task.get("equipment_id"),
        equipment_name=task.get("equipment_name"),
        equipment_tag=task.get("equipment_tag"),
        task_name=task.get("task_name"),
        task_type=task.get("task_type"),
        scheduled_task_id=task_id,
        maintenance_program_id=task.get("maintenance_program_id"),
        completion_date=today,
        technician_id=task.get("assigned_technician_id"),
        technician_name=task.get("assigned_technician_name"),
        actual_hours=request.actual_hours,
        findings=request.findings,
        observations=request.observations,
        failure_observed=request.failure_observed,
        strategy_id=task.get("strategy_id"),
        strategy_version=task.get("strategy_version"),
        failure_mode_id=task.get("failure_mode_id")
    )
    
    await db.maintenance_history.insert_one(history.model_dump())
    
    # Update maintenance program - calculate next due date
    program = await db.maintenance_programs.find_one({
        "id": task.get("maintenance_program_id")
    })
    
    if program:
        freq_days = program.get("frequency_days", 30)
        next_due = (datetime.utcnow().date() + timedelta(days=freq_days)).isoformat()
        
        await db.maintenance_programs.update_one(
            {"id": program["id"]},
            {"$set": {
                "last_completion_date": today,
                "next_due_date": next_due,
                "updated_at": now
            }}
        )
    
    return {
        "message": "Task completed",
        "task_id": task_id,
        "next_due_date": next_due if program else None
    }


@router.post("/tasks/{task_id}/defer")
async def defer_task(
    task_id: str,
    request: DeferTaskRequest,
    current_user: dict = Depends(get_current_user)
):
    """Defer a scheduled task"""
    task = await db.scheduled_tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    await db.scheduled_tasks.update_one(
        {"id": task_id},
        {"$set": {
            "status": TaskStatus.DEFERRED.value,
            "due_date": request.new_due_date,
            "planned_date": request.new_due_date,
            "notes": f"Deferred: {request.reason}",
            "updated_at": datetime.utcnow().isoformat()
        }}
    )
    
    return {"message": "Task deferred", "task_id": task_id, "new_due_date": request.new_due_date}


# ============= Timeline View =============

@router.get("/timeline")
async def get_timeline(
    equipment_type_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get timeline view of scheduled tasks"""
    if not start_date:
        start_date = datetime.utcnow().date().isoformat()
    if not end_date:
        end_date = (datetime.utcnow().date() + timedelta(days=30)).isoformat()
    
    query = {
        "due_date": {"$gte": start_date, "$lte": end_date},
        "status": {"$nin": [TaskStatus.CANCELLED.value]}
    }
    
    if equipment_type_id:
        programs = await db.maintenance_programs.find(
            {"equipment_type_id": equipment_type_id},
            {"id": 1}
        ).to_list(1000)
        program_ids = [p["id"] for p in programs]
        query["maintenance_program_id"] = {"$in": program_ids}
    
    tasks = await db.scheduled_tasks.find(query, {"_id": 0}).sort("due_date", 1).to_list(1000)
    
    # Group by equipment
    equipment_timeline = {}
    today = datetime.utcnow().date().isoformat()
    
    for task in tasks:
        equip_id = task.get("equipment_id")
        if equip_id not in equipment_timeline:
            equipment_timeline[equip_id] = {
                "equipment_id": equip_id,
                "equipment_name": task.get("equipment_name"),
                "equipment_tag": task.get("equipment_tag"),
                "tasks": []
            }
        
        task["is_overdue"] = task.get("due_date", "") < today and task.get("status") != "completed"
        equipment_timeline[equip_id]["tasks"].append(task)
    
    return {
        "start_date": start_date,
        "end_date": end_date,
        "timeline": list(equipment_timeline.values()),
        "total_tasks": len(tasks)
    }


# ============= Dashboard / KPIs =============

@router.get("/dashboard")
async def get_scheduler_dashboard(
    equipment_type_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get scheduler dashboard KPIs"""
    today = datetime.utcnow().date().isoformat()
    week_end = (datetime.utcnow().date() + timedelta(days=7)).isoformat()
    
    base_query = {}
    if equipment_type_id:
        programs = await db.maintenance_programs.find(
            {"equipment_type_id": equipment_type_id},
            {"id": 1}
        ).to_list(1000)
        program_ids = [p["id"] for p in programs]
        base_query["maintenance_program_id"] = {"$in": program_ids}
    
    # Backlog metrics
    open_query = {**base_query, "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]}}
    overdue_query = {**base_query, "due_date": {"$lt": today}, "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]}}
    upcoming_query = {**base_query, "due_date": {"$gte": today, "$lte": week_end}, "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]}}
    
    open_count = await db.scheduled_tasks.count_documents(open_query)
    overdue_count = await db.scheduled_tasks.count_documents(overdue_query)
    upcoming_count = await db.scheduled_tasks.count_documents(upcoming_query)
    
    # Compliance - last 30 days
    month_ago = (datetime.utcnow().date() - timedelta(days=30)).isoformat()
    completed_on_time = await db.scheduled_tasks.count_documents({
        **base_query,
        "status": TaskStatus.COMPLETED.value,
        "completed_at": {"$gte": month_ago},
        "$expr": {"$lte": ["$completed_at", "$due_date"]}
    })
    
    total_completed = await db.scheduled_tasks.count_documents({
        **base_query,
        "status": TaskStatus.COMPLETED.value,
        "completed_at": {"$gte": month_ago}
    })
    
    compliance_rate = (completed_on_time / total_completed * 100) if total_completed > 0 else 100
    
    # Priority breakdown
    priority_breakdown = await db.scheduled_tasks.aggregate([
        {"$match": open_query},
        {"$group": {"_id": "$priority", "count": {"$sum": 1}}}
    ]).to_list(10)
    
    return {
        "backlog": {
            "open_tasks": open_count,
            "overdue_tasks": overdue_count,
            "upcoming_tasks": upcoming_count
        },
        "compliance": {
            "rate": round(compliance_rate, 1),
            "completed_on_time": completed_on_time,
            "total_completed": total_completed
        },
        "priority_breakdown": {p["_id"]: p["count"] for p in priority_breakdown}
    }


# ============= Technician Capacity =============

@router.get("/technicians")
async def get_technicians(
    current_user: dict = Depends(get_current_user)
):
    """Get all technicians and their capacity"""
    technicians = await db.technician_capacity.find({"is_active": True}, {"_id": 0}).to_list(100)
    return {"technicians": technicians}


@router.post("/technicians")
async def create_technician(
    technician: TechnicianCapacity,
    current_user: dict = Depends(get_current_user)
):
    """Create a new technician capacity record"""
    await db.technician_capacity.insert_one(technician.model_dump())
    return {"message": "Technician created", "id": technician.id}



# ============= AI Maintenance Planner =============

@router.post("/ai-plan")
async def ai_plan_tasks(
    request: AIScheduleRequest = None,
    current_user: dict = Depends(get_current_user)
):
    """
    AI Maintenance Planner: optimizes task assignments and planned dates
    using OpenAI gpt-4o via Emergent LLM key. Returns recommendations with
    explicit reasoning per task.
    """
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except ImportError:
        raise HTTPException(status_code=500, detail="emergentintegrations library not installed")

    emergent_key = os.environ.get("EMERGENT_LLM_KEY")
    if not emergent_key:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")

    if request is None:
        request = AIScheduleRequest(
            start_date=datetime.utcnow().date().isoformat(),
            end_date=(datetime.utcnow().date() + timedelta(days=14)).isoformat()
        )

    # Fetch open scheduled tasks in window
    task_query = {
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
        "due_date": {"$lte": request.end_date}
    }
    tasks = await db.scheduled_tasks.find(task_query, {"_id": 0}).to_list(200)

    if not tasks:
        return {
            "message": "No open tasks to plan",
            "recommendations": [],
            "summary": "There are no open scheduled tasks in the planning window. Run the scheduler first.",
        }

    # Fetch technicians
    tech_query = {"is_active": True}
    if request.technician_ids:
        tech_query["id"] = {"$in": request.technician_ids}
    technicians = await db.technician_capacity.find(tech_query, {"_id": 0}).to_list(100)

    # Build compact context for the AI
    today = datetime.utcnow().date().isoformat()
    tasks_context = []
    for t in tasks[:50]:  # Cap to 50 tasks to fit context
        tasks_context.append({
            "id": t.get("id"),
            "task_name": t.get("task_name"),
            "equipment_name": t.get("equipment_name"),
            "equipment_tag": t.get("equipment_tag"),
            "priority": t.get("priority"),
            "due_date": t.get("due_date"),
            "estimated_hours": t.get("estimated_hours", 1.0),
            "is_overdue": (t.get("due_date") or today) < today,
            "task_type": t.get("task_type"),
            "currently_assigned": t.get("assigned_technician_name"),
        })

    techs_context = [{
        "id": tech.get("id"),
        "name": tech.get("name"),
        "weekly_hours": tech.get("weekly_available_hours", 40),
        "daily_hours": tech.get("daily_available_hours", 8),
        "disciplines": tech.get("disciplines", []),
        "skills": tech.get("skills", []),
    } for tech in technicians]

    system_message = (
        "You are an industrial maintenance planning expert. Given a set of open "
        "maintenance tasks and available technicians with their daily/weekly capacity, "
        "produce a balanced optimised plan. For each task you must: "
        "1) assign a technician (or leave null if none suitable / no technicians available), "
        "2) propose a planned_date between start_date and end_date, "
        "3) provide explicit short reasoning (criticality, due-date pressure, capacity, skill fit). "
        "Respect daily capacity: never exceed a technician's daily_hours on any day. "
        "Prioritise overdue and critical/high priority tasks earliest. Return ONLY valid JSON "
        "matching this schema: "
        '{"summary": "<2-3 sentence overall plan rationale>", '
        '"recommendations": [{"task_id": "...", "assigned_technician_id": "..." | null, '
        '"assigned_technician_name": "..." | null, "planned_date": "YYYY-MM-DD", '
        '"reasoning": "..."}]} '
        "Do NOT wrap in markdown code fences."
    )

    user_payload = {
        "today": today,
        "start_date": request.start_date,
        "end_date": request.end_date,
        "tasks": tasks_context,
        "technicians": techs_context,
    }

    session_id = f"ai-plan-{uuid.uuid4()}"
    chat = LlmChat(
        api_key=emergent_key,
        session_id=session_id,
        system_message=system_message,
    ).with_model("openai", "gpt-4o")

    try:
        response_text = await chat.send_message(
            UserMessage(text=json.dumps(user_payload))
        )
    except Exception as e:
        logger.exception("AI planner LLM call failed")
        raise HTTPException(status_code=502, detail=f"AI planner failed: {str(e)}")

    # Parse JSON response (strip code fences if present)
    cleaned = response_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```", 2)[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip().rstrip("`").strip()

    try:
        parsed = json.loads(cleaned)
    except Exception as e:
        logger.error(f"Failed to parse AI response: {response_text[:500]}")
        raise HTTPException(
            status_code=502,
            detail=f"AI returned non-JSON response: {str(e)}"
        )

    recommendations = parsed.get("recommendations", [])
    summary = parsed.get("summary", "")

    return {
        "message": "AI plan generated",
        "summary": summary,
        "recommendations": recommendations,
        "tasks_analyzed": len(tasks_context),
        "technicians_considered": len(techs_context),
    }


@router.post("/ai-plan/apply")
async def apply_ai_plan(
    recommendations: List[dict],
    current_user: dict = Depends(get_current_user)
):
    """Apply selected AI recommendations to scheduled tasks."""
    if not recommendations:
        raise HTTPException(status_code=400, detail="No recommendations provided")

    applied = 0
    now = datetime.utcnow().isoformat()
    for rec in recommendations:
        task_id = rec.get("task_id")
        if not task_id:
            continue
        update_data = {
            "updated_at": now,
            "ai_scheduled": True,
            "ai_reasoning": rec.get("reasoning"),
        }
        if rec.get("planned_date"):
            update_data["planned_date"] = rec["planned_date"]
        if rec.get("assigned_technician_id"):
            update_data["assigned_technician_id"] = rec["assigned_technician_id"]
            update_data["assigned_technician_name"] = rec.get("assigned_technician_name")
            update_data["status"] = TaskStatus.ASSIGNED.value

        result = await db.scheduled_tasks.update_one(
            {"id": task_id},
            {"$set": update_data}
        )
        if result.modified_count > 0:
            applied += 1

    return {"message": "AI plan applied", "tasks_updated": applied}
