"""Success Readiness API routes."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import require_roles
from services import success_readiness_service as svc

router = APIRouter(prefix="/success-readiness", tags=["success-readiness"])

_view_roles = require_roles("admin", "reliability_engineer", "maintenance", "operations", "viewer")
_admin_roles = require_roles("admin")
_owner_roles = require_roles()  # owner only (owner always passes require_roles)


class RegisterCreateRequest(BaseModel):
    title: str = Field(..., min_length=1)
    description: str = ""
    status: str = "draft"
    completion_pct: int = Field(0, ge=0, le=100)
    owner: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RegisterUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    completion_pct: Optional[int] = Field(None, ge=0, le=100)
    owner: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class ConfigurationUpdateRequest(BaseModel):
    targets_locked: Optional[bool] = None
    notification_enabled: Optional[bool] = None
    pillar_weights: Optional[Dict[str, float]] = None


@router.get("/dashboard")
async def get_dashboard(current_user: dict = Depends(_view_roles)):
    return await svc.get_dashboard(current_user)


@router.get("/kpis")
async def list_kpis(
    pillar: Optional[str] = None,
    current_user: dict = Depends(_view_roles),
):
    return await svc.get_kpis(current_user, pillar=pillar)


@router.get("/kpis/{kpi_id}")
async def get_kpi(kpi_id: str, current_user: dict = Depends(_view_roles)):
    detail = await svc.get_kpi_detail(current_user, kpi_id)
    if not detail:
        raise HTTPException(status_code=404, detail="KPI not found")
    return detail


@router.get("/registers/{register_type}")
async def list_registers(register_type: str, current_user: dict = Depends(_view_roles)):
    return await svc.get_registers(current_user, register_type)


@router.post("/registers/{register_type}")
async def create_register(
    register_type: str,
    body: RegisterCreateRequest,
    current_user: dict = Depends(_admin_roles),
):
    try:
        return await svc.create_register(current_user, register_type, body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/registers/{register_type}/{entry_id}")
async def update_register(
    register_type: str,
    entry_id: str,
    body: RegisterUpdateRequest,
    current_user: dict = Depends(_admin_roles),
):
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    updated = await svc.update_register(current_user, entry_id, payload)
    if not updated:
        raise HTTPException(status_code=404, detail="Register entry not found")
    return updated


@router.get("/assessments")
async def list_assessments(current_user: dict = Depends(_view_roles)):
    return await svc.list_assessments(current_user)


@router.get("/evidence")
async def list_evidence(
    kpi_id: Optional[str] = None,
    current_user: dict = Depends(_view_roles),
):
    return await svc.list_evidence(current_user, kpi_id=kpi_id)


@router.get("/history")
async def list_history(current_user: dict = Depends(_view_roles)):
    return await svc.list_history(current_user)


@router.get("/ai-recommendations")
async def get_ai_recommendations(current_user: dict = Depends(_view_roles)):
    return await svc.get_ai_recommendations(current_user)


@router.get("/configuration")
async def get_configuration(current_user: dict = Depends(_view_roles)):
    return await svc.get_configuration(current_user)


@router.patch("/configuration")
async def update_configuration(
    body: ConfigurationUpdateRequest,
    current_user: dict = Depends(_owner_roles),
):
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    return await svc.update_configuration(current_user, payload)
