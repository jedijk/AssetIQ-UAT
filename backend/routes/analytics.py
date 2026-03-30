"""
Analytics & RBAC routes.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
import logging
from database import db, analytics_service, rbac_service
from auth import get_current_user
from services.rbac_service import ROLES
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Analytics & RBAC"])

# ============= ANALYTICS ENDPOINTS =============

from services.analytics_service import AnalyticsService
from services.rbac_service import RBACService

# Initialize services
analytics_service = AnalyticsService(db)
rbac_service = RBACService(db)


@router.get("/analytics/dashboard")
async def get_analytics_dashboard(current_user: dict = Depends(get_current_user)):
    """Get comprehensive analytics dashboard"""
    return await analytics_service.get_full_dashboard(current_user.get("user_id"))


@router.get("/analytics/risk-overview")
async def get_risk_overview(current_user: dict = Depends(get_current_user)):
    """Get risk overview metrics"""
    return await analytics_service.get_risk_overview(current_user.get("user_id"))


@router.get("/analytics/top-risks")
async def get_analytics_top_risks(limit: int = 10, current_user: dict = Depends(get_current_user)):
    """Get top risks by RPN"""
    return await analytics_service.get_top_risks(limit)


@router.get("/analytics/failure-mode-pareto")
async def get_failure_mode_pareto(limit: int = 20, current_user: dict = Depends(get_current_user)):
    """Get failure mode pareto analysis"""
    return await analytics_service.get_failure_mode_pareto(limit)


@router.get("/analytics/task-compliance")
async def get_task_compliance_analytics(days: int = 30, current_user: dict = Depends(get_current_user)):
    """Get task compliance metrics"""
    return await analytics_service.get_task_compliance(days)


@router.get("/analytics/task-workload")
async def get_task_workload_analytics(days: int = 7, current_user: dict = Depends(get_current_user)):
    """Get task workload by day"""
    return await analytics_service.get_task_workload(days)


@router.get("/analytics/detection-effectiveness")
async def get_detection_effectiveness(current_user: dict = Depends(get_current_user)):
    """Get task detection effectiveness analysis"""
    return await analytics_service.get_detection_effectiveness()


@router.get("/analytics/equipment-risk-ranking")
async def get_equipment_risk_ranking(limit: int = 20, current_user: dict = Depends(get_current_user)):
    """Get equipment risk ranking"""
    return await analytics_service.get_equipment_risk_ranking(limit)


@router.get("/analytics/under-controlled-risks")
async def get_under_controlled_risks(current_user: dict = Depends(get_current_user)):
    """Get high-risk EFMs without adequate task coverage"""
    return await analytics_service.get_under_controlled_risks()


@router.get("/analytics/over-maintained-assets")
async def get_over_maintained_assets(current_user: dict = Depends(get_current_user)):
    """Get equipment with excessive maintenance relative to risk"""
    return await analytics_service.get_over_maintained_assets()


@router.get("/analytics/form-threshold-summary")
async def get_form_threshold_summary(days: int = 30, current_user: dict = Depends(get_current_user)):
    """Get form submission threshold breach summary"""
    return await analytics_service.get_form_threshold_summary(days)


# NOTE: RBAC user management endpoints (get users, update role, update status, update profile)
# are now in routes/users.py with avatar support. Only analytics endpoints remain here.
