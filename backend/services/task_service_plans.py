"""Task plan CRUD — extracted from task_service.py."""
import uuid
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, Optional, Union

from bson import ObjectId

from services.task_service_helpers import calculate_next_due, serialize_plan
from services.tenant_schema import with_tenant_id

GetTemplateById = Callable[..., Awaitable[Optional[Dict[str, Any]]]]


async def create_plan(
    *,
    db,
    templates,
    plans,
    equipment,
    data: Dict[str, Any],
    created_by: str,
    scope: Callable,
    stamp_user: Callable,
    get_template_by_id: GetTemplateById,
    user: Optional[dict] = None,
) -> Dict[str, Any]:
    """Create a task plan for specific equipment."""
    now = datetime.now(timezone.utc)

    equipment_doc = await equipment.find_one(scope(user, {"id": data["equipment_id"]}))
    if not equipment_doc:
        raise ValueError("Equipment not found")

    template = await get_template_by_id(data["task_template_id"], user=user)
    if not template:
        raise ValueError("Task template not found")

    system_and_below_levels = [
        "section_system", "system",
        "equipment_unit", "equipment",
        "subunit",
        "maintainable_item",
    ]

    equipment_level = equipment_doc.get("level", "").lower()

    if equipment_level in system_and_below_levels:
        equipment_type_id = equipment_doc.get("equipment_type_id")
        template_equipment_types = template.get("equipment_type_ids", [])

        if template_equipment_types and len(template_equipment_types) > 0:
            if not equipment_type_id:
                raise ValueError(
                    f"Equipment '{equipment_doc.get('name')}' at level '{equipment_level}' "
                    f"has no equipment type defined. Cannot create plan with this template."
                )

            if equipment_type_id not in template_equipment_types:
                raise ValueError(
                    f"Equipment type '{equipment_type_id}' does not match template's "
                    f"applicable types: {', '.join(template_equipment_types)}. "
                    f"Plan creation is only allowed for matching equipment types at "
                    f"system level and below."
                )

    is_adhoc_template = template.get("is_adhoc", False)

    form_template_id = data.get("form_template_id") or template.get("form_template_id")

    form_template_name = None
    if form_template_id:
        form_template = await db.form_templates.find_one(scope(user, {"id": form_template_id}))
        if not form_template:
            try:
                form_template = await db.form_templates.find_one(
                    scope(user, {"_id": ObjectId(form_template_id)})
                )
            except Exception:
                pass
        if form_template:
            form_template_name = form_template.get("name")

    frequency_type = data.get("frequency_type") or template["frequency_type"]

    if is_adhoc_template:
        interval_value = data.get("interval_value")
        interval_unit = data.get("interval_unit") if data.get("interval_value") else None
    else:
        interval_value = data.get("interval_value") or template.get("default_interval")
        interval_unit = data.get("interval_unit") or template.get("default_unit")

    effective_from = data.get("effective_from") or now
    next_due = None
    if interval_value and interval_unit:
        next_due = calculate_next_due(effective_from, interval_value, interval_unit)
    elif is_adhoc_template:
        next_due = None
    else:
        next_due = calculate_next_due(effective_from, 30, "days")

    doc = {
        "id": str(uuid.uuid4()),
        "equipment_id": data["equipment_id"],
        "equipment_name": equipment_doc.get("name"),
        "task_template_id": data["task_template_id"],
        "task_template_name": template["name"],
        "form_template_id": form_template_id,
        "form_template_name": form_template_name,
        "efm_id": data.get("efm_id"),
        "frequency_type": frequency_type,
        "interval_value": interval_value,
        "interval_unit": interval_unit,
        "trigger_condition": data.get("trigger_condition"),
        "assigned_team": data.get("assigned_team"),
        "assigned_user_id": data.get("assigned_user_id"),
        "effective_from": effective_from,
        "effective_until": data.get("effective_until"),
        "last_executed_at": None,
        "next_due_date": next_due,
        "execution_count": 0,
        "notes": data.get("notes"),
        "is_active": True,
        "is_adhoc": is_adhoc_template,
        "created_by": created_by,
        "created_at": now,
        "updated_at": now,
    }

    result = await plans.insert_one(with_tenant_id(doc, stamp_user(user)))
    doc["_id"] = result.inserted_id

    update_result = await templates.update_one(
        scope(user, {"id": data["task_template_id"]}),
        {"$inc": {"usage_count": 1}},
    )
    if update_result.modified_count == 0 and ObjectId.is_valid(data["task_template_id"]):
        await templates.update_one(
            scope(user, {"_id": ObjectId(data["task_template_id"])}),
            {"$inc": {"usage_count": 1}},
        )

    return serialize_plan(doc)


