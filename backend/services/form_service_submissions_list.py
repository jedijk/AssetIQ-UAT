"""Ultra-lightweight form submission list query."""
import asyncio
import logging
import time
from typing import Any, Dict, Optional

from services.form_service_serializers import serialize_datetime
from services.tenant_schema import merge_tenant_filter

logger = logging.getLogger(__name__)


async def list_submissions_lightweight(
    *,
    db,
    submissions,
    form_template_id: Optional[str] = None,
    template_id: Optional[str] = None,
    has_warnings: Optional[bool] = None,
    has_critical: Optional[bool] = None,
    skip: int = 0,
    limit: int = 10,
    user: Optional[dict] = None,
) -> Dict[str, Any]:
    """
    Lightweight submission list for list view.
    Performance target: < 500ms; skip/limit max 200; full match count in `total`.
    """
    start_time = time.time()

    limit = min(max(limit, 1), 200)
    skip = max(skip, 0)

    projection = {
        "_id": 0,
        "id": 1,
        "form_template_id": 1,
        "form_template_name": 1,
        "label_template_id": 1,
        "task_instance_id": 1,
        "equipment_id": 1,
        "equipment_name": 1,
        "submitted_by": 1,
        "submitted_by_name": 1,
        "submitted_at": 1,
        "created_at": 1,
        "status": 1,
        "has_warnings": 1,
        "has_critical": 1,
        "discipline": 1,
        "task_template_name": 1,
    }

    query = {}
    effective_template_id = form_template_id or template_id
    if effective_template_id:
        query["form_template_id"] = effective_template_id
    if has_warnings is not None:
        query["has_warnings"] = has_warnings
    if has_critical is not None:
        query["has_critical"] = has_critical

    query = merge_tenant_filter(query, user)

    try:
        total_matching = await asyncio.wait_for(
            submissions.count_documents(query),
            timeout=2.0,
        )

        async def execute_query():
            cursor = submissions.find(query, projection).sort(
                [("submitted_at", -1), ("created_at", -1)]
            ).skip(skip).limit(limit)
            return await cursor.to_list(length=limit)

        raw_submissions = await asyncio.wait_for(execute_query(), timeout=2.0)

        equipment_ids = list(
            {doc.get("equipment_id") for doc in raw_submissions if doc.get("equipment_id")}
        )

        equipment_tag_map = {}
        if equipment_ids:
            try:
                equip_cursor = db.equipment_nodes.find(
                    {"id": {"$in": equipment_ids}},
                    {"_id": 0, "id": 1, "tag": 1},
                )
                async for eq in equip_cursor:
                    if eq.get("tag"):
                        equipment_tag_map[eq["id"]] = eq["tag"]
            except Exception:
                pass

        user_ids = list(
            {doc.get("submitted_by") for doc in raw_submissions if doc.get("submitted_by")}
        )

        user_avatars = {}
        if user_ids:
            try:

                async def fetch_avatars():
                    users = await db.users.find(
                        {"id": {"$in": user_ids}},
                        {"_id": 0, "id": 1, "avatar_path": 1, "avatar_data": 1},
                    ).to_list(length=200)
                    return {
                        u["id"]: bool(u.get("avatar_path") or u.get("avatar_data"))
                        for u in users
                    }

                user_avatars = await asyncio.wait_for(fetch_avatars(), timeout=1.0)
            except asyncio.TimeoutError:
                pass

        submissions_out = []
        for doc in raw_submissions:
            submitted_at = serialize_datetime(doc.get("submitted_at") or doc.get("created_at"))
            created_at = serialize_datetime(doc.get("created_at"))

            submitted_by = doc.get("submitted_by")
            submitted_by_photo = None
            if submitted_by and user_avatars.get(submitted_by):
                submitted_by_photo = f"/api/users/{submitted_by}/avatar"

            submissions_out.append(
                {
                    "id": doc.get("id"),
                    "form_template_id": doc.get("form_template_id"),
                    "form_template_name": doc.get("form_template_name"),
                    "label_template_id": doc.get("label_template_id"),
                    "task_instance_id": doc.get("task_instance_id"),
                    "task_template_name": doc.get("task_template_name"),
                    "equipment_id": doc.get("equipment_id"),
                    "equipment_name": doc.get("equipment_name"),
                    "equipment_tag": equipment_tag_map.get(doc.get("equipment_id")),
                    "submitted_by": submitted_by,
                    "submitted_by_name": doc.get("submitted_by_name"),
                    "submitted_by_photo": submitted_by_photo,
                    "submitted_at": submitted_at,
                    "created_at": created_at,
                    "status": doc.get("status", "completed"),
                    "has_warnings": doc.get("has_warnings", False),
                    "has_critical": doc.get("has_critical", False),
                    "discipline": doc.get("discipline"),
                }
            )

        duration = time.time() - start_time
        logger.info(
            "GET /api/form-submissions completed in %.3fs - returned %s of %s matching (skip=%s, limit=%s)",
            duration,
            len(submissions_out),
            total_matching,
            skip,
            limit,
        )

        return {
            "total": total_matching,
            "returned": len(submissions_out),
            "skip": skip,
            "limit": limit,
            "submissions": submissions_out,
        }

    except asyncio.TimeoutError:
        logger.error("GET /api/form-submissions TIMEOUT after 3s")
        return {"total": 0, "submissions": [], "error": "timeout"}
    except Exception as e:
        logger.error("GET /api/form-submissions ERROR: %s", e)
        return {"total": 0, "submissions": [], "error": "timeout"}
