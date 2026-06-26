"""Disciplines configurator — taxonomy CRUD, normalize, merge."""
from datetime import datetime, timezone
from typing import List, Optional
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, Field

from database import db
from services.tenant_scope import scoped, scoped_job
from services.tenant_schema import with_tenant_id

DISCIPLINE_BEARING_COLLECTIONS = [
    ("form_templates", "discipline"),
    ("task_templates", "discipline"),
    ("task_instances", "discipline"),
    ("scheduled_tasks", "discipline"),
    ("central_actions", "discipline"),
    ("maintenance_programs", "discipline"),
    ("maintenance_programs_v2", "discipline"),
]


def _q(user: Optional[dict], query: Optional[dict] = None) -> dict:
    return scoped(user, query) if user else scoped_job(query)


class DisciplineCreate(BaseModel):
    value: str = Field(..., min_length=1, max_length=64)
    label: str = Field(..., min_length=1, max_length=80)
    color: str = "bg-slate-100 text-slate-700"
    aliases: List[str] = Field(default_factory=list)
    default_assignee_user_id: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: bool = True


class DisciplineUpdate(BaseModel):
    label: Optional[str] = None
    color: Optional[str] = None
    aliases: Optional[List[str]] = None
    default_assignee_user_id: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class ReorderItem(BaseModel):
    id: str
    sort_order: int


class MergePayload(BaseModel):
    variants: List[str]
    target_discipline_id: str
    mode: str = "apply"
    dry_run: bool = False


def _admin_only(user: dict) -> None:
    if user.get("role") not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Admin role required")


async def list_disciplines(
    include_inactive: bool = False,
    user: Optional[dict] = None,
) -> dict:
    query = {} if include_inactive else {"is_active": True}
    items = await db.disciplines.find(_q(user, query), {"_id": 0}).sort("sort_order", 1).to_list(200)
    return {"disciplines": items, "total": len(items)}


async def normalize_discipline(value: str, user: Optional[dict] = None) -> dict:
    if not value:
        return {"input": value, "normalized": None, "matched": False}
    lower = value.strip().lower()
    items = await db.disciplines.find(_q(user, {}), {"_id": 0}).to_list(200)
    for d in items:
        if d["value"].lower() == lower or d["label"].lower() == lower:
            return {"input": value, "normalized": d["value"], "matched": True, "via": "direct"}
        if lower in [a.lower() for a in d.get("aliases") or []]:
            return {"input": value, "normalized": d["value"], "matched": True, "via": "alias"}
    return {"input": value, "normalized": None, "matched": False}


async def create_discipline(user: dict, payload: DisciplineCreate) -> dict:
    _admin_only(user)
    value = payload.value.strip().lower().replace(" ", "_")
    existing = await db.disciplines.find_one(scoped(user, {"value": value}), {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail=f"Discipline '{value}' already exists")
    if payload.sort_order is None:
        max_doc = await db.disciplines.find_one(
            scoped(user, {}), {"_id": 0, "sort_order": 1}, sort=[("sort_order", -1)]
        )
        sort_order = (max_doc.get("sort_order", 0) if max_doc else 0) + 1
    else:
        sort_order = payload.sort_order
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid4()),
        "value": value,
        "label": payload.label.strip(),
        "color": payload.color,
        "aliases": [a.strip().lower() for a in payload.aliases if a.strip()],
        "default_assignee_user_id": payload.default_assignee_user_id,
        "sort_order": sort_order,
        "is_active": payload.is_active,
        "created_at": now,
        "updated_at": now,
    }
    await db.disciplines.insert_one(with_tenant_id(doc, user))
    doc.pop("_id", None)
    return doc


