"""Task template CRUD — extracted from task_service.py."""
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

from bson import ObjectId

from services.task_service_helpers import serialize_template
from services.tenant_schema import with_tenant_id


async def create_template(
    *,
    templates,
    data: Dict[str, Any],
    created_by: str,
    scope: Callable,
    stamp_user: Callable,
    user: Optional[dict] = None,
) -> Dict[str, Any]:
    """Create a new task template."""
    now = datetime.now(timezone.utc)

    is_adhoc = data.get("is_adhoc", False)

    doc = {
        "id": str(uuid.uuid4()),
        "name": data["name"],
        "description": data.get("description"),
        "discipline": data["discipline"],
        "mitigation_strategy": data["mitigation_strategy"],
        "equipment_type_ids": data.get("equipment_type_ids", []),
        "failure_mode_ids": data.get("failure_mode_ids", []),
        "frequency_type": "adhoc" if is_adhoc else data.get("frequency_type", "time_based"),
        "default_interval": 0 if is_adhoc else data.get("default_interval", 30),
        "default_unit": None if is_adhoc else data.get("default_unit", "days"),
        "estimated_duration_minutes": data.get("estimated_duration_minutes"),
        "procedure_steps": data.get("procedure_steps", []),
        "safety_requirements": data.get("safety_requirements", []),
        "tools_required": data.get("tools_required", []),
        "spare_parts": data.get("spare_parts", []),
        "form_template_id": data.get("form_template_id"),
        "tags": data.get("tags", []),
        "is_adhoc": is_adhoc,
        "is_active": True,
        "usage_count": 0,
        "created_by": created_by,
        "created_at": now,
        "updated_at": now,
    }

    result = await templates.insert_one(with_tenant_id(doc, stamp_user(user)))
    doc["_id"] = result.inserted_id

    return serialize_template(doc)


async def get_templates(
    *,
    templates,
    scope: Callable,
    discipline: Optional[str] = None,
    mitigation_strategy: Optional[str] = None,
    equipment_type_id: Optional[str] = None,
    search: Optional[str] = None,
    active_only: bool = True,
    skip: int = 0,
    limit: int = 100,
    user: Optional[dict] = None,
) -> Dict[str, Any]:
    """Get task templates with filters."""
    query: Dict[str, Any] = {}

    if active_only:
        query["is_active"] = True

    if discipline:
        query["discipline"] = discipline

    if mitigation_strategy:
        query["mitigation_strategy"] = mitigation_strategy

    if equipment_type_id:
        query["equipment_type_ids"] = equipment_type_id

    if search:
        from utils.mongo_regex import or_search_fields

        search_clause = or_search_fields(search, "name", "description", "tags")
        if search_clause:
            query.update(search_clause)

    scoped_query = scope(user, query)
    cursor = templates.find(scoped_query).sort("name", 1).skip(skip).limit(limit)

    template_list = []
    async for doc in cursor:
        template_list.append(serialize_template(doc))

    total = await templates.count_documents(scoped_query)

    return {"total": total, "templates": template_list}


async def get_template_by_id(
    *,
    templates,
    scope: Callable,
    template_id: str,
    user: Optional[dict] = None,
) -> Optional[Dict[str, Any]]:
    """Get a specific template by id (string UUID) or _id (ObjectId)."""
    doc = await templates.find_one(scope(user, {"id": template_id}))
    if doc:
        return serialize_template(doc)
    if ObjectId.is_valid(template_id):
        doc = await templates.find_one(scope(user, {"_id": ObjectId(template_id)}))
        if doc:
            return serialize_template(doc)

    return None


async def update_template(
    *,
    templates,
    scope: Callable,
    template_id: str,
    data: Dict[str, Any],
    user: Optional[dict] = None,
) -> Optional[Dict[str, Any]]:
    """Update a task template."""
    update = {"updated_at": datetime.now(timezone.utc)}

    allowed_fields = [
        "name", "description", "discipline", "mitigation_strategy",
        "equipment_type_ids", "failure_mode_ids", "frequency_type",
        "default_interval", "default_unit", "estimated_duration_minutes",
        "procedure_steps", "safety_requirements", "tools_required",
        "spare_parts", "form_template_id", "tags", "is_active", "is_adhoc",
    ]

    for field in allowed_fields:
        if field in data and data[field] is not None:
            update[field] = data[field]

    result = await templates.find_one_and_update(
        scope(user, {"id": template_id}),
        {"$set": update},
        return_document=True,
    )
    if not result and ObjectId.is_valid(template_id):
        result = await templates.find_one_and_update(
            scope(user, {"_id": ObjectId(template_id)}),
            {"$set": update},
            return_document=True,
        )

    if result:
        return serialize_template(result)
    return None


async def delete_template(
    *,
    templates,
    plans,
    scope: Callable,
    template_id: str,
    user: Optional[dict] = None,
) -> bool:
    """Delete a task template (soft delete by deactivating)."""
    plans_count = await plans.count_documents(scope(user, {
        "task_template_id": template_id,
        "is_active": True,
    }))

    if plans_count > 0:
        raise ValueError(f"Cannot delete template: {plans_count} active plans use it")

    result = await templates.update_one(
        scope(user, {"id": template_id}),
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}},
    )
    if result.modified_count > 0:
        return True
    if ObjectId.is_valid(template_id):
        result = await templates.update_one(
            scope(user, {"_id": ObjectId(template_id)}),
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}},
        )
        return result.modified_count > 0

    return False
