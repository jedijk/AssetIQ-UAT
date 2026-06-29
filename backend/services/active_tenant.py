"""
Owner-only active tenant override via X-Active-Tenant header or cookie.

JWT carries user_id only; company_id comes from the DB user record. Owners may
scope API requests to another tenant by sending the override header (mirrors
frontend localStorage + apiClient interceptor).
"""
from __future__ import annotations

from typing import Optional

from fastapi import Request

ACTIVE_TENANT_HEADER = "X-Active-Tenant"
ACTIVE_TENANT_COOKIE = "assetiq_active_tenant"


def read_active_tenant_override(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    header = request.headers.get(ACTIVE_TENANT_HEADER)
    if header and header.strip():
        return header.strip()
    cookie = request.cookies.get(ACTIVE_TENANT_COOKIE)
    if cookie and cookie.strip():
        return cookie.strip()
    return None


async def apply_active_tenant_override(user: dict, request: Optional[Request]) -> dict:
    """Apply owner tenant override from header/cookie; return user unchanged on failure."""
    if user.get("role") != "owner":
        return user

    override = read_active_tenant_override(request)
    if not override:
        return user

    from services.tenant_schema import tenant_id_from_user

    home_tenant_id = tenant_id_from_user(user)
    if override == home_tenant_id:
        return user

    from database import get_request_db
    from services.tenant_management_service import _resolve_tenant_doc
    from services.tenant_registry import TENANT_STATUS_BLOCKED, is_tenant_login_allowed

    db = get_request_db()
    tenant_doc = await _resolve_tenant_doc(db, override)
    status = tenant_doc.get("status")
    if status in TENANT_STATUS_BLOCKED:
        return user
    if not await is_tenant_login_allowed(override):
        return user

    result = dict(user)
    result["company_id"] = override
    result["tenant_id"] = override
    result["_home_tenant_id"] = home_tenant_id
    result["_active_tenant_override"] = True
    return result


async def resolve_owner_tenant_switch(user: dict, tenant_id: Optional[str]) -> dict:
    """Validate owner tenant switch; raises HTTPException on denial."""
    from fastapi import HTTPException

    if user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can switch tenants")

    from database import get_request_db
    from services.tenant_management_service import _resolve_tenant_doc
    from services.tenant_registry import TENANT_STATUS_BLOCKED, is_tenant_login_allowed
    from services.tenant_schema import tenant_id_from_user

    home_tenant_id = user.get("_home_tenant_id") or tenant_id_from_user(user)
    target = (tenant_id or "").strip() or None

    if not target or target == home_tenant_id:
        name = None
        if home_tenant_id:
            db = get_request_db()
            doc = await _resolve_tenant_doc(db, home_tenant_id)
            name = doc.get("name")
        return {
            "tenant_id": home_tenant_id,
            "name": name,
            "home_tenant_id": home_tenant_id,
        }

    if not await is_tenant_login_allowed(target):
        raise HTTPException(
            status_code=403,
            detail="This organization is suspended or archived.",
        )

    db = get_request_db()
    tenant_doc = await _resolve_tenant_doc(db, target)
    if tenant_doc.get("status") in TENANT_STATUS_BLOCKED:
        raise HTTPException(
            status_code=403,
            detail="This organization is suspended or archived.",
        )

    return {
        "tenant_id": target,
        "name": tenant_doc.get("name"),
        "home_tenant_id": home_tenant_id,
    }
