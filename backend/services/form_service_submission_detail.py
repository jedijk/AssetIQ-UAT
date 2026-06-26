"""Single form submission fetch with attachment-safe aggregation."""
import asyncio
import logging
from typing import Any, Dict, Optional

from bson import ObjectId

from services.form_service_serializers import serialize_submission
from services.tenant_schema import merge_tenant_filter

logger = logging.getLogger(__name__)


def _attachment_pipeline_match(match: Dict[str, Any]) -> list:
    return [
        {"$match": match},
        {
            "$addFields": {
                "attachments": {
                    "$map": {
                        "input": {"$ifNull": ["$attachments", []]},
                        "as": "att",
                        "in": {
                            "$cond": {
                                "if": {
                                    "$and": [
                                        {"$ifNull": ["$$att.url", False]},
                                        {"$ne": ["$$att.url", ""]},
                                    ]
                                },
                                "then": {
                                    "name": "$$att.name",
                                    "type": "$$att.type",
                                    "size": "$$att.size",
                                    "url": "$$att.url",
                                },
                                "else": {
                                    "$cond": {
                                        "if": {"$ifNull": ["$$att.error", False]},
                                        "then": {
                                            "name": "$$att.name",
                                            "type": "$$att.type",
                                            "size": "$$att.size",
                                            "error": "$$att.error",
                                            "needs_migration": True,
                                        },
                                        "else": {
                                            "$cond": {
                                                "if": {
                                                    "$gt": [
                                                        {"$strLenCP": {"$ifNull": ["$$att.data", ""]}},
                                                        50000,
                                                    ]
                                                },
                                                "then": {
                                                    "name": "$$att.name",
                                                    "type": "$$att.type",
                                                    "size": "$$att.size",
                                                    "error": "Legacy attachment - file too large to display inline",
                                                    "needs_migration": True,
                                                },
                                                "else": {
                                                    "name": "$$att.name",
                                                    "type": "$$att.type",
                                                    "size": "$$att.size",
                                                    "data": {"$ifNull": ["$$att.data", ""]},
                                                },
                                            }
                                        },
                                    }
                                },
                            }
                        },
                    }
                }
            }
        },
    ]


async def get_submission_by_id(
    submissions,
    submission_id: str,
    user: Optional[dict] = None,
) -> Optional[Dict[str, Any]]:
    """Get a specific submission by custom ID or MongoDB ObjectId."""
    pipeline = _attachment_pipeline_match(
        merge_tenant_filter({"id": submission_id}, user)
    )

    try:
        result = await asyncio.wait_for(
            submissions.aggregate(pipeline).to_list(length=1),
            timeout=5.0,
        )
        if result:
            return serialize_submission(result[0])

        if ObjectId.is_valid(submission_id):
            pipeline = _attachment_pipeline_match(
                merge_tenant_filter({"_id": ObjectId(submission_id)}, user)
            )
            result = await asyncio.wait_for(
                submissions.aggregate(pipeline).to_list(length=1),
                timeout=5.0,
            )
            if result:
                return serialize_submission(result[0])

        return None

    except asyncio.TimeoutError:
        logger.warning(
            "Timeout fetching submission %s - falling back to projection",
            submission_id,
        )
        projection = {"attachments.data": 0}
        doc = await submissions.find_one({"id": submission_id}, projection)
        if not doc and ObjectId.is_valid(submission_id):
            doc = await submissions.find_one({"_id": ObjectId(submission_id)}, projection)
        if doc:
            return serialize_submission(doc)
        return None