async def get_plans(
    *,
    plans,
    scope: Callable,
    equipment_id: Optional[str] = None,
    template_id: Optional[str] = None,
    active_only: bool = True,
    due_before: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 100,
    user: Optional[dict] = None,
) -> Dict[str, Any]:
    """Get task plans with filters."""
    query: Dict[str, Any] = {}

    if active_only:
        query["is_active"] = True

    if equipment_id:
        query["equipment_id"] = equipment_id

    if template_id:
        query["task_template_id"] = template_id

    if due_before:
        query["next_due_date"] = {"$lte": due_before}

    scoped_query = scope(user, query)
    cursor = plans.find(scoped_query).sort("next_due_date", 1).skip(skip).limit(limit)

    plan_list = []
    async for doc in cursor:
        plan_list.append(serialize_plan(doc))

    total = await plans.count_documents(scoped_query)

    return {"total": total, "plans": plan_list}


async def get_plan_by_id(
    *,
    plans,
    scope: Callable,
    plan_id: str,
    user: Optional[dict] = None,
) -> Optional[Dict[str, Any]]:
    """Get a specific plan by id (string UUID) or _id (ObjectId)."""
    doc = await plans.find_one(scope(user, {"id": plan_id}))
    if doc:
        return serialize_plan(doc)
    if ObjectId.is_valid(plan_id):
        doc = await plans.find_one(scope(user, {"_id": ObjectId(plan_id)}))
        if doc:
            return serialize_plan(doc)

    return None


async def update_plan(
    *,
    plans,
    scope: Callable,
    plan_id: str,
    data: Dict[str, Any],
    user: Optional[dict] = None,
) -> Optional[Dict[str, Any]]:
    """Update a task plan."""
    existing = await plans.find_one(scope(user, {"id": plan_id}))
    query_field = "id" if existing else "_id"
    query_value: Union[str, ObjectId, None] = plan_id if existing else (
        ObjectId(plan_id) if ObjectId.is_valid(plan_id) else None
    )

    if not existing and query_value:
        existing = await plans.find_one(scope(user, {"_id": query_value}))

    if not existing:
        return None

    update = {"updated_at": datetime.now(timezone.utc)}

    allowed_fields = [
        "frequency_type", "interval_value", "interval_unit",
        "trigger_condition", "assigned_team", "assigned_user_id",
        "effective_from", "effective_until", "notes", "is_active",
    ]

    for field in allowed_fields:
        if field in data and data[field] is not None:
            update[field] = data[field]

    if any(f in data for f in ["interval_value", "interval_unit"]):
        interval_value = data.get("interval_value") or existing["interval_value"]
        interval_unit = data.get("interval_unit") or existing["interval_unit"]
        base_date = existing.get("last_executed_at") or existing.get("effective_from") or datetime.now(timezone.utc)
        update["next_due_date"] = calculate_next_due(base_date, interval_value, interval_unit)

    result = await plans.find_one_and_update(
        scope(user, {query_field: query_value}),
        {"$set": update},
        return_document=True,
    )

    if result:
        return serialize_plan(result)
    return None


async def delete_plan(
    *,
    templates,
    plans,
    scope: Callable,
    plan_id: str,
    user: Optional[dict] = None,
) -> bool:
    """Deactivate a task plan."""
    plan = await plans.find_one(scope(user, {"id": plan_id}))
    query_field = "id" if plan else "_id"
    query_value: Union[str, ObjectId, None] = plan_id if plan else (
        ObjectId(plan_id) if ObjectId.is_valid(plan_id) else None
    )

    if not plan and query_value:
        plan = await plans.find_one(scope(user, {"_id": query_value}))

    if not plan:
        return False

    result = await plans.update_one(
        scope(user, {query_field: query_value}),
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}},
    )

    if result.modified_count > 0 and plan.get("task_template_id"):
        template_id = plan["task_template_id"]
        update_result = await templates.update_one(
            scope(user, {"id": template_id}),
            {"$inc": {"usage_count": -1}},
        )
        if update_result.modified_count == 0 and ObjectId.is_valid(template_id):
            await templates.update_one(
                scope(user, {"_id": ObjectId(template_id)}),
                {"$inc": {"usage_count": -1}},
            )

    return result.modified_count > 0
