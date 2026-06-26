"""
Analytics & RBAC routes.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
import logging
from database import db, rbac_service, installation_filter
from auth import require_permission
from services.rbac_service import ROLES
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Analytics & RBAC"])

# ============= ANALYTICS ENDPOINTS =============

from services.analytics_service import AnalyticsService
from services.rbac_service import RBACService

# Initialize services
analytics_service = AnalyticsService(db)
rbac_service = RBACService(db)

_analytics_read = require_permission("analytics:read")
_library_read = require_permission("library:read")


async def _analytics_dashboard(current_user: dict) -> Dict[str, Any]:
    from services.analytics_dashboard_materializer import get_or_compute_analytics_dashboard

    return await get_or_compute_analytics_dashboard(current_user)


@router.get("/analytics/dashboard")
async def get_analytics_dashboard(current_user: dict = Depends(_analytics_read)):
    """Get comprehensive analytics dashboard"""
    return await _analytics_dashboard(current_user)


@router.get("/analytics/risk-overview")
async def get_risk_overview(current_user: dict = Depends(_analytics_read)):
    """Get risk overview metrics"""
    return (await _analytics_dashboard(current_user)).get("risk_overview", {})


@router.get("/analytics/top-risks")
async def get_analytics_top_risks(
    limit: int = 10,
    current_user: dict = Depends(_library_read),
):
    """Get top risks by RPN"""
    risks = (await _analytics_dashboard(current_user)).get("top_risks", [])
    return risks[:limit]


@router.get("/analytics/failure-mode-pareto")
async def get_failure_mode_pareto(
    limit: int = 20,
    current_user: dict = Depends(_library_read),
):
    """Get failure mode pareto analysis"""
    items = (await _analytics_dashboard(current_user)).get("failure_mode_pareto", [])
    return items[:limit]


@router.get("/analytics/task-compliance")
async def get_task_compliance_analytics(
    days: int = 30,
    current_user: dict = Depends(_analytics_read),
):
    """Get task compliance metrics"""
    return (await _analytics_dashboard(current_user)).get("task_compliance", {})


@router.get("/analytics/task-workload")
async def get_task_workload_analytics(
    days: int = 7,
    current_user: dict = Depends(_analytics_read),
):
    """Get task workload by day"""
    return (await _analytics_dashboard(current_user)).get("task_workload", {})


@router.get("/analytics/detection-effectiveness")
async def get_detection_effectiveness(current_user: dict = Depends(_analytics_read)):
    """Get task detection effectiveness analysis"""
    return (await _analytics_dashboard(current_user)).get("detection_effectiveness", {})


@router.get("/analytics/equipment-risk-ranking")
async def get_equipment_risk_ranking(
    limit: int = 20,
    current_user: dict = Depends(_analytics_read),
):
    """Get equipment risk ranking"""
    ranking = (await _analytics_dashboard(current_user)).get("equipment_risk_ranking", [])
    return ranking[:limit]


@router.get("/analytics/under-controlled-risks")
async def get_under_controlled_risks(current_user: dict = Depends(_analytics_read)):
    """Get high-risk EFMs without adequate task coverage"""
    return (await _analytics_dashboard(current_user)).get("under_controlled_risks", {})


@router.get("/analytics/over-maintained-assets")
async def get_over_maintained_assets(current_user: dict = Depends(_analytics_read)):
    """Get equipment with excessive maintenance relative to risk"""
    return (await _analytics_dashboard(current_user)).get("over_maintained_assets", {})


@router.get("/analytics/form-threshold-summary")
async def get_form_threshold_summary(
    days: int = 30,
    current_user: dict = Depends(_analytics_read),
):
    """Get form submission threshold breach summary"""
    return (await _analytics_dashboard(current_user)).get("form_summary", {})

# NOTE: RBAC user management endpoints (get users, update role, update status, update profile)
# are now in routes/users.py with avatar support. Only analytics endpoints remain here.
