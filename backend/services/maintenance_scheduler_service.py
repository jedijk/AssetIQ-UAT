"""Maintenance scheduler service — read queries, task lifecycle, technicians, programs."""
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException

from database import db
from models.maintenance_scheduler import (
    CompleteTaskRequest,
    DeferTaskRequest,
    MaintenanceHistory,
    TaskStatus,
    TechnicianCapacity,
    UpdateTaskStatusRequest,
)
from services.maintenance_scheduler_scope import (
    ensure_imported_pm_tasks_scheduled,
    scheduler_scoped,
    scope_scheduled_tasks_query,
)
from services.maintenance_scheduler_disabled import (
    PROGRAM_DISABLE_CANCEL_NOTES,
    annotate_disabled_in_program,
    annotate_scheduled_task_sources,
    load_inactive_program_task_keys,
)
from services.tenant_schema import tenant_id_from_user, with_tenant_id

CORRECTIVE_TASK_TYPES = ("reactive", "corrective")
logger = logging.getLogger(__name__)


def _json_safe_value(value: Any) -> Any:
    """Recursively coerce BSON values for JSON responses."""
    try:
        from bson import ObjectId
    except ImportError:
        ObjectId = ()  # type: ignore[misc, assignment]

    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc).isoformat()
        return value.isoformat()
    if ObjectId and isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, dict):
        return {str(k): _json_safe_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe_value(v) for v in value]
    return str(value)


def _json_safe_tasks(tasks: list) -> list:
    return [_json_safe_value(task) for task in tasks]


def _empty_dashboard_kpis(week_end: Optional[str] = None) -> dict:
    if week_end is None:
        week_end = (datetime.utcnow().date() + timedelta(days=7)).isoformat()
    return {
        "backlog": {"open_tasks": 0, "overdue_tasks": 0, "upcoming_tasks": 0},
        "compliance": {"rate": 100.0, "completed_on_time": 0, "total_completed": 0},
        "calculations": {
            "open_tasks": (
                "Count of scheduled preventive tasks that are not completed or cancelled "
                "(reactive/corrective excluded)."
            ),
            "overdue_tasks": (
                "Open preventive tasks with due date before today "
                "(reactive/corrective excluded)."
            ),
            "upcoming_tasks": (
                f"Open preventive tasks due between today and {week_end} "
                "(reactive/corrective excluded)."
            ),
            "compliance": "No completed tasks in the last 30 days — shown as 100%.",
        },
        "priority_breakdown": {},
    }


