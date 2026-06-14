"""
Equipment Maintenance Programs:
- Apply maintenance strategy to selected equipment
- List programs (with filters)
- Programs summary per equipment type
"""
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from typing import Optional

from database import db

logger = logging.getLogger(__name__)
from auth import get_current_user, require_permission
from models.maintenance_scheduler import ApplyStrategyRequest
from services.apply_strategy_service import apply_strategy_to_equipment as _apply_strategy_to_equipment_impl
from services.background_jobs import background_job_service, JobStatus, tenant_id_from_user
from services.worker_config import use_external_background_worker

router = APIRouter()

_library_write = require_permission("library:write")

APPLY_STRATEGY_ASYNC_THRESHOLD = 5


@router.get("/jobs/{job_id}")
async def get_scheduler_job(
    job_id: str,
    current_user: dict = Depends(require_permission("scheduler:read")),
):
    """Poll status of a maintenance scheduler background job."""
    job = await background_job_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("user_id") and job["user_id"] != (
        current_user.get("id") or current_user.get("user_id")
    ):
        role = current_user.get("role")
        if role not in ("owner", "admin"):
            raise HTTPException(status_code=403, detail="Not allowed to view this job")
    return job


@router.post("/apply-strategy/{equipment_type_id}")
async def apply_strategy_to_equipment(
    equipment_type_id: str,
    request: ApplyStrategyRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(_library_write),
):
    """
    Apply maintenance strategy to selected equipment.
    Creates maintenance program records for each equipment-task combination.

    For large batches (>=5 equipment) or when run_async=true, returns immediately
    with a job_id to poll via GET /maintenance-scheduler/jobs/{job_id}.
    """
    use_async = request.run_async or len(request.equipment_ids) >= APPLY_STRATEGY_ASYNC_THRESHOLD
    if use_async:
        user_id = current_user.get("id") or current_user.get("user_id")
        tenant_id = tenant_id_from_user(current_user)
        job_payload = {
            "equipment_type_id": equipment_type_id,
            "equipment_count": len(request.equipment_ids),
            "equipment_ids": list(request.equipment_ids),
        }
        if use_external_background_worker():
            job_id = await background_job_service.enqueue_for_external_worker(
                "apply_strategy",
                user_id=user_id,
                payload=job_payload,
                max_retries=1,
                tenant_id=tenant_id,
            )
        else:
            job_id = await background_job_service.schedule_returning_job_id(
                background_tasks,
                "apply_strategy",
                _apply_strategy_to_equipment_impl,
                equipment_type_id,
                request,
                current_user,
                user_id=user_id,
                payload=job_payload,
                max_retries=1,
                tenant_id=tenant_id,
            )
        return {
            "status": JobStatus.PENDING.value,
            "job_id": job_id,
            "message": "Apply strategy queued",
            "equipment_count": len(request.equipment_ids),
            "worker_mode": "external" if use_external_background_worker() else "in_process",
        }

    try:
        return await _apply_strategy_to_equipment_impl(
            equipment_type_id, request, current_user
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "apply_strategy failed for equipment_type_id=%s", equipment_type_id
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to apply strategy: {exc}",
        ) from exc


@router.get("/programs")
async def get_maintenance_programs(
    equipment_type_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    is_active: bool = True,
    current_user: dict = Depends(require_permission("scheduler:read")),
):
    """Get schedulable maintenance program rows (canonical v2 source)."""
    from services.scheduler_program_source import load_schedulable_programs

    equipment_ids = [equipment_id] if equipment_id else None
    programs = await load_schedulable_programs(
        equipment_type_id=equipment_type_id,
        equipment_ids=equipment_ids,
    )
    if is_active:
        programs = [p for p in programs if p.get("is_active", True)]

    return {"programs": programs, "total": len(programs), "source": "v2"}


@router.get("/programs/{equipment_type_id}/summary")
async def get_programs_summary(
    equipment_type_id: str,
    current_user: dict = Depends(require_permission("scheduler:read")),
):
    """Get summary of maintenance programs for an equipment type (v2)."""
    programs = await db.maintenance_programs_v2.find(
        {"equipment_type_id": equipment_type_id, "status": {"$in": ["active", "draft"]}},
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
    overdue_count = await db.scheduled_tasks.count_documents({
        "equipment_type_id": equipment_type_id,
        "status": {"$nin": ["completed", "cancelled"]},
        "due_date": {"$lt": today},
    })

    return {
        "equipment_type_id": equipment_type_id,
        "equipment_count": len(equipment_summary),
        "total_program_tasks": total_tasks,
        # Backward-compatible fields for Maintenance Schedule UI (pre-v2 response shape).
        "total_programs": total_tasks,
        "overdue_count": overdue_count,
        "equipment": equipment_summary,
        "equipment_summary": equipment_summary,
        "source": "maintenance_programs_v2",
    }
