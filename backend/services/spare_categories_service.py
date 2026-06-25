"""Tenant-scoped spare part category configurator."""
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import HTTPException

from database import db
from models.spare_parts import SpareCategoryCreate, SpareCategoryUpdate
from services.spare_category_seed import seed_spare_categories_for_user
from services.tenant_schema import merge_tenant_filter, with_tenant_id


def _admin_only(user: dict) -> None:
    if user.get("role") not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Admin role required")


async def list_categories(user: dict, include_inactive: bool = False) -> dict:
    await seed_spare_categories_for_user(user)
    query = {} if include_inactive else {"is_active": True}
    items = await db.spare_categories.find(
        merge_tenant_filter(query, user),
        {"_id": 0},
    ).sort("sort_order", 1).to_list(200)
    return {"categories": items, "total": len(items)}


async def create_category(user: dict, payload: SpareCategoryCreate) -> dict:
    _admin_only(user)
    value = payload.value.strip().lower().replace(" ", "_")
    existing = await db.spare_categories.find_one(
        merge_tenant_filter({"value": value}, user),
        {"_id": 0},
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"Category '{value}' already exists")
    if payload.sort_order is None:
        max_doc = await db.spare_categories.find_one(
            merge_tenant_filter({}, user),
            {"_id": 0, "sort_order": 1},
            sort=[("sort_order", -1)],
        )
        sort_order = (max_doc.get("sort_order", 0) if max_doc else 0) + 1
    else:
        sort_order = payload.sort_order
    now = datetime.now(timezone.utc)
    doc = with_tenant_id({
        "id": str(uuid4()),
        "value": value,
        "label": payload.label.strip(),
        "sort_order": sort_order,
        "is_active": payload.is_active,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }, user)
    await db.spare_categories.insert_one(doc)
    return doc


async def update_category(user: dict, category_id: str, payload: SpareCategoryUpdate) -> dict:
    _admin_only(user)
    existing = await db.spare_categories.find_one(
        merge_tenant_filter({"id": category_id}, user),
        {"_id": 0},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        return existing
    if "label" in updates:
        updates["label"] = updates["label"].strip()
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.spare_categories.update_one(
        merge_tenant_filter({"id": category_id}, user),
        {"$set": updates},
    )
    return {**existing, **updates}


async def delete_category(user: dict, category_id: str) -> dict:
    _admin_only(user)
    existing = await db.spare_categories.find_one(
        merge_tenant_filter({"id": category_id}, user),
        {"_id": 0},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    in_use = await db.spare_parts.count_documents(
        merge_tenant_filter({"category_id": category_id}, user),
    )
    if in_use:
        await db.spare_categories.update_one(
            merge_tenant_filter({"id": category_id}, user),
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        return {"success": True, "soft_deleted": True}
    await db.spare_categories.delete_one(merge_tenant_filter({"id": category_id}, user))
    return {"success": True, "soft_deleted": False}


async def resolve_category_label(user: dict, category_id: Optional[str]) -> Optional[str]:
    if not category_id:
        return None
    doc = await db.spare_categories.find_one(
        merge_tenant_filter({"id": category_id}, user),
        {"_id": 0, "label": 1},
    )
    return doc.get("label") if doc else None