async def get_dashboard_kpis(
    user: dict,
    equipment_type_id: Optional[str] = None,
) -> dict:
    """Scheduler dashboard KPIs."""
    today = datetime.utcnow().date().isoformat()
    week_end = (datetime.utcnow().date() + timedelta(days=7)).isoformat()

    base_query = {}
    try:
        await scope_scheduled_tasks_query(base_query, equipment_type_id, user=user)
    except Exception as exc:
        logger.warning("Scheduler scope query failed: %s", exc)
        return _empty_dashboard_kpis(week_end)

    if base_query.get("_id") == {"$exists": False}:
        return _empty_dashboard_kpis(week_end)

    program_filter = base_query.get("maintenance_program_id", {})
    if isinstance(program_filter, dict) and program_filter.get("$in") == []:
        return _empty_dashboard_kpis(week_end)

    base_query["task_type"] = {"$nin": list(CORRECTIVE_TASK_TYPES)}

    open_query = {
        **base_query,
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
    }
    overdue_query = {
        **base_query,
        "due_date": {"$lt": today},
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
    }
    upcoming_query = {
        **base_query,
        "due_date": {"$gte": today, "$lte": week_end},
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
    }

    open_count = await db.scheduled_tasks.count_documents(open_query)
    overdue_count = await db.scheduled_tasks.count_documents(overdue_query)
    upcoming_count = await db.scheduled_tasks.count_documents(upcoming_query)

    month_ago = (datetime.utcnow().date() - timedelta(days=30)).isoformat()
    try:
        completed_on_time = await db.scheduled_tasks.count_documents({
            **base_query,
            "status": TaskStatus.COMPLETED.value,
            "completed_at": {"$gte": month_ago},
            "$expr": {"$lte": ["$completed_at", "$due_date"]},
        })
    except Exception:
        completed_on_time = 0
    total_completed = await db.scheduled_tasks.count_documents({
        **base_query,
        "status": TaskStatus.COMPLETED.value,
        "completed_at": {"$gte": month_ago},
    })

    compliance_rate = (completed_on_time / total_completed * 100) if total_completed > 0 else 100
    priority_breakdown = []
    try:
        priority_breakdown = await db.scheduled_tasks.aggregate([
            {"$match": open_query},
            {"$group": {"_id": "$priority", "count": {"$sum": 1}}},
        ]).to_list(10)
    except Exception as exc:
        logger.warning("Scheduler priority breakdown aggregate failed: %s", exc)

    return {
        "backlog": {
            "open_tasks": open_count,
            "overdue_tasks": overdue_count,
            "upcoming_tasks": upcoming_count,
        },
        "compliance": {
            "rate": round(compliance_rate, 1),
            "completed_on_time": completed_on_time,
            "total_completed": total_completed,
        },
        "calculations": {
            "open_tasks": (
                "Count of scheduled preventive tasks that are not completed or cancelled "
                "(reactive/corrective excluded)."
            ),
            "overdue_tasks": (
                "Open preventive tasks with due date before today "
                "(reactive/corrective excluded)."
            ),
            "upcoming_tasks": (
                f"Open preventive tasks due between today and {week_end} "
                "(reactive/corrective excluded)."
            ),
            "compliance": (
                f"Tasks completed on or before due date in last 30 days ÷ all completed in last 30 days "
                f"= {completed_on_time} ÷ {total_completed} × 100 = {round(compliance_rate, 1)}%"
                if total_completed > 0
                else "No completed tasks in the last 30 days — shown as 100%."
            ),
        },
        "priority_breakdown": {p["_id"]: p["count"] for p in priority_breakdown},
    }


