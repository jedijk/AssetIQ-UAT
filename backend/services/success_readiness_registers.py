"""Register CRUD skeleton for Success Readiness."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from database import db
from services.success_readiness_models import REGISTER_TYPES, RegisterType
from services.success_readiness_register_scoring import derive_register_completion_pct
from services.tenant_schema import merge_tenant_filter, with_tenant_id


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_safe(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    return value


def _serialize_register_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    row = _json_safe(dict(doc))
    oid = row.pop("_id", None)
    row["id"] = str(oid) if oid is not None else row.get("id")
    return row


async def list_register_entries(
    register_type: RegisterType,
    user: dict,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    if register_type not in REGISTER_TYPES:
        raise ValueError(f"Unknown register type: {register_type}")
    query = merge_tenant_filter({"register_type": register_type}, user)
    cursor = db.success_readiness_registers.find(query).sort("updated_at", -1).limit(limit)
    rows: List[Dict[str, Any]] = []
    async for doc in cursor:
        rows.append(_serialize_register_doc(doc))
    return rows


async def create_register_entry(
    register_type: RegisterType,
    payload: Dict[str, Any],
    user: dict,
) -> Dict[str, Any]:
    if register_type not in REGISTER_TYPES:
        raise ValueError(f"Unknown register type: {register_type}")

    doc: Dict[str, Any] = {
        "register_type": register_type,
        "title": payload.get("title", "").strip() or "Untitled",
        "description": payload.get("description", ""),
        "status": payload.get("status", "draft"),
        "owner": payload.get("owner") or user.get("name"),
        "metadata": payload.get("metadata") or {},
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "created_by": user.get("id") or user.get("user_id"),
    }
    doc["completion_pct"] = derive_register_completion_pct(register_type, {**payload, **doc})
    with_tenant_id(doc, user)
    result = await db.success_readiness_registers.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    return doc


async def update_register_entry(
    entry_id: str,
    payload: Dict[str, Any],
    user: dict,
) -> Optional[Dict[str, Any]]:
    from bson import ObjectId

    updates: Dict[str, Any] = {"updated_at": _now_iso()}
    for field in ("title", "description", "status", "owner", "metadata"):
        if field in payload:
            updates[field] = payload[field]
    merged = {**updates, **payload}
    if "metadata" in payload or any(k in payload for k in ("status", "completion_pct")):
        existing = await db.success_readiness_registers.find_one(
            merge_tenant_filter({"_id": ObjectId(entry_id)}, user)
        )
        if existing:
            merged = {**existing, **updates}
            updates["completion_pct"] = derive_register_completion_pct(
                existing.get("register_type", ""),
                merged,
            )
    elif "completion_pct" in payload:
        updates["completion_pct"] = min(100, max(0, int(payload["completion_pct"])))

    result = await db.success_readiness_registers.find_one_and_update(
        merge_tenant_filter({"_id": ObjectId(entry_id)}, user),
        {"$set": updates},
        return_document=True,
    )
    if not result:
        return None
    result["id"] = str(result.pop("_id"))
    return result
