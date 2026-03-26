"""
Analytics & RBAC routes.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
import logging
from database import db, analytics_service, rbac_service
from auth import get_current_user
from services.rbac_service import ROLES
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Analytics & RBAC"])

# ============= ANALYTICS ENDPOINTS =============

from services.analytics_service import AnalyticsService
from services.rbac_service import RBACService, ROLES

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


# ============= RBAC / USER MANAGEMENT ENDPOINTS =============

@router.get("/rbac/roles")
async def get_rbac_roles(current_user: dict = Depends(get_current_user)):
    """Get all available roles and their permissions"""
    return {"roles": ROLES}


@router.get("/rbac/users")
async def get_rbac_users(
    search: Optional[str] = None,
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get users with filtering (Admin only)"""
    # Ensure user has role assigned
    await rbac_service.ensure_user_has_role(current_user.get("user_id"))
    return await rbac_service.get_users(search, role, is_active, skip, limit)


@router.get("/rbac/users/{user_id}")
async def get_rbac_user(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific user"""
    user = await rbac_service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


class RoleUpdateRequest(BaseModel):
    role: str


@router.patch("/rbac/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    request: RoleUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update a user's role (Admin only)"""
    try:
        updated = await rbac_service.update_user_role(
            user_id,
            request.role,
            current_user.get("user_id")
        )
        if not updated:
            raise HTTPException(status_code=404, detail="User not found")
        return updated
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class StatusUpdateRequest(BaseModel):
    is_active: bool


@router.patch("/rbac/users/{user_id}/status")
async def update_user_status(
    user_id: str,
    request: StatusUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Activate or deactivate a user (Admin only)"""
    updated = await rbac_service.update_user_status(
        user_id,
        request.is_active,
        current_user.get("user_id")
    )
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return updated


class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    phone: Optional[str] = None


@router.patch("/rbac/users/{user_id}/profile")
async def update_user_profile(
    user_id: str,
    request: ProfileUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update user profile"""
    updated = await rbac_service.update_user_profile(
        user_id,
        request.model_dump(exclude_none=True)
    )
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return updated


@router.get("/rbac/role-distribution")
async def get_role_distribution(current_user: dict = Depends(get_current_user)):
    """Get count of users per role"""
    return await rbac_service.get_role_distribution()


