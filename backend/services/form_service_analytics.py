"""Form template analytics aggregation."""
from datetime import datetime
from typing import Any, Awaitable, Callable, Dict, Optional

from services.tenant_schema import merge_tenant_filter


async def get_form_analytics(
    *,
    submissions,
    get_template_by_id: Callable[[str], Awaitable[Optional[Dict[str, Any]]]],
    form_template_id: str,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    user: Optional[dict] = None,
) -> Dict[str, Any]:
    """Get analytics for a form template."""
    query = {"form_template_id": form_template_id}
    if from_date:
        query["submitted_at"] = {"$gte": from_date}
    if to_date:
        query.setdefault("submitted_at", {})["$lte"] = to_date

    query = merge_tenant_filter(query, user)

    total = await submissions.count_documents(query)
    warnings = await submissions.count_documents({**query, "has_warnings": True})
    criticals = await submissions.count_documents({**query, "has_critical": True})

    template = await get_template_by_id(form_template_id)
    field_stats = {}

    if template:
        for field in template.get("fields", []):
            if field.get("field_type") == "numeric":
                pipeline = [
                    {"$match": query},
                    {"$unwind": "$values"},
                    {"$match": {"values.field_id": field["id"]}},
                    {
                        "$group": {
                            "_id": None,
                            "avg": {"$avg": {"$toDouble": "$values.value"}},
                            "min": {"$min": {"$toDouble": "$values.value"}},
                            "max": {"$max": {"$toDouble": "$values.value"}},
                            "count": {"$sum": 1},
                        }
                    },
                ]
                result = await submissions.aggregate(pipeline).to_list(1)
                if result:
                    field_stats[field["id"]] = {
                        "label": field.get("label"),
                        "unit": field.get("unit"),
                        "avg": round(result[0]["avg"], 2) if result[0]["avg"] else None,
                        "min": result[0]["min"],
                        "max": result[0]["max"],
                        "count": result[0]["count"],
                    }

    return {
        "form_template_id": form_template_id,
        "total_submissions": total,
        "with_warnings": warnings,
        "with_criticals": criticals,
        "warning_rate": round(warnings / total * 100, 1) if total > 0 else 0,
        "critical_rate": round(criticals / total * 100, 1) if total > 0 else 0,
        "field_statistics": field_stats,
    }
