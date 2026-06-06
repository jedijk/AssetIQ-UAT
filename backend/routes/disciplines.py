"""
Disciplines configurator — single source of truth for the discipline taxonomy
used across Forms, Tasks, Actions, AI Recommendations, FMEA and Maintenance.

The collection seeds itself from the current 8 hardcoded disciplines on first
boot so existing data remains valid. The frontend `useDisciplines()` hook
reads from `GET /api/disciplines`.

CRUD endpoints (admin) and the merge / cleanup-suggestions flow land in P1.
"""
from datetime import datetime, timezone
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import db
from auth import get_current_user

router = APIRouter(prefix="/disciplines", tags=["disciplines"])


# ---------- Seed data (kept in sync with frontend/src/constants/disciplines.js) ----------
SEED_DISCIPLINES = [
    {
        "value": "rotating",
        "label": "Rotating",
        "color": "bg-blue-100 text-blue-700",
        "aliases": ["mechanical", "rotating equipment"],
        "sort_order": 1,
    },
    {
        "value": "static",
        "label": "Static",
        "color": "bg-slate-100 text-slate-700",
        "aliases": ["static equipment"],
        "sort_order": 2,
    },
    {
        "value": "piping",
        "label": "Piping",
        "color": "bg-teal-100 text-teal-700",
        "aliases": [],
        "sort_order": 3,
    },
    {
        "value": "electrical",
        "label": "Electrical",
        "color": "bg-amber-100 text-amber-700",
        "aliases": ["e&i"],
        "sort_order": 4,
    },
    {
        "value": "instrumentation",
        "label": "Instrumentation",
        "color": "bg-purple-100 text-purple-700",
        "aliases": [],
        "sort_order": 5,
    },
    {
        "value": "civil",
        "label": "Civil",
        "color": "bg-orange-100 text-orange-700",
        "aliases": [],
        "sort_order": 6,
    },
    {
        "value": "operations",
        "label": "Operations",
        "color": "bg-green-100 text-green-700",
        "aliases": [
            "process",
            "maintenance",
            "safety",
            "reliability",
            "multi-discipline",
            "multi_discipline",
            "engineering",
        ],
        "sort_order": 7,
    },
    {
        "value": "laboratory",
        "label": "Laboratory",
        "color": "bg-cyan-100 text-cyan-700",
        "aliases": ["inspection", "lab"],
        "sort_order": 8,
    },
]


