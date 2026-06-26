"""
Owner-only tenant registry CRUD, onboarding, health checks, and validation.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from auth import hash_password
from iso14224_models import ISOLevel
from services.tenant_management_audit import log_tenant_audit
from services.tenant_registry import (
    DEFAULT_MODULES,
    MODULE_LABELS,
    TENANT_STATUS_ACTIVE,
    VALID_TENANT_STATUSES,
    invalidate_tenant_status_cache,
)
from services.tenant_schema import stamp_user_tenant_fields, with_tenant_id

_SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_slug(slug: str) -> str:
    value = (slug or "").strip().lower()
    value = re.sub(r"[^a-z0-9-]+", "-", value)
    value = re.sub(r"-{2,}", "-", value).strip("-")
    return value


def validate_slug(slug: str) -> str:
    normalized = normalize_slug(slug)
    if not normalized or len(normalized) < 2:
        raise HTTPException(status_code=400, detail="Slug must be at least 2 characters")
    if not _SLUG_RE.match(normalized):
        raise HTTPException(status_code=400, detail="Slug may only contain lowercase letters, numbers, and hyphens")
    return normalized


def default_ai_settings() -> dict:
    return {
        "enabled": True,
        "monthly_budget_usd": None,
        "risk_analysis_enabled": True,
        "copilot_enabled": True,
    }


def _serialize_tenant(doc: dict, counts: Optional[dict] = None) -> dict:
    out = {k: v for k, v in doc.items() if k != "_id"}
    counts = counts or {}
    out["user_count"] = counts.get("user_count", 0)
    out["site_count"] = counts.get("site_count", 0)
    out["equipment_count"] = counts.get("equipment_count", 0)
    out["ai_enabled"] = bool((doc.get("ai_settings") or {}).get("enabled", False))
    return out


async def _tenant_counts(db, tenant_id: str) -> dict:
    user_count = await db.users.count_documents({"tenant_id": tenant_id})
    site_count = await db.equipment_nodes.count_documents(
        {"tenant_id": tenant_id, "level": ISOLevel.INSTALLATION.value}
    )
    equipment_count = await db.equipment_nodes.count_documents({"tenant_id": tenant_id})
    return {
        "user_count": user_count,
        "site_count": site_count,
        "equipment_count": equipment_count,
    }


async def list_tenants(
    db,
    *,
    include_archived: bool = False,
    status: Optional[str] = None,
) -> List[dict]:
    query: dict = {}
    if status:
        if status not in VALID_TENANT_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
        query["status"] = status
    elif not include_archived:
        query["status"] = {"$ne": "archived"}

    cursor = db.tenants.find(query, {"_id": 0}).sort("created_at", -1)
    tenants = await cursor.to_list(500)
    results = []
    for doc in tenants:
        counts = await _tenant_counts(db, doc["tenant_id"])
        results.append(_serialize_tenant(doc, counts))
    return results


async def get_tenant(db, tenant_id: str) -> dict:
    doc = await db.tenants.find_one({"tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Tenant not found")
    counts = await _tenant_counts(db, tenant_id)
    return _serialize_tenant(doc, counts)


async def _create_equipment_node(
    db,
    *,
    tenant_id: str,
    actor_id: str,
    name: str,
    level: ISOLevel,
    parent_id: Optional[str] = None,
) -> str:
    node_id = str(uuid.uuid4())
    now = _now_iso()
    node_doc = {
        "id": node_id,
        "name": name,
        "level": level.value,
        "parent_id": parent_id,
        "sort_order": 1,
        "created_by": actor_id,
        "created_at": now,
        "updated_at": now,
    }
    if level == ISOLevel.PLANT_UNIT and parent_id:
        node_doc["installation_id"] = parent_id
    user_ctx = {"company_id": tenant_id, "tenant_id": tenant_id, "id": actor_id}
    await db.equipment_nodes.insert_one(with_tenant_id(node_doc, user_ctx))
    return node_id


async def create_tenant(db, payload: dict, actor: dict) -> dict:
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tenant name is required")

    slug = validate_slug(payload.get("slug") or name)
    existing_slug = await db.tenants.find_one({"slug": slug})
    if existing_slug:
        raise HTTPException(status_code=400, detail="Slug already in use")

    admin_name = (payload.get("primary_admin_name") or "").strip()
    admin_email = (payload.get("primary_admin_email") or "").strip().lower()
    if not admin_name or not admin_email:
        raise HTTPException(status_code=400, detail="Primary admin name and email are required")

    existing_user = await db.users.find_one({"email": admin_email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Primary admin email already registered")

    default_language = (payload.get("default_language") or "en").strip()
    default_timezone = (payload.get("default_timezone") or "UTC").strip()
    if not default_language or not default_timezone:
        raise HTTPException(status_code=400, detail="Default language and timezone are required")

    tenant_id = str(uuid.uuid4())
    now = _now_iso()
    modules = {**DEFAULT_MODULES, **(payload.get("modules") or {})}
    ai_settings = {**default_ai_settings(), **(payload.get("ai_settings") or {})}
    if "ai_enabled" in payload:
        ai_settings["enabled"] = bool(payload["ai_enabled"])

    tenant_doc = {
        "tenant_id": tenant_id,
        "name": name,
        "slug": slug,
        "status": payload.get("status") or "trial",
        "plan": payload.get("plan"),
        "modules": modules,
        "ai_settings": ai_settings,
        "default_language": default_language,
        "default_timezone": default_timezone,
        "primary_admin": {"name": admin_name, "email": admin_email},
        "notes": payload.get("notes"),
        "created_at": now,
        "updated_at": now,
        "last_activity_at": None,
        "created_by": actor.get("id"),
    }
    if tenant_doc["status"] not in VALID_TENANT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")

    temp_password = payload.get("primary_admin_password") or str(uuid.uuid4())[:12]
    admin_user = {
        "id": str(uuid.uuid4()),
        "email": admin_email,
        "name": admin_name,
        "password_hash": hash_password(temp_password),
        "created_at": now,
        "approval_status": "approved",
        "role": "admin",
        "is_active": True,
        "has_seen_intro": False,
        "must_change_password": True,
        "company_id": tenant_id,
        "tenant_id": tenant_id,
        "created_by": actor.get("id"),
    }
    await db.tenants.insert_one(tenant_doc)
    await db.users.insert_one(stamp_user_tenant_fields(admin_user, admin_user))

    site_id = None
    site_name = (payload.get("site_name") or "").strip()
    installation_name = (payload.get("installation_name") or "").strip()
    if site_name:
        site_id = await _create_equipment_node(
            db,
            tenant_id=tenant_id,
            actor_id=actor.get("id"),
            name=site_name,
            level=ISOLevel.INSTALLATION,
        )
        admin_user_id = admin_user["id"]
        await db.users.update_one(
            {"id": admin_user_id},
            {"$set": {"assigned_installations": [site_id]}},
        )
        if installation_name:
            await _create_equipment_node(
                db,
                tenant_id=tenant_id,
                actor_id=actor.get("id"),
                name=installation_name,
                level=ISOLevel.PLANT_UNIT,
                parent_id=site_id,
            )

    invalidate_tenant_status_cache(tenant_id)
    await log_tenant_audit(
        "tenant_created",
        tenant_id=tenant_id,
        actor=actor,
        details={"name": name, "slug": slug, "primary_admin_email": admin_email},
    )

    result = await get_tenant(db, tenant_id)
    result["primary_admin_temp_password"] = temp_password if payload.get("return_temp_password") else None
    return result


async def update_tenant(db, tenant_id: str, payload: dict, actor: dict) -> dict:
    existing = await db.tenants.find_one({"tenant_id": tenant_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Tenant not found")

    updates: Dict[str, Any] = {}
    allowed = {
        "name", "plan", "notes", "default_language", "default_timezone", "status",
    }
    for key in allowed:
        if key in payload and payload[key] is not None:
            if key == "status" and payload[key] not in VALID_TENANT_STATUSES:
                raise HTTPException(status_code=400, detail="Invalid status")
            updates[key] = payload[key]

    if "slug" in payload:
        raise HTTPException(status_code=400, detail="Slug cannot be changed after creation")
    if "tenant_id" in payload:
        raise HTTPException(status_code=400, detail="Tenant ID cannot be changed")

    if not updates:
        return await get_tenant(db, tenant_id)

    updates["updated_at"] = _now_iso()
    await db.tenants.update_one({"tenant_id": tenant_id}, {"$set": updates})
    invalidate_tenant_status_cache(tenant_id)
    await log_tenant_audit(
        "tenant_updated",
        tenant_id=tenant_id,
        actor=actor,
        details={"fields": list(updates.keys())},
    )
    return await get_tenant(db, tenant_id)


async def set_tenant_status(db, tenant_id: str, status: str, actor: dict, event: str) -> dict:
    if status not in VALID_TENANT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    existing = await db.tenants.find_one({"tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Tenant not found")

    now = _now_iso()
    await db.tenants.update_one(
        {"tenant_id": tenant_id},
        {"$set": {"status": status, "updated_at": now}},
    )
    invalidate_tenant_status_cache(tenant_id)
    await log_tenant_audit(event, tenant_id=tenant_id, actor=actor, details={"status": status})
    return await get_tenant(db, tenant_id)


async def update_modules(db, tenant_id: str, modules: dict, actor: dict) -> dict:
    existing = await db.tenants.find_one({"tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Tenant not found")

    merged = {**DEFAULT_MODULES, **(existing.get("modules") or {}), **(modules or {})}
    for key in merged:
        if key not in MODULE_LABELS:
            raise HTTPException(status_code=400, detail=f"Unknown module: {key}")

    await db.tenants.update_one(
        {"tenant_id": tenant_id},
        {"$set": {"modules": merged, "updated_at": _now_iso()}},
    )
    await log_tenant_audit(
        "tenant_modules_updated",
        tenant_id=tenant_id,
        actor=actor,
        details={"modules": merged},
    )
    return await get_tenant(db, tenant_id)


async def update_ai_settings(db, tenant_id: str, ai_settings: dict, actor: dict) -> dict:
    existing = await db.tenants.find_one({"tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Tenant not found")

    merged = {**default_ai_settings(), **(existing.get("ai_settings") or {}), **(ai_settings or {})}
    await db.tenants.update_one(
        {"tenant_id": tenant_id},
        {"$set": {"ai_settings": merged, "updated_at": _now_iso()}},
    )
    await log_tenant_audit(
        "tenant_ai_settings_updated",
        tenant_id=tenant_id,
        actor=actor,
        details={"ai_settings": merged},
    )
    return await get_tenant(db, tenant_id)


async def get_tenant_health(db, tenant_id: str) -> dict:
    tenant = await db.tenants.find_one({"tenant_id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    counts = await _tenant_counts(db, tenant_id)
    admin_email = (tenant.get("primary_admin") or {}).get("email")
    admin_user = await db.users.find_one({"email": admin_email, "tenant_id": tenant_id}, {"_id": 0, "id": 1})
    sites = await db.equipment_nodes.count_documents(
        {"tenant_id": tenant_id, "level": ISOLevel.INSTALLATION.value}
    )

    checks = [
        {
            "id": "registry",
            "label": "Tenant registry record",
            "status": "pass",
            "message": "Tenant record exists",
        },
        {
            "id": "primary_admin",
            "label": "Primary admin user",
            "status": "pass" if admin_user else "fail",
            "message": "Admin user found" if admin_user else "Primary admin user missing",
        },
        {
            "id": "users",
            "label": "Users",
            "status": "pass" if counts["user_count"] > 0 else "warn",
            "message": f"{counts['user_count']} user(s)",
        },
        {
            "id": "sites",
            "label": "Sites",
            "status": "pass" if sites > 0 else "warn",
            "message": f"{sites} site(s)",
        },
        {
            "id": "tenant_status",
            "label": "Tenant status",
            "status": "pass" if tenant.get("status") in TENANT_STATUS_ACTIVE else "warn",
            "message": tenant.get("status", "unknown"),
        },
    ]
    failed = sum(1 for c in checks if c["status"] == "fail")
    warnings = sum(1 for c in checks if c["status"] == "warn")
    overall = "healthy" if failed == 0 and warnings == 0 else ("degraded" if failed == 0 else "unhealthy")

    return {
        "tenant_id": tenant_id,
        "overall": overall,
        "checks": checks,
        "counts": counts,
        "checked_at": _now_iso(),
    }


async def validate_tenant(db, tenant_id: str, actor: dict) -> dict:
    report = await run_validation_checks(db, tenant_id)
    await log_tenant_audit(
        "tenant_validation_run",
        tenant_id=tenant_id,
        actor=actor,
        details={"overall": report.get("overall"), "issue_count": len(report.get("issues", []))},
    )
    return report


async def run_validation_checks(db, tenant_id: str) -> dict:
    """Core validation used by API and CLI script."""
    tenant = await db.tenants.find_one({"tenant_id": tenant_id}, {"_id": 0})
    issues: List[dict] = []
    if not tenant:
        return {
            "tenant_id": tenant_id,
            "overall": "missing",
            "issues": [{"code": "tenant_not_found", "severity": "error", "message": "No tenant record"}],
            "checked_at": _now_iso(),
        }

    admin_email = (tenant.get("primary_admin") or {}).get("email")
    admin_user = await db.users.find_one({"email": admin_email, "tenant_id": tenant_id})
    if not admin_user:
        issues.append({
            "code": "missing_primary_admin",
            "severity": "error",
            "message": f"Primary admin {admin_email} not found for tenant",
        })

    users_missing_tenant = await db.users.count_documents(
        {"company_id": tenant_id, "tenant_id": {"$ne": tenant_id}}
    )
    if users_missing_tenant:
        issues.append({
            "code": "users_tenant_id_mismatch",
            "severity": "warn",
            "message": f"{users_missing_tenant} user(s) with company_id but mismatched tenant_id",
        })

    orphan_users = await db.users.count_documents(
        {"tenant_id": tenant_id, "company_id": {"$ne": tenant_id}}
    )
    if orphan_users:
        issues.append({
            "code": "users_company_id_mismatch",
            "severity": "warn",
            "message": f"{orphan_users} user(s) with tenant_id but mismatched company_id",
        })

    sites = await db.equipment_nodes.count_documents(
        {"tenant_id": tenant_id, "level": ISOLevel.INSTALLATION.value}
    )
    if sites == 0:
        issues.append({
            "code": "no_sites",
            "severity": "warn",
            "message": "No site (installation-level) equipment nodes",
        })

    equipment = await db.equipment_nodes.count_documents({"tenant_id": tenant_id})
    if equipment == 0:
        issues.append({
            "code": "no_equipment",
            "severity": "warn",
            "message": "No equipment nodes for tenant",
        })

    errors = sum(1 for i in issues if i["severity"] == "error")
    overall = "valid" if errors == 0 and not issues else ("invalid" if errors else "warnings")

    return {
        "tenant_id": tenant_id,
        "tenant_name": tenant.get("name"),
        "overall": overall,
        "issues": issues,
        "counts": await _tenant_counts(db, tenant_id),
        "checked_at": _now_iso(),
    }