async def update_discipline(user: dict, discipline_id: str, payload: DisciplineUpdate) -> dict:
    _admin_only(user)
    existing = await db.disciplines.find_one(scoped(user, {"id": discipline_id}), {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Discipline not found")
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "aliases" in updates:
        updates["aliases"] = [a.strip().lower() for a in updates["aliases"] if a.strip()]
    if "label" in updates:
        updates["label"] = updates["label"].strip()
    updates["updated_at"] = datetime.now(timezone.utc)
    await db.disciplines.update_one(scoped(user, {"id": discipline_id}), {"$set": updates})
    return {**existing, **updates}


async def reorder_disciplines(user: dict, items: List[ReorderItem]) -> dict:
    _admin_only(user)
    now = datetime.now(timezone.utc)
    for item in items:
        await db.disciplines.update_one(
            scoped(user, {"id": item.id}),
            {"$set": {"sort_order": item.sort_order, "updated_at": now}},
        )
    return {"updated": len(items)}


async def delete_discipline(user: dict, discipline_id: str) -> dict:
    _admin_only(user)
    existing = await db.disciplines.find_one(scoped(user, {"id": discipline_id}), {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Discipline not found")
    value = existing["value"]
    label = existing["label"]
    ref_count = 0
    for col, _ in DISCIPLINE_BEARING_COLLECTIONS:
        ref_count += await db[col].count_documents(scoped(user, {
            "$or": [{"discipline": value}, {"discipline": label}],
        }))
    if ref_count > 0:
        await db.disciplines.update_one(
            scoped(user, {"id": discipline_id}),
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}},
        )
        return {"id": discipline_id, "soft_deleted": True, "references": ref_count}
    await db.disciplines.delete_one(scoped(user, {"id": discipline_id}))
    return {"id": discipline_id, "soft_deleted": False, "references": 0}


async def cleanup_suggestions(user: dict) -> dict:
    _admin_only(user)
    canonical = await db.disciplines.find(scoped(user, {}), {"_id": 0}).to_list(200)
    known = set()
    for d in canonical:
        known.add(d["value"].lower())
        known.add(d["label"].lower())
        for a in d.get("aliases") or []:
            known.add(a.lower())

    findings = {}
    for col, field in DISCIPLINE_BEARING_COLLECTIONS:
        try:
            distinct = await db[col].distinct(field, scoped(user, {}))
        except Exception:
            continue
        for raw in distinct:
            if raw is None or raw == "":
                continue
            lo = str(raw).strip().lower()
            if not lo or lo in known:
                continue
            count = await db[col].count_documents(scoped(user, {field: raw}))
            entry = findings.setdefault(lo, {"variant": raw, "total": 0, "by_collection": {}})
            entry["total"] += count
            entry["by_collection"][col] = entry["by_collection"].get(col, 0) + count

    suggestions = []
    for lo, info in findings.items():
        suggested = None
        for d in canonical:
            label_lo = d["label"].lower()
            value_lo = d["value"].lower()
            if label_lo in lo or lo in label_lo or value_lo in lo or lo in value_lo:
                suggested = {"id": d["id"], "value": d["value"], "label": d["label"]}
                break
        suggestions.append({
            "variant": info["variant"],
            "variant_lower": lo,
            "total": info["total"],
            "by_collection": info["by_collection"],
            "suggested": suggested,
        })
    suggestions.sort(key=lambda s: -s["total"])
    return {"suggestions": suggestions, "total": len(suggestions)}


async def merge_discipline_variants(user: dict, payload: MergePayload) -> dict:
    _admin_only(user)
    target = await db.disciplines.find_one(scoped(user, {"id": payload.target_discipline_id}), {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target discipline not found")
    if not payload.variants:
        raise HTTPException(status_code=400, detail="At least one variant required")

    variants_clean = [v for v in (s.strip() for s in payload.variants) if v]
    variants_lower = [v.lower() for v in variants_clean]

    new_aliases = sorted(set([*(target.get("aliases") or []), *variants_lower]))
    if not payload.dry_run:
        await db.disciplines.update_one(
            scoped(user, {"id": payload.target_discipline_id}),
            {"$set": {"aliases": new_aliases, "updated_at": datetime.now(timezone.utc)}},
        )

    if payload.mode == "alias_only":
        return {
            "mode": "alias_only",
            "dry_run": payload.dry_run,
            "aliases_added": variants_lower,
            "rewrites": {},
        }

    target_value = target["value"]
    rewrites = {}
    for col, field in DISCIPLINE_BEARING_COLLECTIONS:
        match = {
            "$expr": {
                "$in": [
                    {"$toLower": {"$ifNull": [f"${field}", ""]}},
                    variants_lower,
                ]
            }
        }
        count = await db[col].count_documents(scoped(user, match))
        if count == 0:
            rewrites[col] = 0
            continue
        if payload.dry_run:
            rewrites[col] = count
        else:
            res = await db[col].update_many(scoped(user, match), {"$set": {field: target_value}})
            rewrites[col] = res.modified_count

    return {
        "mode": "apply",
        "dry_run": payload.dry_run,
        "target": {"id": target["id"], "value": target_value, "label": target["label"]},
        "aliases_added": variants_lower,
        "rewrites": rewrites,
        "total_rewritten": sum(rewrites.values()),
    }
