"""Admin routes for External API key management and usage stats."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from auth import require_roles
from models.external_api import (
    ExternalApiKeyCreate,
    ExternalApiKeyCreateResponse,
    ExternalApiKeyPublic,
    ExternalApiKeyRotate,
    ExternalApiKeyUpdate,
    ExternalApiKeyUsage,
)
from services.external_api_key_service import (
    create_key,
    get_key,
    get_key_usage,
    list_keys,
    revoke_key,
    rotate_key,
    update_key,
)
from services.tenant_schema import tenant_id_from_user

router = APIRouter(prefix="/admin/external-api", tags=["admin", "external-api"])


def require_admin(current_user: dict = Depends(require_roles("owner", "admin"))):
    return current_user


@router.get("/keys", response_model=list[ExternalApiKeyPublic])
async def list_api_keys(current_user: dict = Depends(require_admin)):
    tenant_id = tenant_id_from_user(current_user)
    return await list_keys(tenant_id)


@router.post("/keys", response_model=ExternalApiKeyCreateResponse)
async def create_api_key(
    body: ExternalApiKeyCreate,
    current_user: dict = Depends(require_admin),
):
    tenant_id = tenant_id_from_user(current_user)
    public, _raw = await create_key(
        tenant_id,
        name=body.name,
        created_by=current_user["id"],
        scopes=body.scopes,
        rate_limit_per_minute=body.rate_limit_per_minute,
        ip_allowlist=body.ip_allowlist,
        description=body.description,
    )
    return ExternalApiKeyCreateResponse(**public)


@router.get("/keys/{key_id}", response_model=ExternalApiKeyPublic)
async def get_api_key(key_id: str, current_user: dict = Depends(require_admin)):
    tenant_id = tenant_id_from_user(current_user)
    doc = await get_key(tenant_id, key_id)
    if not doc:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="API key not found")
    return doc


@router.patch("/keys/{key_id}", response_model=ExternalApiKeyPublic)
async def patch_api_key(
    key_id: str,
    body: ExternalApiKeyUpdate,
    current_user: dict = Depends(require_admin),
):
    tenant_id = tenant_id_from_user(current_user)
    return await update_key(tenant_id, key_id, body.model_dump(exclude_unset=True))


@router.post("/keys/{key_id}/revoke", response_model=ExternalApiKeyPublic)
async def revoke_api_key(key_id: str, current_user: dict = Depends(require_admin)):
    tenant_id = tenant_id_from_user(current_user)
    return await revoke_key(tenant_id, key_id)


@router.post("/keys/{key_id}/rotate", response_model=ExternalApiKeyCreateResponse)
async def rotate_api_key(
    key_id: str,
    body: ExternalApiKeyRotate,
    current_user: dict = Depends(require_admin),
):
    tenant_id = tenant_id_from_user(current_user)
    public, _raw = await rotate_key(
        tenant_id,
        key_id,
        grace_period_hours=body.grace_period_hours,
    )
    return ExternalApiKeyCreateResponse(**public)


@router.get("/keys/{key_id}/usage", response_model=ExternalApiKeyUsage)
async def get_api_key_usage(key_id: str, current_user: dict = Depends(require_admin)):
    tenant_id = tenant_id_from_user(current_user)
    usage = await get_key_usage(tenant_id, key_id)
    return ExternalApiKeyUsage(**usage)