async def get_timeline(
    user: dict,
    equipment_type_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> dict:
    """Timeline view grouped by equipment."""
    await ensure_imported_pm_tasks_scheduled(equipment_type_id, read_only=True)

    if not start_date:
        start_date = datetime.utcnow().date().isoformat()
    if not end_date:
        end_date = (datetime.utcnow().date() + timedelta(days=90)).isoformat()

    query = {
        "due_date": {"$gte": start_date, "$lte": end_date},
        "task_type": {"$nin": list(CORRECTIVE_TASK_TYPES)},
        "$or": [
            {"status": {"$nin": [TaskStatus.CANCELLED.value]}},
            {
                "status": TaskStatus.CANCELLED.value,
                "notes": {"$in": list(PROGRAM_DISABLE_CANCEL_NOTES)},
            },
        ],
    }
    await scope_scheduled_tasks_query(query, equipment_type_id, user=user)

    tasks = await db.scheduled_tasks.find(query, {"_id": 0}).sort("due_date", 1).to_list(1000)

    equipment_ids = list({t.get("equipment_id") for t in tasks if t.get("equipment_id")})
    inactive_keys = await load_inactive_program_task_keys(equipment_ids)
    annotate_disabled_in_program(tasks, inactive_keys)
    await annotate_scheduled_task_sources(tasks)

    equipment_timeline = {}
    today = datetime.utcnow().date().isoformat()

    for task in tasks:
        equip_id = task.get("equipment_id")
        if equip_id not in equipment_timeline:
            equipment_timeline[equip_id] = {
                "equipment_id": equip_id,
                "equipment_name": task.get("equipment_name"),
                "equipment_tag": task.get("equipment_tag"),
                "tasks": [],
            }
        task["is_overdue"] = (
            task.get("due_date", "") < today and task.get("status") != "completed"
        )
        equipment_timeline[equip_id]["tasks"].append(task)

    return {
        "start_date": start_date,
        "end_date": end_date,
        "timeline": _json_safe_tasks(list(equipment_timeline.values())),
        "total_tasks": len(tasks),
    }


async def list_scheduled_tasks(
    user: dict,
    *,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    equipment_type_id: Optional[str] = None,
    assigned_to: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    include_completed: bool = False,
) -> dict:
    """List scheduled tasks with filtering."""
    await ensure_imported_pm_tasks_scheduled(equipment_type_id, read_only=True)

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

    await scope_scheduled_tasks_query(query, equipment_type_id, user=user)

    tasks = await db.scheduled_tasks.find(query, {"_id": 0}).sort("due_date", 1).to_list(1000)
    tasks = [t for t in tasks if t.get("task_type") not in CORRECTIVE_TASK_TYPES]

    today = datetime.utcnow().date().isoformat()
    for task in tasks:
        task["is_overdue"] = (
            task.get("due_date", "") < today
            and task.get("status") not in ["completed", "cancelled"]
        )

    await annotate_scheduled_task_sources(tasks)

    return {"tasks": _json_safe_tasks(tasks), "total": len(tasks)}


async def get_daily_planner(
    user: dict,
    date: Optional[str] = None,
) -> dict:
    """Daily planner buckets (overdue, today, tomorrow)."""
    await ensure_imported_pm_tasks_scheduled(read_only=True)

    if not date:
        date = datetime.utcnow().date().isoformat()

    today = datetime.utcnow().date().isoformat()
    tomorrow = (datetime.utcnow().date() + timedelta(days=1)).isoformat()

    base_query = {
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
        "task_type": {"$nin": list(CORRECTIVE_TASK_TYPES)},
    }
    await scope_scheduled_tasks_query(base_query, None, user=user)

    overdue_tasks = await db.scheduled_tasks.find({
        **base_query,
        "due_date": {"$lt": today},
    }, {"_id": 0}).sort("priority", -1).to_list(100)

    today_tasks = await db.scheduled_tasks.find({
        **base_query,
        "due_date": today,
    }, {"_id": 0}).sort("priority", -1).to_list(100)

    tomorrow_tasks = await db.scheduled_tasks.find({
        **base_query,
        "due_date": tomorrow,
    }, {"_id": 0}).sort("priority", -1).to_list(100)

    for task in overdue_tasks:
        task["is_overdue"] = True

    all_planner_tasks = overdue_tasks + today_tasks + tomorrow_tasks
    await annotate_scheduled_task_sources(all_planner_tasks)

    return {
        "date": date,
        "overdue": {"tasks": _json_safe_tasks(overdue_tasks), "count": len(overdue_tasks)},
        "today": {"tasks": _json_safe_tasks(today_tasks), "count": len(today_tasks)},
        "tomorrow": {"tasks": _json_safe_tasks(tomorrow_tasks), "count": len(tomorrow_tasks)},
    }


async def get_weekly_planner(
    user: dict,
    start_date: Optional[str] = None,
) -> dict:
    """Weekly planner grouped by planned date."""
    await ensure_imported_pm_tasks_scheduled(read_only=True)

    if not start_date:
        today_date = datetime.utcnow().date()
        start = today_date - timedelta(days=today_date.weekday())
    else:
        start = datetime.fromisoformat(start_date).date()

    end = start + timedelta(days=6)

    task_query = {
        "planned_date": {"$gte": start.isoformat(), "$lte": end.isoformat()},
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
        "task_type": {"$nin": list(CORRECTIVE_TASK_TYPES)},
    }
    await scope_scheduled_tasks_query(task_query, None, user=user)

    tasks = await db.scheduled_tasks.find(task_query, {"_id": 0}).to_list(500)

    days = {}
    for i in range(7):
        day = (start + timedelta(days=i)).isoformat()
        days[day] = {
            "date": day,
            "day_name": (start + timedelta(days=i)).strftime("%A"),
            "tasks": [],
            "total_hours": 0,
        }

    today = datetime.utcnow().date().isoformat()
    for task in tasks:
        planned = task.get("planned_date")
        if planned in days:
            task["is_overdue"] = task.get("due_date", "") < today
            days[planned]["tasks"].append(task)
            days[planned]["total_hours"] += task.get("estimated_hours", 1.0)

    await annotate_scheduled_task_sources(tasks)

    technicians = await db.technician_capacity.find(
        scheduler_scoped(user, {"is_active": True}),
        {"_id": 0},
    ).to_list(100)

    safe_days = []
    for day in days.values():
        safe_day = dict(day)
        safe_day["tasks"] = _json_safe_tasks(day.get("tasks") or [])
        safe_days.append(safe_day)

    return {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "days": safe_days,
        "technicians": _json_safe_tasks(technicians),
    }


def _task_tenant_id(task: dict, user: dict) -> Optional[str]:
    return task.get("tenant_id") or tenant_id_from_user(user)


async def _dispatch_scheduled_task_graph(
    task: dict,
    event: str,
    user: dict,
    metadata: Optional[dict] = None,
) -> None:
    from services.reliability_graph import dispatch_graph_sync

    await dispatch_graph_sync(
        "sync_edges_for_scheduled_task",
        f"scheduled_task_{event}_{task.get('id', 'unknown')}",
        scheduled_task=task,
        event=event,
        tenant_id=_task_tenant_id(task, user),
        metadata=metadata or {},
    )


async def update_scheduled_task(
    user: dict,
    task_id: str,
    request: UpdateTaskStatusRequest,
) -> dict:
    task = await db.scheduled_tasks.find_one(scheduler_scoped(user, {"id": task_id}))
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
        scheduler_scoped(user, {"id": task_id}),
        {"$set": update_data},
    )

    if request.status in (TaskStatus.COMPLETED, TaskStatus.CANCELLED):
        event = "completed" if request.status == TaskStatus.COMPLETED else "cancelled"
        updated = {**task, **update_data, "status": request.status.value}
        await _dispatch_scheduled_task_graph(updated, event, user)

    return {"message": "Task updated", "task_id": task_id}


