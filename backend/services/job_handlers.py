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


async def handle_asset_health_daily_refresh(job: dict) -> dict:
    """Refresh materialized asset_health_documents for all equipment."""
    payload = job.get("payload") or {}
    snapshot_date = payload.get("snapshot_date")
    equipment_ids = payload.get("equipment_ids")

    from services.asset_health_materializer import refresh_asset_health_documents

    result = await refresh_asset_health_documents(
        snapshot_date=snapshot_date,
        equipment_ids=equipment_ids,
    )
    logger.info(
        "asset_health_daily_refresh upserted=%s snapshot_date=%s",
        result.get("upserted"),
        result.get("snapshot_date"),
    )
    return result


async def handle_reliability_snapshots_daily_refresh(job: dict) -> dict:
    """Materialize reliability_snapshots for all equipment (Digital Twin DT-1)."""
    payload = job.get("payload") or {}
    equipment_ids = payload.get("equipment_ids")
    snapshot_at_raw = payload.get("snapshot_at")

    from datetime import datetime, timezone

    from services.reliability_snapshot_service import refresh_reliability_snapshots

    snapshot_at = None
    if snapshot_at_raw:
        snapshot_at = datetime.fromisoformat(str(snapshot_at_raw).replace("Z", "+00:00"))
        if snapshot_at.tzinfo is None:
            snapshot_at = snapshot_at.replace(tzinfo=timezone.utc)

    result = await refresh_reliability_snapshots(
        snapshot_at=snapshot_at,
        equipment_ids=equipment_ids,
    )
    logger.info(
        "reliability_snapshots_daily_refresh upserted=%s snapshot_at=%s",
        result.get("upserted"),
        result.get("snapshot_at"),
    )
    return result


JOB_HANDLERS: Dict[str, Callable[..., Any]] = {
    "apply_strategy": handle_apply_strategy,
    "pm_import_ai_review": handle_pm_import_ai_review,
    "asset_health_daily_refresh": handle_asset_health_daily_refresh,
    "reliability_snapshots_daily_refresh": handle_reliability_snapshots_daily_refresh,
}
