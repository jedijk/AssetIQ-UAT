"""Discipline seed data and startup seeding — extracted from routes for layer decoupling."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from database import db

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
