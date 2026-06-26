"""SpareIQ spare parts register — CRUD with duplicate merge on description + type/model."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import HTTPException

from database import db
from models.spare_parts import SparePartCreate, SparePartUpdate
from services.spare_categories_service import resolve_category_label
from services.spare_parts_graph_sync import retire_spare_part_graph, sync_spare_part_equipment_links
from services.tenant_schema import merge_tenant_filter, tenant_id_from_user, with_tenant_id
from utils.mongo_regex import or_search_fields


def _normalize_key(description: str, type_model: str) -> str:
    desc = re.sub(r"\s+", " ", (description or "").strip().lower())
    model = re.sub(r"\s+", " ", (type_model or "").strip().lower())
    return f"{desc}::{model}"


def _serialize_links(links: List[dict]) -> List[dict]:
    out = []
    seen = set()
    for link in links or []:
        equipment_id = (link.get("equipment_id") or "").strip()
        if not equipment_id or equipment_id in seen:
            continue
        seen.add(equipment_id)
        out.append({
            "equipment_id": equipment_id,
            "component_position": (link.get("component_position") or "").strip() or None,
        })
    return out


async def _validate_equipment_ids(user: dict, equipment_ids: List[str]) -> None:
    if not equipment_ids:
        return
    found = await db.equipment_nodes.find(
        merge_tenant_filter({"id": {"$in": equipment_ids}}, user),
        {"_id": 0, "id": 1},
    ).to_list(len(equipment_ids))
    found_ids = {d["id"] for d in found}
    missing = [eid for eid in equipment_ids if eid not in found_ids]
    if missing:
        raise HTTPException(status_code=400, detail=f"Equipment not found: {', '.join(missing[:5])}")


async def _find_by_duplicate_key(user: dict, description: str, type_model: str, exclude_id: Optional[str] = None) -> Optional[dict]:
    dup_key = _normalize_key(description, type_model)
    query: Dict[str, Any] = merge_tenant_filter({"duplicate_key": dup_key}, user)
    if exclude_id:
        query["id"] = {"$ne": exclude_id}
    return await db.spare_parts.find_one(query, {"_id": 0})


def _serialize_spare_part_doc(doc: dict) -> dict:
    """Return a JSON-safe spare-part dict for API responses."""
    out = dict(doc)
    for key in ("created_at", "updated_at"):
        value = out.get(key)
        if hasattr(value, "isoformat"):
            out[key] = value.isoformat()
    return out


def _build_list_query(
    user: dict,
    *,
    category_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    search: Optional[str] = None,
) -> Dict[str, Any]:
    clauses: List[Dict[str, Any]] = []
    if category_id:
        clauses.append({"category_id": category_id})
    if equipment_id:
        clauses.append({"equipment_links.equipment_id": equipment_id})
    if search:
        search_clause = or_search_fields(search, "description", "type_model", "manufacturer", "notes")
        if search_clause:
            clauses.append(search_clause)
    if not clauses:
        base_query: Dict[str, Any] = {}
    elif len(clauses) == 1:
        base_query = clauses[0]
    else:
        base_query = {"$and": clauses}
    return merge_tenant_filter(base_query, user)


async def _enrich_list_item(user: dict, doc: dict) -> Optional[dict]:
    spare_part_id = doc.get("id")
    if not spare_part_id:
        return None
    equipment_links = doc.get("equipment_links") or []
    file_count = await db.spare_part_files.count_documents(
        merge_tenant_filter({"spare_part_id": spare_part_id}, user),
    )
    has_url = bool(doc.get("document_url"))
    return {
        **_serialize_spare_part_doc(doc),
        "linked_equipment_count": len(equipment_links),
        "document_count": file_count + (1 if has_url else 0),
    }


async def list_spare_parts(
    user: dict,
    *,
    search: Optional[str] = None,
    category_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    sort_by: str = "updated_at",
    sort_dir: int = -1,
) -> dict:
    query = _build_list_query(
        user,
        category_id=category_id,
        equipment_id=equipment_id,
        search=search,
    )
    allowed_sort = {"description", "type_model", "manufacturer", "updated_at", "created_at"}
    sort_field = sort_by if sort_by in allowed_sort else "updated_at"
    direction = -1 if sort_dir < 0 else 1
    cursor = db.spare_parts.find(query, {"_id": 0}).sort(sort_field, direction)
    items = await cursor.to_list(500)
    enriched = []
    for doc in items:
        item = await _enrich_list_item(user, doc)
        if item:
            enriched.append(item)
    return {"spare_parts": enriched, "total": len(enriched)}


async def get_spare_part(user: dict, spare_part_id: str) -> dict:
    doc = await db.spare_parts.find_one(
        merge_tenant_filter({"id": spare_part_id}, user),
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Spare part not found")
    equipment_ids = [l["equipment_id"] for l in doc.get("equipment_links") or []]
    equipment_map: Dict[str, dict] = {}
    if equipment_ids:
        nodes = await db.equipment_nodes.find(
            merge_tenant_filter({"id": {"$in": equipment_ids}}, user),
            {"_id": 0, "id": 1, "name": 1, "equipment_type_id": 1, "equipment_type": 1},
        ).to_list(len(equipment_ids))
        equipment_map = {n["id"]: n for n in nodes}
    linked_equipment = []
    for link in doc.get("equipment_links") or []:
        eq = equipment_map.get(link["equipment_id"], {})
        linked_equipment.append({
            **link,
            "equipment_name": eq.get("name"),
            "equipment_type": eq.get("equipment_type") or eq.get("equipment_type_id"),
        })
    files = await db.spare_part_files.find(
        merge_tenant_filter({"spare_part_id": spare_part_id}, user),
        {"_id": 0},
    ).sort("uploaded_at", -1).to_list(100)
    return {
        **doc,
        "linked_equipment": linked_equipment,
        "files": files,
    }


async def create_spare_part(user: dict, payload: SparePartCreate) -> dict:
    links = _serialize_links([l.model_dump() for l in payload.equipment_links])
    if not links:
        raise HTTPException(status_code=400, detail="At least one equipment link is required")
    await _validate_equipment_ids(user, [l["equipment_id"] for l in links])

    existing = await _find_by_duplicate_key(user, payload.description, payload.type_model)
    if existing:
        return await _merge_into_existing(user, existing, payload, links)

    now = datetime.now(timezone.utc).isoformat()
    category_label = await resolve_category_label(user, payload.category_id)
    doc = with_tenant_id({
        "id": str(uuid4()),
        "description": payload.description.strip(),
        "type_model": payload.type_model.strip(),
        "manufacturer": (payload.manufacturer or "").strip() or None,
        "category_id": payload.category_id,
        "category": category_label,
        "notes": (payload.notes or "").strip() or None,
        "document_url": (payload.document_url or "").strip() or None,
        "equipment_links": links,
        "duplicate_key": _normalize_key(payload.description, payload.type_model),
        "created_by": user.get("id"),
        "created_at": now,
        "updated_at": now,
    }, user)
    await db.spare_parts.insert_one(doc)
    try:
        await sync_spare_part_equipment_links(
            spare_part_id=doc["id"],
            equipment_links=links,
            tenant_id=tenant_id_from_user(user),
        )
    except Exception:
        pass
    item = await _enrich_list_item(user, doc)
    return item or _serialize_spare_part_doc(doc)


async def _merge_into_existing(
    user: dict,
    existing: dict,
    payload: SparePartCreate,
    new_links: List[dict],
) -> dict:
    """Duplicate handling: update fields and append equipment links."""
    merged_links = _serialize_links((existing.get("equipment_links") or []) + new_links)
    await _validate_equipment_ids(user, [l["equipment_id"] for l in merged_links])
    updates: Dict[str, Any] = {
        "equipment_links": merged_links,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if payload.manufacturer:
        updates["manufacturer"] = payload.manufacturer.strip()
    if payload.category_id:
        updates["category_id"] = payload.category_id
        updates["category"] = await resolve_category_label(user, payload.category_id)
    if payload.notes:
        updates["notes"] = payload.notes.strip()
    if payload.document_url:
        updates["document_url"] = payload.document_url.strip()
    await db.spare_parts.update_one(
        merge_tenant_filter({"id": existing["id"]}, user),
        {"$set": updates},
    )
    try:
        await retire_spare_part_graph(existing["id"], user)
    except Exception:
        pass
    try:
        await sync_spare_part_equipment_links(
            spare_part_id=existing["id"],
            equipment_links=merged_links,
            tenant_id=tenant_id_from_user(user),
        )
    except Exception:
        pass
    updated = {**existing, **updates, "merged": True}
    item = await _enrich_list_item(user, updated)
    return item or _serialize_spare_part_doc(updated)


async def update_spare_part(user: dict, spare_part_id: str, payload: SparePartUpdate) -> dict:
    existing = await db.spare_parts.find_one(
        merge_tenant_filter({"id": spare_part_id}, user),
        {"_id": 0},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Spare part not found")

    description = payload.description if payload.description is not None else existing["description"]
    type_model = payload.type_model if payload.type_model is not None else existing["type_model"]
    dup = await _find_by_duplicate_key(user, description, type_model, exclude_id=spare_part_id)
    if dup:
        raise HTTPException(status_code=409, detail="A spare part with this description and type/model already exists")

    updates: Dict[str, Any] = {}
    if payload.description is not None:
        updates["description"] = payload.description.strip()
    if payload.type_model is not None:
        updates["type_model"] = payload.type_model.strip()
    if payload.manufacturer is not None:
        updates["manufacturer"] = payload.manufacturer.strip() or None
    if payload.notes is not None:
        updates["notes"] = payload.notes.strip() or None
    if payload.document_url is not None:
        updates["document_url"] = payload.document_url.strip() or None
    if payload.category_id is not None:
        updates["category_id"] = payload.category_id or None
        updates["category"] = await resolve_category_label(user, payload.category_id)
    if payload.equipment_links is not None:
        links = _serialize_links([l.model_dump() for l in payload.equipment_links])
        if not links:
            raise HTTPException(status_code=400, detail="At least one equipment link is required")
        await _validate_equipment_ids(user, [l["equipment_id"] for l in links])
        updates["equipment_links"] = links

    if not updates:
        return await get_spare_part(user, spare_part_id)

    updates["duplicate_key"] = _normalize_key(description, type_model)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.spare_parts.update_one(
        merge_tenant_filter({"id": spare_part_id}, user),
        {"$set": updates},
    )

    if payload.equipment_links is not None:
        try:
            await retire_spare_part_graph(spare_part_id, user)
        except Exception:
            pass
        try:
            await sync_spare_part_equipment_links(
                spare_part_id=spare_part_id,
                equipment_links=updates["equipment_links"],
                tenant_id=tenant_id_from_user(user),
            )
        except Exception:
            pass

    return await get_spare_part(user, spare_part_id)


async def delete_spare_part(user: dict, spare_part_id: str) -> dict:
    existing = await db.spare_parts.find_one(
        merge_tenant_filter({"id": spare_part_id}, user),
        {"_id": 0, "id": 1},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Spare part not found")
    await db.spare_part_files.delete_many(
        merge_tenant_filter({"spare_part_id": spare_part_id}, user),
    )
    await db.spare_parts.delete_one(merge_tenant_filter({"id": spare_part_id}, user))
    await retire_spare_part_graph(spare_part_id, user)
    return {"success": True, "id": spare_part_id}


async def link_equipment(
    user: dict,
    spare_part_id: str,
    equipment_id: str,
    component_position: Optional[str] = None,
) -> dict:
    part = await db.spare_parts.find_one(
        merge_tenant_filter({"id": spare_part_id}, user),
        {"_id": 0},
    )
    if not part:
        raise HTTPException(status_code=404, detail="Spare part not found")
    await _validate_equipment_ids(user, [equipment_id])
    links = _serialize_links(part.get("equipment_links") or [])
    if any(l["equipment_id"] == equipment_id for l in links):
        raise HTTPException(status_code=409, detail="Equipment already linked")
    links.append({
        "equipment_id": equipment_id,
        "component_position": (component_position or "").strip() or None,
    })
    await db.spare_parts.update_one(
        merge_tenant_filter({"id": spare_part_id}, user),
        {"$set": {
            "equipment_links": links,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    try:
        await sync_spare_part_equipment_links(
            spare_part_id=spare_part_id,
            equipment_links=links,
            tenant_id=tenant_id_from_user(user),
        )
    except Exception:
        pass
    return await get_spare_part(user, spare_part_id)


async def unlink_equipment(user: dict, spare_part_id: str, equipment_id: str) -> dict:
    part = await db.spare_parts.find_one(
        merge_tenant_filter({"id": spare_part_id}, user),
        {"_id": 0},
    )
    if not part:
        raise HTTPException(status_code=404, detail="Spare part not found")
    links = [l for l in (part.get("equipment_links") or []) if l.get("equipment_id") != equipment_id]
    if len(links) == len(part.get("equipment_links") or []):
        raise HTTPException(status_code=404, detail="Equipment link not found")
    if not links:
        raise HTTPException(status_code=400, detail="Spare part must remain linked to at least one equipment")
    await db.spare_parts.update_one(
        merge_tenant_filter({"id": spare_part_id}, user),
        {"$set": {
            "equipment_links": _serialize_links(links),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    try:
        await retire_spare_part_graph(spare_part_id, user)
    except Exception:
        pass
    try:
        await sync_spare_part_equipment_links(
            spare_part_id=spare_part_id,
            equipment_links=links,
            tenant_id=tenant_id_from_user(user),
        )
    except Exception:
        pass
    return await get_spare_part(user, spare_part_id)