# ---------- Models ----------
class Discipline(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    value: str
    label: str
    color: str = "bg-slate-100 text-slate-700"
    aliases: List[str] = Field(default_factory=list)
    default_assignee_user_id: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------- Seeder (called from server startup) ----------
async def seed_disciplines_if_empty() -> int:
    """Insert SEED_DISCIPLINES if the collection is empty. Returns inserted count."""
    existing = await db.disciplines.count_documents({})
    if existing > 0:
        return 0
    now = datetime.now(timezone.utc)
    docs = []
    for d in SEED_DISCIPLINES:
        docs.append(
            {
                "id": str(uuid4()),
                "value": d["value"],
                "label": d["label"],
                "color": d["color"],
                "aliases": d["aliases"],
                "default_assignee_user_id": None,
                "sort_order": d["sort_order"],
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            }
        )
    await db.disciplines.insert_many(docs)
    return len(docs)


# ---------- Endpoints ----------
@router.get("")
async def list_disciplines(
    include_inactive: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """Return the configurator-managed discipline list.

    Frontend `useDisciplines()` hook calls this. Defaults to active-only.
    """
    query = {} if include_inactive else {"is_active": True}
    cursor = db.disciplines.find(query, {"_id": 0}).sort("sort_order", 1)
    items = await cursor.to_list(200)
    return {"disciplines": items, "total": len(items)}


@router.get("/normalize")
async def normalize_discipline(
    value: str,
    current_user: dict = Depends(get_current_user),
):
    """Normalize a free-text discipline string to its canonical value.

    Used by migrations and the bridge service when copying discipline from
    legacy records. Resolves direct + alias matches case-insensitively.
    """
    if not value:
        return {"input": value, "normalized": None, "matched": False}
    lower = value.strip().lower()
    items = await db.disciplines.find({}, {"_id": 0}).to_list(200)
    for d in items:
        if d["value"].lower() == lower or d["label"].lower() == lower:
            return {"input": value, "normalized": d["value"], "matched": True, "via": "direct"}
        if lower in [a.lower() for a in d.get("aliases") or []]:
            return {"input": value, "normalized": d["value"], "matched": True, "via": "alias"}
    return {"input": value, "normalized": None, "matched": False}



# ---------- Admin CRUD ----------
def _admin_only(current_user: dict):
    role = current_user.get("role")
    if role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Admin role required")


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


@router.post("")
async def create_discipline(
    payload: DisciplineCreate,
    current_user: dict = Depends(get_current_user),
):
    _admin_only(current_user)
    value = payload.value.strip().lower().replace(" ", "_")
    existing = await db.disciplines.find_one({"value": value}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail=f"Discipline '{value}' already exists")
    if payload.sort_order is None:
        max_doc = await db.disciplines.find_one({}, {"_id": 0, "sort_order": 1}, sort=[("sort_order", -1)])
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
    await db.disciplines.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{discipline_id}")
async def update_discipline(
    discipline_id: str,
    payload: DisciplineUpdate,
    current_user: dict = Depends(get_current_user),
):
    _admin_only(current_user)
    existing = await db.disciplines.find_one({"id": discipline_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Discipline not found")
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "aliases" in updates:
        updates["aliases"] = [a.strip().lower() for a in updates["aliases"] if a.strip()]
    if "label" in updates:
        updates["label"] = updates["label"].strip()
    updates["updated_at"] = datetime.now(timezone.utc)
    await db.disciplines.update_one({"id": discipline_id}, {"$set": updates})
    return {**existing, **updates}


@router.patch("/reorder")
async def reorder_disciplines(
    items: List[ReorderItem],
    current_user: dict = Depends(get_current_user),
):
    _admin_only(current_user)
    now = datetime.now(timezone.utc)
    for item in items:
        await db.disciplines.update_one(
            {"id": item.id},
            {"$set": {"sort_order": item.sort_order, "updated_at": now}},
        )
    return {"updated": len(items)}


@router.delete("/{discipline_id}")
async def delete_discipline(
    discipline_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Soft-delete if anything still references the discipline, hard delete otherwise."""
    _admin_only(current_user)
    existing = await db.disciplines.find_one({"id": discipline_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Discipline not found")
    value = existing["value"]
    label = existing["label"]
    ref_count = 0
    for col in ("form_templates", "task_templates", "task_instances", "scheduled_tasks",
                "central_actions", "maintenance_programs", "maintenance_programs_v2"):
        ref_count += await db[col].count_documents({
            "$or": [{"discipline": value}, {"discipline": label}]
        })
    if ref_count > 0:
        await db.disciplines.update_one(
            {"id": discipline_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}},
        )
        return {"id": discipline_id, "soft_deleted": True, "references": ref_count}
    await db.disciplines.delete_one({"id": discipline_id})
    return {"id": discipline_id, "soft_deleted": False, "references": 0}


# ---------- Cleanup scan + Merge apply ----------
DISCIPLINE_BEARING_COLLECTIONS = [
    ("form_templates", "discipline"),
    ("task_templates", "discipline"),
    ("task_instances", "discipline"),
    ("scheduled_tasks", "discipline"),
    ("central_actions", "discipline"),
    ("maintenance_programs", "discipline"),
    ("maintenance_programs_v2", "discipline"),
]


@router.get("/cleanup-suggestions")
async def cleanup_suggestions(current_user: dict = Depends(get_current_user)):
    """Scan all discipline-bearing collections and surface unknown variants
    with a suggested canonical merge target.
    """
    _admin_only(current_user)
    canonical = await db.disciplines.find({}, {"_id": 0}).to_list(200)
    known = set()
    for d in canonical:
        known.add(d["value"].lower())
        known.add(d["label"].lower())
        for a in d.get("aliases") or []:
            known.add(a.lower())

    findings = {}  # variant_lower -> { variant, total, by_collection }
    for col, field in DISCIPLINE_BEARING_COLLECTIONS:
        try:
            distinct = await db[col].distinct(field)
        except Exception:
            continue
        for raw in distinct:
            if raw is None or raw == "":
                continue
            lo = str(raw).strip().lower()
            if not lo or lo in known:
                continue
            count = await db[col].count_documents({field: raw})
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


class MergePayload(BaseModel):
    variants: List[str]
    target_discipline_id: str
    mode: str = "apply"  # "apply" or "alias_only"
    dry_run: bool = False


@router.post("/merge")
async def merge_discipline_variants(
    payload: MergePayload,
    current_user: dict = Depends(get_current_user),
):
    """Merge free-text discipline variants into a canonical discipline.

    - mode="alias_only": just append the variants to the target's `aliases`.
    - mode="apply": also rewrite the discipline field across all bearing
      collections to the target's canonical `value`.
    With dry_run=True nothing is written and counts represent the diff.
    """
    _admin_only(current_user)
    target = await db.disciplines.find_one({"id": payload.target_discipline_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target discipline not found")
    if not payload.variants:
        raise HTTPException(status_code=400, detail="At least one variant required")

    variants_clean = [v for v in (s.strip() for s in payload.variants) if v]
    variants_lower = [v.lower() for v in variants_clean]

    # Always update the target's aliases — future inputs will resolve via normalize.
    new_aliases = sorted(set([*(target.get("aliases") or []), *variants_lower]))
    if not payload.dry_run:
        await db.disciplines.update_one(
            {"id": payload.target_discipline_id},
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
        count = await db[col].count_documents(match)
        if count == 0:
            rewrites[col] = 0
            continue
        if payload.dry_run:
            rewrites[col] = count
        else:
            res = await db[col].update_many(match, {"$set": {field: target_value}})
            rewrites[col] = res.modified_count

    return {
        "mode": "apply",
        "dry_run": payload.dry_run,
        "target": {"id": target["id"], "value": target_value, "label": target["label"]},
        "aliases_added": variants_lower,
        "rewrites": rewrites,
        "total_rewritten": sum(rewrites.values()),
    }