async def complete_scheduled_task(
    user: dict,
    task_id: str,
    request: CompleteTaskRequest,
) -> dict:
    task = await db.scheduled_tasks.find_one(scheduler_scoped(user, {"id": task_id}))
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    now = datetime.utcnow().isoformat()
    today = datetime.utcnow().date().isoformat()

    await db.scheduled_tasks.update_one(
        scheduler_scoped(user, {"id": task_id}),
        {"$set": {
            "status": TaskStatus.COMPLETED.value,
            "completed_at": now,
            "actual_hours": request.actual_hours,
            "findings": request.findings,
            "notes": request.observations,
            "updated_at": now,
        }},
    )

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
        failure_mode_id=task.get("failure_mode_id"),
    )

    await db.maintenance_history.insert_one(with_tenant_id(history.model_dump(), user))

    program_id = task.get("maintenance_program_id")
    next_due = None
    freq_days = 30

    program_v2 = await db.maintenance_programs_v2.find_one(
        scheduler_scoped(user, {"tasks.id": program_id}),
        {"_id": 0},
    )
    if program_v2:
        v2_task = next(
            (t for t in (program_v2.get("tasks") or []) if t.get("id") == program_id),
            None,
        )
        if v2_task:
            freq_days = int(v2_task.get("frequency_days") or 30)
        next_due = (datetime.utcnow().date() + timedelta(days=freq_days)).isoformat()
        await db.maintenance_programs_v2.update_one(
            scheduler_scoped(user, {"tasks.id": program_id}),
            {
                "$set": {
                    "tasks.$.last_completion_date": today,
                    "tasks.$.next_due_date": next_due,
                    "updated_at": now,
                }
            },
        )
        from services.maintenance_scheduling import schedule_program
        from services.scheduler_program_source import load_schedulable_programs

        rows = await load_schedulable_programs(equipment_ids=[task.get("equipment_id")])
        sched_row = next((r for r in rows if r.get("id") == program_id), None)
        if sched_row:
            sched_row = {**sched_row, "next_due_date": next_due}
            await schedule_program(sched_row)
    else:
        from services.scheduler_config import should_read_legacy_maintenance_programs

        program = None
        if should_read_legacy_maintenance_programs():
            program = await db.maintenance_programs.find_one(
                scheduler_scoped(user, {"id": program_id}),
            )

        if program:
            freq_days = program.get("frequency_days", 30)
            next_due = (datetime.utcnow().date() + timedelta(days=freq_days)).isoformat()

            await db.maintenance_programs.update_one(
                scheduler_scoped(user, {"id": program["id"]}),
                {"$set": {
                    "last_completion_date": today,
                    "next_due_date": next_due,
                    "updated_at": now,
                }},
            )

            from services.maintenance_scheduling import schedule_program

            refreshed = await db.maintenance_programs.find_one(
                scheduler_scoped(user, {"id": program["id"]}),
            )
            if refreshed:
                await schedule_program(refreshed)

    completed_task = {
        **task,
        "status": TaskStatus.COMPLETED.value,
        "completed_at": now,
    }
    await _dispatch_scheduled_task_graph(
        completed_task,
        "completed",
        user,
        metadata={
            "completed_at": now,
            "actual_hours": request.actual_hours,
            "failure_observed": request.failure_observed,
        },
    )

    if request.findings and request.findings.strip() and task.get("equipment_id"):
        from services.reliability_graph import _sync_finding_from_completion

        completion_id = f"st:{task_id}"
        await _sync_finding_from_completion(
            completion_id=completion_id,
            equipment_id=task["equipment_id"],
            source_type="scheduled_task",
            source_id=task_id,
            findings_text=request.findings.strip(),
            tenant_id=_task_tenant_id(task, user),
            completed_at=now,
        )

    return {
        "message": "Task completed",
        "task_id": task_id,
        "next_due_date": next_due,
    }


