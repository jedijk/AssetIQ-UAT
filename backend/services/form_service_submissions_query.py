"""Filtered form submission list query with batch enrichment."""
import asyncio
import logging
import time
from datetime import datetime
from typing import Any, Dict, Optional

from bson import ObjectId

from services.form_service_serializers import serialize_submission
from services.tenant_schema import merge_tenant_filter

logger = logging.getLogger(__name__)


async def get_submissions(
    *,
    db,
    submissions,
    templates,
    form_template_id: Optional[str] = None,
    task_instance_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    has_warnings: Optional[bool] = None,
    has_critical: Optional[bool] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 10,
    include_details: bool = False,
    user: Optional[dict] = None,
) -> Dict[str, Any]:
    """Get form submissions with filters - optimized for fast response."""
    start_time = time.time()
    
    # STRICT PAGINATION - cap at 50 max
    limit = min(limit, 50)
    
    query = {}
    
    if form_template_id:
        query["form_template_id"] = form_template_id
    
    if task_instance_id:
        query["task_instance_id"] = task_instance_id
    
    if equipment_id:
        query["equipment_id"] = equipment_id
    
    if has_warnings is not None:
        query["has_warnings"] = has_warnings
    
    if has_critical is not None:
        query["has_critical"] = has_critical
    
    if from_date or to_date:
        query["submitted_at"] = {}
        if from_date:
            query["submitted_at"]["$gte"] = from_date
        if to_date:
            query["submitted_at"]["$lte"] = to_date

    query = merge_tenant_filter(query, user)
    
    # LIGHTWEIGHT PROJECTION - exclude large fields for list view
    projection = {
        "_id": 0,
        "id": 1,
        "form_template_id": 1,
        "form_template_name": 1,
        "task_instance_id": 1,
        "equipment_id": 1,
        "equipment_name": 1,
        "submitted_by": 1,
        "submitted_by_name": 1,
        "submitted_at": 1,
        "has_warnings": 1,
        "has_critical": 1,
        "notes": 1,
        # Summary fields only - NOT full responses/attachments
        "response_count": 1,
        "attachment_count": 1
    }
    
    # Only include heavy fields if explicitly requested
    if include_details:
        projection["responses"] = 1
        projection["attachments"] = 1
    
    logger.info(f"[FormService] Starting query: filters={bool(query)}, limit={limit}, include_details={include_details}")
    
    # Use estimated count for unfiltered queries (much faster)
    if query:
        count_task = submissions.count_documents(query)
    else:
        count_task = submissions.estimated_document_count()
    
    # Sort by submitted_at DESC using index
    fetch_task = submissions.find(query, projection).sort("submitted_at", -1).skip(skip).limit(limit).to_list(length=limit)
    
    total, raw_submissions = await asyncio.gather(count_task, fetch_task)
    
    query_time = time.time() - start_time
    logger.info(f"[FormService] Query completed in {query_time:.3f}s - returned {len(raw_submissions)} of {total} total")
    
    # Early return if no submissions - skip unnecessary lookups
    if not raw_submissions:
        return {"total": total, "submissions": []}
    
    # ============================================
    # BATCH LOOKUP: Extract all unique IDs upfront
    # ============================================
    user_ids = set()
    equipment_ids = set()
    task_ids_str = set()
    task_ids_oid = set()
    form_template_ids = set()
    
    for doc in raw_submissions:
        if doc.get("submitted_by"):
            user_ids.add(doc["submitted_by"])
        if doc.get("equipment_id"):
            equipment_ids.add(doc["equipment_id"])
        if doc.get("task_instance_id"):
            task_ids_str.add(doc["task_instance_id"])
            if ObjectId.is_valid(doc["task_instance_id"]):
                task_ids_oid.add(ObjectId(doc["task_instance_id"]))
        if doc.get("form_template_id"):
            form_template_ids.add(doc["form_template_id"])
    
    # Run all batch lookups in parallel with timeout
    async def fetch_users():
        if not user_ids:
            return {}
        try:
            users = await asyncio.wait_for(
                db.users.find(
                    {"id": {"$in": list(user_ids)}}, 
                    {"_id": 0, "id": 1, "name": 1, "email": 1, "avatar_path": 1, "avatar_data": 1}
                ).to_list(length=100),
                timeout=2.0
            )
            return {u["id"]: {
                "name": u.get("name", u.get("email", "Unknown")),
                "has_avatar": bool(u.get("avatar_path") or u.get("avatar_data"))
            } for u in users}
        except asyncio.TimeoutError:
            logger.warning("[FormService] fetch_users timeout")
            return {}
    
    async def fetch_equipment():
        if not equipment_ids:
            return {}
        try:
            equipment = await asyncio.wait_for(
                db.equipment_nodes.find(
                    {"id": {"$in": list(equipment_ids)}}, 
                    {"_id": 0, "id": 1, "name": 1, "path": 1}
                ).to_list(length=100),
                timeout=2.0
            )
            return {eq["id"]: {"name": eq.get("name", "Unknown Equipment"), "path": eq.get("path", "")} for eq in equipment}
        except asyncio.TimeoutError:
            logger.warning("[FormService] fetch_equipment timeout")
            return {}
    
    async def fetch_tasks():
        result = {}
        try:
            if task_ids_str:
                tasks = await asyncio.wait_for(
                    db.task_instances.find({"id": {"$in": list(task_ids_str)}}).to_list(length=100),
                    timeout=2.0
                )
                for task in tasks:
                    result[task.get("id")] = task
            if task_ids_oid:
                tasks = await asyncio.wait_for(
                    db.task_instances.find({"_id": {"$in": list(task_ids_oid)}}).to_list(length=100),
                    timeout=2.0
                )
                for task in tasks:
                    result[str(task["_id"])] = task
        except asyncio.TimeoutError:
            logger.warning("[FormService] fetch_tasks timeout")
        return result
    
    async def fetch_templates():
        result = {}
        if not form_template_ids:
            return result
        try:
            # Try by string id
            templates = await asyncio.wait_for(
                templates.find({"id": {"$in": list(form_template_ids)}}).to_list(length=100),
                timeout=2.0
            )
            for tmpl in templates:
                result[tmpl.get("id")] = tmpl
            # Also try by ObjectId for any missing
            missing_ids = form_template_ids - set(result.keys())
            if missing_ids:
                oid_list = [ObjectId(fid) for fid in missing_ids if ObjectId.is_valid(fid)]
                if oid_list:
                    templates = await asyncio.wait_for(
                        templates.find({"_id": {"$in": oid_list}}).to_list(length=100),
                        timeout=2.0
                    )
                    for tmpl in templates:
                        result[str(tmpl["_id"])] = tmpl
        except asyncio.TimeoutError:
            logger.warning("[FormService] fetch_templates timeout")
        return result
    
    # Execute all lookups in parallel
    user_map, equipment_map, task_map, template_map = await asyncio.gather(
        fetch_users(),
        fetch_equipment(),
        fetch_tasks(),
        fetch_templates()
    )
    
    # ============================================
    # PROCESS SUBMISSIONS using pre-fetched lookups
    # ============================================
    submissions = []
    for doc in raw_submissions:
        serialized = serialize_submission(doc)
        
        # Get submitted_by info from map (name and avatar)
        if serialized.get("submitted_by"):
            user_data = user_map.get(serialized["submitted_by"])
            if user_data:
                if not serialized.get("submitted_by_name"):
                    serialized["submitted_by_name"] = user_data.get("name", "Unknown")
                if user_data.get("has_avatar"):
                    serialized["submitted_by_photo"] = f"/api/users/{serialized['submitted_by']}/avatar"
        
        # Get equipment info from map
        if serialized.get("equipment_id"):
            eq_data = equipment_map.get(serialized["equipment_id"])
            if eq_data:
                serialized["equipment_name"] = eq_data["name"]
                serialized["equipment_path"] = eq_data["path"]
        
        # Get task info from map
        if serialized.get("task_instance_id"):
            task = task_map.get(serialized["task_instance_id"])
            if task:
                serialized["task_template_name"] = task.get("task_template_name", "Unknown Task")
                serialized["discipline"] = task.get("discipline")
        
        # Get form template discipline from map if not in task
        if not serialized.get("discipline") and serialized.get("form_template_id"):
            template = template_map.get(serialized["form_template_id"])
            if template:
                serialized["discipline"] = template.get("discipline")
        
        submissions.append(serialized)
    
    return {"total": total, "submissions": submissions}
    