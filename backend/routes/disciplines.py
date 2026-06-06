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
