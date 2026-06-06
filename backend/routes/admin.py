"""
Admin Routes - Admin-only endpoints for system management.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import asyncio
import logging

from database import db, ai_usage_tracker
from routes.auth import get_current_user
from services.ai_cost_guard import ai_cost_guard

logger = logging.getLogger(__name__)
router = APIRouter()


def require_admin(current_user: dict = Depends(get_current_user)):
    """Dependency to require admin or owner role."""
    if current_user.get("role") not in ["admin", "owner"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.get("/admin/ai-usage")
async def get_ai_usage(
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    installation_id: Optional[str] = Query(None, description="Filter by installation"),
    current_user: dict = Depends(require_admin)
):
    """
    Get AI token usage grouped by installation.
    Admin/Owner only.
    """
    usage_by_installation = await ai_usage_tracker.get_usage_by_installation(
        start_date=start_date,
        end_date=end_date,
        installation_id=installation_id
    )
    
    summary = await ai_usage_tracker.get_usage_summary(
        start_date=start_date,
        end_date=end_date
    )

    company_id = (
        current_user.get("company_id")
        or current_user.get("organization_id")
        or "default"
    )
    limits = ai_cost_guard.get_limits_and_usage(company_id)

    return {
        "installations": usage_by_installation,
        "summary": summary,
        "limits": limits,
    }


@router.get("/admin/ai-usage/daily")
async def get_ai_usage_daily(
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    installation_id: Optional[str] = Query(None, description="Filter by installation"),
    current_user: dict = Depends(require_admin)
):
    """
    Get daily AI token usage breakdown.
    Admin/Owner only.
    """
    daily_usage = await ai_usage_tracker.get_usage_by_date(
        start_date=start_date,
        end_date=end_date,
        installation_id=installation_id
    )
    
    return {
        "daily": daily_usage
    }


@router.get("/admin/ai-usage/summary")
async def get_ai_usage_summary(
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    current_user: dict = Depends(require_admin)
):
    """
    Get overall AI usage summary.
    Admin/Owner only.
    """
    summary = await ai_usage_tracker.get_usage_summary(
        start_date=start_date,
        end_date=end_date
    )
    
    return summary


@router.get("/admin/installations")
async def get_installations(
    current_user: dict = Depends(require_admin)
):
    """
    Get list of all installations (top-level equipment nodes).
    Admin/Owner only.
    """
    installations = await db.equipment_nodes.find(
        {"level": "installation"},
        {"_id": 0, "id": 1, "name": 1, "description": 1, "created_at": 1}
    ).to_list(100)
    
    return {"installations": installations}


@router.get("/admin/maintenance-readiness")
async def get_maintenance_readiness(
    current_user: dict = Depends(require_admin),
):
    """
    Read-only UAT maintenance cutover snapshot. Admin/Owner only.
    """
    from services.background_jobs import background_job_service
    from services.scheduler_config import (
        should_read_legacy_maintenance_programs,
        should_sync_legacy_maintenance_programs,
    )
    from services.worker_config import use_external_background_worker

    (
        strategy_needs_apply_count,
        active_strategies,
        v2_program_count,
        legacy_program_count,
        reliability_edges_total,
    ) = await asyncio.gather(
        db.equipment_type_strategies.count_documents({"strategy_needs_apply": True}),
        db.equipment_type_strategies.count_documents({"status": "active"}),
        db.maintenance_programs_v2.count_documents({}),
        db.maintenance_programs.count_documents({}),
        db.reliability_edges.count_documents({}),
    )

    background_jobs = await background_job_service.get_queue_health()

    return {
        "read_legacy_maintenance_programs": should_read_legacy_maintenance_programs(),
        "sync_legacy_maintenance_programs": should_sync_legacy_maintenance_programs(),
        "use_external_background_worker": use_external_background_worker(),
        "strategy_needs_apply_count": strategy_needs_apply_count,
        "active_strategies": active_strategies,
        "v2_program_count": v2_program_count,
        "legacy_program_count": legacy_program_count,
        "background_jobs": background_jobs,
        "reliability_edges_total": reliability_edges_total,
        "uat_gates_script": "backend/scripts/verify_uat_gates.py",
    }
