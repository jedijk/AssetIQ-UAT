"""
Executive Dashboard routes — orchestration only (Wave 5 convergence).
"""
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from auth import require_permission
from services.executive_dashboard_service import (
    ExecutiveDashboardResponse,
    get_or_compute_executive_dashboard,
)

router = APIRouter(prefix="/executive-dashboard", tags=["Executive Dashboard"])

_dashboard_read = require_permission("observations:read")


@router.get("")
async def get_executive_dashboard(
    period_days: int = 30,
    current_user: dict = Depends(_dashboard_read),
) -> ExecutiveDashboardResponse:
    """
    Executive dashboard: exposure metrics, KPI cards, waterfall, evidence drill-down.
    Warm reads served from materialized snapshot (executive_dashboard_materializer).
    """
    return await get_or_compute_executive_dashboard(current_user, period_days)


@router.get("/evidence/{metric_type}")
async def get_evidence_detail(
    metric_type: str,
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(_dashboard_read),
) -> Dict[str, Any]:
    """
    Paginated evidence for a dashboard metric.
    metric_type: uncovered_exposure, unassessed_assessments, active_threat_exposure,
    critical_active_exposure, resolved_exposure
    """
    dashboard = await get_or_compute_executive_dashboard(current_user=current_user)

    if metric_type not in dashboard.evidence_drill_down:
        raise HTTPException(status_code=400, detail=f"Invalid metric type: {metric_type}")

    evidence = dashboard.evidence_drill_down.get(metric_type, [])

    return {
        "metric_type": metric_type,
        "total": len(evidence),
        "items": evidence[skip : skip + limit],
    }
