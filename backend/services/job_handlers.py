"""Registered handlers for durable background job workers."""
from __future__ import annotations

import logging
from typing import Any, Callable, Dict

from database import db
from models.maintenance_scheduler import ApplyStrategyRequest

logger = logging.getLogger(__name__)


async def handle_apply_strategy(job: dict) -> dict:
    """Replay Apply Strategy from a persisted background_jobs payload."""
    payload = job.get("payload") or {}
    equipment_type_id = payload.get("equipment_type_id")
    equipment_ids = payload.get("equipment_ids") or []
    if not equipment_type_id or not equipment_ids:
        raise ValueError("apply_strategy job missing equipment_type_id or equipment_ids")

    user_id = job.get("user_id")
    current_user: dict = {"id": user_id, "role": "admin"}
    if user_id:
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if user:
            current_user = user

    from routes.maintenance_scheduler.programs import _apply_strategy_to_equipment_impl

    request = ApplyStrategyRequest(equipment_ids=list(equipment_ids), run_async=False)
    result = await _apply_strategy_to_equipment_impl(
        equipment_type_id,
        request,
        current_user,
    )
    if isinstance(result, dict):
        return result
    return {"status": "completed"}


async def handle_pm_import_ai_review(job: dict) -> dict:
    """Run PM Import AI review for a session (external worker)."""
    payload = job.get("payload") or {}
    session_id = payload.get("session_id")
    if not session_id:
        raise ValueError("pm_import_ai_review job missing session_id")

    from services.pm_import_service import PMImportService

    service = PMImportService(db)
    result = await service.ai_review_accepted_tasks(session_id)
    if isinstance(result, dict):
        return result
    return {"status": "completed"}


JOB_HANDLERS: Dict[str, Callable[..., Any]] = {
    "apply_strategy": handle_apply_strategy,
    "pm_import_ai_review": handle_pm_import_ai_review,
}
