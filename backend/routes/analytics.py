"""
Analytics & RBAC routes.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
import logging
from database import db, analytics_service, rbac_service, installation_filter
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


async def _scoped_equipment_ids(user: dict):
    installation_ids = await installation_filter.get_user_installation_ids(user)
    if not installation_ids:
        return set()
    return await installation_filter.get_all_equipment_ids_for_installations(
        installation_ids, user.get("id")
    )


@router.get("/analytics/dashboard")
async def get_analytics_dashboard(current_user: dict = Depends(_analytics_read)):
    """Get comprehensive analytics dashboard"""
    equipment_ids = await _scoped_equipment_ids(current_user)
    return await analytics_service.get_full_dashboard(
        current_user.get("user_id"),
        equipment_ids=equipment_ids,
        user=current_user,
    )


@router.get("/analytics/risk-overview")
async def get_risk_overview(current_user: dict = Depends(_analytics_read)):
    """Get risk overview metrics"""
    equipment_ids = await _scoped_equipment_ids(current_user)
    return await analytics_service.get_risk_overview(
        current_user.get("user_id"),
        equipment_ids=equipment_ids,
        user=current_user,
    )


@router.get("/analytics/top-risks")
async def get_analytics_top_risks(
    limit: int = 10,
    current_user: dict = Depends(_library_read),
):
    """Get top risks by RPN"""
    return await analytics_service.get_top_risks(limit)


@router.get("/analytics/failure-mode-pareto")
async def get_failure_mode_pareto(
    limit: int = 20,
    current_user: dict = Depends(_library_read),
):
    """Get failure mode pareto analysis"""
    return await analytics_service.get_failure_mode_pareto(limit)


@router.get("/analytics/task-compliance")
async def get_task_compliance_analytics(
    days: int = 30,
    current_user: dict = Depends(_analytics_read),
):
    """Get task compliance metrics"""
    return await analytics_service.get_task_compliance(days, user=current_user)


@router.get("/analytics/task-workload")
async def get_task_workload_analytics(
    days: int = 7,
    current_user: dict = Depends(_analytics_read),
):
    """Get task workload by day"""
    return await analytics_service.get_task_workload(days)


@router.get("/analytics/detection-effectiveness")
async def get_detection_effectiveness(current_user: dict = Depends(_analytics_read)):
    """Get task detection effectiveness analysis"""
    return await analytics_service.get_detection_effectiveness()


@router.get("/analytics/equipment-risk-ranking")
async def get_equipment_risk_ranking(
    limit: int = 20,
    current_user: dict = Depends(_analytics_read),
):
    """Get equipment risk ranking"""
    return await analytics_service.get_equipment_risk_ranking(limit)


@router.get("/analytics/under-controlled-risks")
async def get_under_controlled_risks(current_user: dict = Depends(_analytics_read)):
    """Get high-risk EFMs without adequate task coverage"""
    return await analytics_service.get_under_controlled_risks()


@router.get("/analytics/over-maintained-assets")
async def get_over_maintained_assets(current_user: dict = Depends(_analytics_read)):
    """Get equipment with excessive maintenance relative to risk"""
    return await analytics_service.get_over_maintained_assets()


@router.get("/analytics/form-threshold-summary")
async def get_form_threshold_summary(
    days: int = 30,
    current_user: dict = Depends(_analytics_read),
):
    """Get form submission threshold breach summary"""
    return await analytics_service.get_form_threshold_summary(days)


# NOTE: RBAC user management endpoints (get users, update role, update status, update profile)
# are now in routes/users.py with avatar support. Only analytics endpoints remain here.
