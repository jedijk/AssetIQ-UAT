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

    from services.apply_strategy_service import apply_strategy_to_equipment

    request = ApplyStrategyRequest(equipment_ids=list(equipment_ids), run_async=False)
    result = await apply_strategy_to_equipment(
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


async def handle_executive_kpi_refresh(job: dict) -> dict:
    """Refresh materialized executive reliability KPI snapshots for a user."""
    payload = job.get("payload") or {}
    user = payload.get("user")
    if not user:
        return {"status": "skipped", "reason": "payload.user required"}

    from services.executive_kpi_materializer import refresh_executive_kpis

    owner_id = payload.get("owner_id") or user.get("owner_id") or user.get("id")
    result = await refresh_executive_kpis(user, owner_id)
    logger.info(
        "executive_kpi_refresh tenant=%s user=%s generated_at=%s",
        user.get("company_id") or user.get("organization_id"),
        user.get("id"),
        result.get("generated_at"),
    )
    return {"status": "ok", "generated_at": result.get("generated_at")}


async def handle_process_domain_event_outbox(job: dict) -> dict:
    """Drain domain event outbox batch (projection worker job type)."""
    from workers.event_outbox_processor import process_outbox_batch

    payload = job.get("payload") or {}
    batch_size = int(payload.get("batch_size", 10))
    processed = await process_outbox_batch(batch_size)
    return {"status": "ok", "processed": processed}


async def handle_run_scheduler(job: dict) -> dict:
    """Run maintenance scheduler from a persisted background_jobs payload."""
    payload = job.get("payload") or {}
    equipment_type_id = payload.get("equipment_type_id")
    planning_horizon_days = payload.get("planning_horizon_days")

    user_id = job.get("user_id")
    current_user: dict = {"id": user_id, "role": "admin"}
    if user_id:
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if user:
            current_user = user

    from models.maintenance_scheduler import RunSchedulerRequest
    from services.maintenance_scheduler_run import run_scheduler_impl

    request = RunSchedulerRequest(
        equipment_type_id=equipment_type_id,
        planning_horizon_days=planning_horizon_days,
        run_async=False,
    )
    result = await run_scheduler_impl(request, current_user)
    if isinstance(result, dict):
        return result
    return {"status": "completed"}


async def handle_scan_uploaded_file(job: dict) -> dict:
    """Run secure upload scan stub (Phase 2 minimal)."""
    payload = job.get("payload") or {}
    file_id = payload.get("file_id")
    if not file_id:
        raise ValueError("scan_uploaded_file job missing file_id")

    from workers.scan_uploaded_file import scan_uploaded_file

    result = await scan_uploaded_file(file_id)
    if isinstance(result, dict):
        return result
    return {"status": "completed"}


async def handle_upload_cleanup(job: dict) -> dict:
    """Delete abandoned temp uploads and expired quarantined files."""
    from workers.upload_cleanup import run_upload_cleanup

    payload = job.get("payload") or {}
    return await run_upload_cleanup(
        temp_retention_hours=int(payload.get("temp_retention_hours", 2)),
        quarantine_retention_days=int(payload.get("quarantine_retention_days", 30)),
        dry_run=bool(payload.get("dry_run", False)),
    )


JOB_HANDLERS: Dict[str, Callable[..., Any]] = {
    "apply_strategy": handle_apply_strategy,
    "run_scheduler": handle_run_scheduler,
    "pm_import_ai_review": handle_pm_import_ai_review,
    "asset_health_daily_refresh": handle_asset_health_daily_refresh,
    "reliability_snapshots_daily_refresh": handle_reliability_snapshots_daily_refresh,
    "executive_kpi_refresh": handle_executive_kpi_refresh,
    "process_domain_event_outbox": handle_process_domain_event_outbox,
    "scan_uploaded_file": handle_scan_uploaded_file,
    "upload_cleanup": handle_upload_cleanup,
}