async def defer_scheduled_task(
    user: dict,
    task_id: str,
    request: DeferTaskRequest,
) -> dict:
    task = await db.scheduled_tasks.find_one(scheduler_scoped(user, {"id": task_id}))
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await db.scheduled_tasks.update_one(
        scheduler_scoped(user, {"id": task_id}),
        {"$set": {
            "status": TaskStatus.DEFERRED.value,
            "due_date": request.new_due_date,
            "planned_date": request.new_due_date,
            "notes": f"Deferred: {request.reason}",
            "updated_at": datetime.utcnow().isoformat(),
        }},
    )

    return {
        "message": "Task deferred",
        "task_id": task_id,
        "new_due_date": request.new_due_date,
    }


async def list_technicians(user: dict) -> dict:
    technicians = await db.technician_capacity.find(
        scheduler_scoped(user, {"is_active": True}),
        {"_id": 0},
    ).to_list(100)
    return {"technicians": technicians}


async def create_technician(user: dict, technician: TechnicianCapacity) -> dict:
    await db.technician_capacity.insert_one(with_tenant_id(technician.model_dump(), user))
    return {"message": "Technician created", "id": technician.id}


async def get_programs_summary(user: dict, equipment_type_id: str) -> dict:
    programs = await db.maintenance_programs_v2.find(
        scheduler_scoped(
            user,
            {"equipment_type_id": equipment_type_id, "status": {"$in": ["active", "draft"]}},
        ),
        {"_id": 0, "equipment_id": 1, "equipment_name": 1, "equipment_tag": 1, "tasks": 1},
    ).to_list(500)

    equipment_summary = []
    total_tasks = 0
    for prog in programs:
        active_tasks = [
            t for t in (prog.get("tasks") or [])
            if t.get("is_active", True)
        ]
        total_tasks += len(active_tasks)
        equipment_summary.append({
            "_id": prog.get("equipment_id"),
            "equipment_name": prog.get("equipment_name"),
            "equipment_tag": prog.get("equipment_tag"),
            "task_count": len(active_tasks),
        })

    today = datetime.utcnow().date().isoformat()
    overdue_count = await db.scheduled_tasks.count_documents(
        scheduler_scoped(
            user,
            {
                "equipment_type_id": equipment_type_id,
                "status": {"$nin": ["completed", "cancelled"]},
                "due_date": {"$lt": today},
            },
        )
    )

    return {
        "equipment_type_id": equipment_type_id,
        "equipment_count": len(equipment_summary),
        "total_program_tasks": total_tasks,
        "total_programs": total_tasks,
        "overdue_count": overdue_count,
        "equipment": equipment_summary,
        "equipment_summary": equipment_summary,
        "source": "maintenance_programs_v2",
    }
