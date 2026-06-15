"""Tenant-scoped Mongo helpers for AI photo extraction — Wave 12."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from database import db
from services.tenant_schema import merge_tenant_filter, prepend_tenant_match, with_tenant_id


def scoped(user: Optional[dict], query: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return merge_tenant_filter(query or {}, user)


async def find_form_template(user: dict, template_id: str) -> Optional[dict]:
    return await db.form_templates.find_one(
        scoped(user, {"id": template_id}),
        {"_id": 0, "fields": 1, "photo_extraction_config": 1},
    )


async def get_correction_hints(user: dict, form_template_id: str) -> List[str]:
    pipeline = prepend_tenant_match(
        [
            {"$match": {"form_template_id": form_template_id}},
            {"$sort": {"created_at": -1}},
            {"$limit": 50},
            {
                "$group": {
                    "_id": "$field_key",
                    "corrections": {
                        "$push": {
                            "ai_value": "$ai_value",
                            "corrected_value": "$corrected_value",
                        }
                    },
                    "count": {"$sum": 1},
                }
            },
            {"$match": {"count": {"$gte": 2}}},
        ],
        user,
    )
    results = await db.ai_extraction_corrections.aggregate(pipeline).to_list(20)

    hints = []
    for row in results:
        key = row["_id"]
        latest = row["corrections"][0]
        hints.append(
            f'Note for "{key}": Users have corrected this field {row["count"]} times. '
            f'AI often reads "{latest["ai_value"]}" but correct value tends to be "{latest["corrected_value"]}". '
            f"Please be extra careful with this field."
        )
    return hints


async def insert_corrections(user: dict, docs: List[dict]) -> int:
    if not docs:
        return 0
    stamped = [with_tenant_id(dict(doc), user) for doc in docs]
    await db.ai_extraction_corrections.insert_many(stamped)
    return len(stamped)
