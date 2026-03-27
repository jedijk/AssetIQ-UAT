"""
Service layer for User Feedback operations.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from database import db

logger = logging.getLogger(__name__)


async def create_feedback(
    user_id: str,
    feedback_type: str,
    message: str,
    severity: Optional[str] = None,
    screenshot_url: Optional[str] = None,
    module: Optional[str] = None
) -> dict:
    """Create a new feedback entry."""
    feedback_id = str(uuid.uuid4())
    feedback_doc = {
        "id": feedback_id,
        "user_id": user_id,
        "type": feedback_type,
        "message": message,
        "status": "new",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "screenshot_url": screenshot_url,
        "severity": severity,
        "user_visible_response": None,
        "module": module,
    }
    await db.feedback.insert_one(feedback_doc)
    logger.info(f"Feedback created: {feedback_id} by user {user_id}")
    return {k: v for k, v in feedback_doc.items() if k != "_id"}


async def get_user_feedback(user_id: str) -> List[dict]:
    """Get all feedback submitted by a specific user, sorted by newest first."""
    cursor = db.feedback.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("timestamp", -1)
    items = await cursor.to_list(length=500)
    return items


async def get_feedback_by_id(feedback_id: str, user_id: Optional[str] = None) -> Optional[dict]:
    """Get a specific feedback item. If user_id provided, ensures ownership."""
    query = {"id": feedback_id}
    if user_id:
        query["user_id"] = user_id
    doc = await db.feedback.find_one(query, {"_id": 0})
    return doc


async def get_all_feedback(status_filter: Optional[str] = None) -> List[dict]:
    """Admin: Get all feedback, optionally filtered by status."""
    query = {}
    if status_filter:
        query["status"] = status_filter
    
    cursor = db.feedback.find(query, {"_id": 0}).sort("timestamp", -1)
    items = await cursor.to_list(length=1000)
    
    # Enrich with user names
    user_ids = list(set(item["user_id"] for item in items))
    users_cursor = db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1})
    users = await users_cursor.to_list(length=1000)
    user_map = {u["id"]: u.get("name", "Unknown") for u in users}
    
    for item in items:
        item["user_name"] = user_map.get(item["user_id"], "Unknown")
    
    return items


async def update_feedback_status(
    feedback_id: str,
    status: Optional[str] = None,
    user_visible_response: Optional[str] = None
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
        {"id": feedback_id},
        {"$set": update_fields},
        return_document=True
    )
    
    if result:
        result.pop("_id", None)
        logger.info(f"Feedback {feedback_id} updated: {update_fields}")
    return result


async def delete_feedback(feedback_id: str) -> bool:
    """Admin: Delete a feedback item."""
    result = await db.feedback.delete_one({"id": feedback_id})
    if result.deleted_count > 0:
        logger.info(f"Feedback {feedback_id} deleted")
        return True
    return False
