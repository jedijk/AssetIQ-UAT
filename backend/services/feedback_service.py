"""
Service layer for User Feedback operations.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from database import db
from services.tenant_scope import scoped, scoped_job
from services.tenant_schema import with_tenant_id

logger = logging.getLogger(__name__)


def _q(user: Optional[dict], query: Optional[dict] = None) -> dict:
    return scoped(user, query) if user else scoped_job(query)


async def create_feedback(
    user_id: str,
    user_name: str,
    feedback_type: str,
    message: str,
    severity: Optional[str] = None,
    screenshot_url: Optional[str] = None,
    module: Optional[str] = None,
    audio_url: Optional[str] = None,
    user: Optional[dict] = None,
) -> dict:
    """Create a new feedback entry."""
    feedback_id = str(uuid.uuid4())
    feedback_doc = with_tenant_id({
        "id": feedback_id,
        "user_id": user_id,
        "user_name": user_name,
        "type": feedback_type,
        "message": message,
        "status": "new",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "screenshot_url": screenshot_url,
        "severity": severity,
        "user_visible_response": None,
        "module": module,
        "audio_url": audio_url,
    }, user or {"id": user_id})
    await db.feedback.insert_one(feedback_doc)
    logger.info(f"Feedback created: {feedback_id} by user {user_name} ({user_id})")
    return {k: v for k, v in feedback_doc.items() if k != "_id"}


async def get_user_feedback(user_id: str, user: Optional[dict] = None) -> List[dict]:
    """Get all feedback submitted by a specific user, sorted by newest first."""
    cursor = db.feedback.find(
        _q(user, {"user_id": user_id}),
        {"_id": 0}
    ).sort("timestamp", -1)
    items = await cursor.to_list(length=500)
    return items


async def get_feedback_by_id(
    feedback_id: str,
    user_id: Optional[str] = None,
    user: Optional[dict] = None,
) -> Optional[dict]:
    """Get a specific feedback item. If user_id provided, ensures ownership."""
    query = {"id": feedback_id}
    if user_id:
        query["user_id"] = user_id
    doc = await db.feedback.find_one(_q(user, query), {"_id": 0})
    return doc


async def get_all_feedback(
    status_filter: Optional[str] = None,
    user: Optional[dict] = None,
) -> List[dict]:
    """Admin: Get all feedback, optionally filtered by status."""
    query = {}
    if status_filter:
        query["status"] = status_filter
    
    cursor = db.feedback.find(_q(user, query), {"_id": 0}).sort("timestamp", -1)
    items = await cursor.to_list(length=1000)
    
    # Enrich with user names
    user_ids = list(set(item["user_id"] for item in items))
    users_cursor = db.users.find(
        scoped(user, {"id": {"$in": user_ids}}) if user else scoped_job({"id": {"$in": user_ids}}),
        {"_id": 0, "id": 1, "name": 1},
    )
    users = await users_cursor.to_list(length=1000)
    user_map = {u["id"]: u.get("name", "Unknown") for u in users}
    
    for item in items:
        item["user_name"] = user_map.get(item["user_id"], "Unknown")
    
    return items


async def update_feedback_status(
    feedback_id: str,
    status: Optional[str] = None,
    user_visible_response: Optional[str] = None,
    user: Optional[dict] = None,
) -> Optional[dict]:
    """Admin: Update feedback status and/or add a response."""
    update_fields = {}
    if status:
        update_fields["status"] = status
    if user_visible_response is not None:
        update_fields["user_visible_response"] = user_visible_response
    
    if not update_fields:
        return None
    
    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.feedback.find_one_and_update(
        _q(user, {"id": feedback_id}),
        {"$set": update_fields},
        return_document=True
    )
    
    if result:
        result.pop("_id", None)
        logger.info(f"Feedback {feedback_id} updated: {update_fields}")
    return result


async def delete_feedback(feedback_id: str, user: Optional[dict] = None) -> bool:
    """Admin: Delete a feedback item."""
    result = await db.feedback.delete_one(_q(user, {"id": feedback_id}))
    if result.deleted_count > 0:
        logger.info(f"Feedback {feedback_id} deleted")
        return True
    return False


async def update_user_feedback(
    feedback_id: str,
    user_id: str,
    message: Optional[str] = None,
    feedback_type: Optional[str] = None,
    severity: Optional[str] = None,
    screenshot_url: Optional[str] = None,
    status: Optional[str] = None,
    user: Optional[dict] = None,
) -> Optional[dict]:
    """User: Update their own feedback."""
    tenant_user = user or {"id": user_id}
    existing = await db.feedback.find_one(_q(tenant_user, {"id": feedback_id, "user_id": user_id}))
    if not existing:
        return None
    
    update_fields = {}
    if message is not None:
        update_fields["message"] = message
    if feedback_type is not None:
        update_fields["type"] = feedback_type
    if severity is not None:
        update_fields["severity"] = severity
    if screenshot_url is not None:
        update_fields["screenshot_url"] = screenshot_url
    if status is not None:
        update_fields["status"] = status
    
    if not update_fields:
        return {k: v for k, v in existing.items() if k != "_id"}
    
    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.feedback.find_one_and_update(
        _q(tenant_user, {"id": feedback_id, "user_id": user_id}),
        {"$set": update_fields},
        return_document=True
    )
    
    if result:
        result.pop("_id", None)
        logger.info(f"Feedback {feedback_id} updated by user {user_id}: {list(update_fields.keys())}")
    return result


async def delete_user_feedback(
    feedback_id: str,
    user_id: str,
    user: Optional[dict] = None,
) -> bool:
    """User: Delete their own feedback."""
    tenant_user = user or {"id": user_id}
    result = await db.feedback.delete_one(_q(tenant_user, {"id": feedback_id, "user_id": user_id}))
    if result.deleted_count > 0:
        logger.info(f"Feedback {feedback_id} deleted by user {user_id}")
        return True
    return False


async def bulk_update_status(
    feedback_ids: List[str],
    status: str,
    user_id: str,
    user: Optional[dict] = None,
) -> dict:
    """User: Bulk update status for multiple feedback items (user can only update their own)."""
    if not feedback_ids:
        return {"updated_count": 0, "feedback_ids": []}
    
    update_fields = {
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    tenant_user = user or {"id": user_id}
    result = await db.feedback.update_many(
        _q(tenant_user, {"id": {"$in": feedback_ids}, "user_id": user_id}),
        {"$set": update_fields}
    )
    
    updated_count = result.modified_count
    logger.info(f"Bulk status update to '{status}' for {updated_count} feedback items by user {user_id}")
    
    return {
        "updated_count": updated_count,
        "status": status,
        "feedback_ids": feedback_ids[:updated_count] if updated_count > 0 else []
    }



async def get_unread_feedback_count(user: Optional[dict] = None) -> int:
    """Get count of feedback not yet read by owner/admin."""
    count = await db.feedback.count_documents(_q(user, {"read_by_owner": {"$ne": True}}))
    return count


async def mark_feedback_as_read(user: Optional[dict] = None) -> int:
    """Mark all feedback as read by owner/admin."""
    result = await db.feedback.update_many(
        _q(user, {"read_by_owner": {"$ne": True}}),
        {"$set": {"read_by_owner": True, "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    return result.modified_count



async def get_unread_responses_count(user_id: str, user: Optional[dict] = None) -> int:
    """Get count of feedback with responses not yet seen by the user."""
    tenant_user = user or {"id": user_id}
    count = await db.feedback.count_documents(_q(tenant_user, {
        "user_id": user_id,
        "user_visible_response": {"$exists": True, "$nin": [None, ""]},
        "response_seen_by_user": {"$ne": True}
    }))
    return count


async def mark_responses_as_seen(user_id: str, user: Optional[dict] = None) -> int:
    """Mark all feedback responses as seen by the user."""
    tenant_user = user or {"id": user_id}
    result = await db.feedback.update_many(
        _q(tenant_user, {
            "user_id": user_id,
            "user_visible_response": {"$exists": True, "$nin": [None, ""]},
            "response_seen_by_user": {"$ne": True}
        }),
        {"$set": {"response_seen_by_user": True, "response_seen_at": datetime.now(timezone.utc).isoformat()}}
    )
    return result.modified_count
