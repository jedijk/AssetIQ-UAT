"""
Owner-only tenant management API.
"""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from auth import require_permission
from database import db
from services.tenant_management_service import (
    create_tenant,
    get_tenant,
    get_tenant_health,
    list_tenants,
    set_tenant_status,
    update_ai_settings,
    update_modules,
    update_tenant,
    validate_tenant,
)
from services.tenant_registry import MODULE_LABELS

router = APIRouter(prefix="/admin/tenants", tags=["admin", "tenant-management"])

_read_dep = require_permission("tenant_management:read")
_write_dep = require_permission("tenant_management:write")
_admin_dep = require_permission("tenant_management:admin")


class CreateTenantRequest(BaseModel):
    name: str
    slug: Optional[str] = None
    primary_admin_name: str
    primary_admin_email: str
    primary_admin_password: Optional[str] = None
    default_language: str = "en"
    default_timezone: str = "UTC"
    plan: Optional[str] = None
    modules: Optional[Dict[str, bool]] = None
    ai_enabled: Optional[bool] = None
    ai_settings: Optional[Dict[str, Any]] = None
    site_name: Optional[str] = None
    installation_name: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = "trial"
    return_temp_password: bool = False


class UpdateTenantRequest(BaseModel):
    name: Optional[str] = None
    plan: Optional[str] = None
    notes: Optional[str] = None
    default_language: Optional[str] = None
    default_timezone: Optional[str] = None
    status: Optional[str] = None


class ModulesUpdateRequest(BaseModel):
    modules: Dict[str, bool]


class AISettingsUpdateRequest(BaseModel):
    ai_settings: Dict[str, Any] = Field(default_factory=dict)
    enabled: Optional[bool] = None


@router.get("")
async def list_all_tenants(
    include_archived: bool = Query(False),
    status: Optional[str] = Query(None),
    current_user: dict = Depends(_read_dep),
):
    return {"tenants": await list_tenants(db, include_archived=include_archived, status=status)}


@router.get("/modules/catalog")
async def modules_catalog(current_user: dict = Depends(_read_dep)):
    return {"modules": [{"key": k, "label": v} for k, v in MODULE_LABELS.items()]}


@router.post("")
async def create_new_tenant(
    payload: CreateTenantRequest,
    current_user: dict = Depends(_admin_dep),
):
    tenant = await create_tenant(db, payload.model_dump(), current_user)
    return {"tenant": tenant}


@router.get("/{tenant_id}")
async def get_tenant_detail(tenant_id: str, current_user: dict = Depends(_read_dep)):
    return {"tenant": await get_tenant(db, tenant_id)}


@router.patch("/{tenant_id}")
async def patch_tenant(
    tenant_id: str,
    payload: UpdateTenantRequest,
    current_user: dict = Depends(_write_dep),
):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    return {"tenant": await update_tenant(db, tenant_id, data, current_user)}


@router.post("/{tenant_id}/suspend")
async def suspend_tenant(tenant_id: str, current_user: dict = Depends(_admin_dep)):
    return {"tenant": await set_tenant_status(db, tenant_id, "suspended", current_user, "tenant_suspended")}


@router.post("/{tenant_id}/reactivate")
async def reactivate_tenant(tenant_id: str, current_user: dict = Depends(_admin_dep)):
    return {"tenant": await set_tenant_status(db, tenant_id, "active", current_user, "tenant_reactivated")}


@router.post("/{tenant_id}/archive")
async def archive_tenant(tenant_id: str, current_user: dict = Depends(_admin_dep)):
    return {"tenant": await set_tenant_status(db, tenant_id, "archived", current_user, "tenant_archived")}


@router.get("/{tenant_id}/health")
async def tenant_health(tenant_id: str, current_user: dict = Depends(_read_dep)):
    return await get_tenant_health(db, tenant_id)


@router.post("/{tenant_id}/validate")
async def run_tenant_validation(tenant_id: str, current_user: dict = Depends(_write_dep)):
    return await validate_tenant(db, tenant_id, current_user)


@router.patch("/{tenant_id}/modules")
async def patch_tenant_modules(
    tenant_id: str,
    payload: ModulesUpdateRequest,
    current_user: dict = Depends(_write_dep),
):
    return {"tenant": await update_modules(db, tenant_id, payload.modules, current_user)}


@router.patch("/{tenant_id}/ai-settings")
async def patch_tenant_ai_settings(
    tenant_id: str,
    payload: AISettingsUpdateRequest,
    current_user: dict = Depends(_write_dep),
):
    ai_settings = dict(payload.ai_settings or {})
    if payload.enabled is not None:
        ai_settings["enabled"] = payload.enabled
    return {"tenant": await update_ai_settings(db, tenant_id, ai_settings, current_user)}
