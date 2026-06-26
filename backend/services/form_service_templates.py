"""Form template CRUD, field management, and template documents."""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import HTTPException

from services.form_service_serializers import serialize_template
from services.tenant_schema import merge_tenant_filter, with_tenant_id


async def create_template(
    *,
    templates,
    data: Dict[str, Any],
    created_by: str,
    user: Optional[dict] = None,
) -> Dict[str, Any]:
    """Create a new form template."""
    now = datetime.now(timezone.utc)

    fields = data.get("fields", [])
    for i, field in enumerate(fields):
        if isinstance(field, dict) and field.get("order") is None:
            field["order"] = i

    doc = {
        "id": str(uuid.uuid4()),
        "name": data["name"],
        "description": data.get("description"),
        "discipline": data.get("discipline"),
        "failure_mode_ids": data.get("failure_mode_ids", []),
        "equipment_type_ids": data.get("equipment_type_ids", []),
        "fields": fields,
        "allow_partial_submission": data.get("allow_partial_submission", False),
        "require_signature": data.get("require_signature", False),
        "tags": data.get("tags", []),
        "photo_extraction_config": data.get("photo_extraction_config"),
        "label_print_config": data.get("label_print_config"),
        "version": 1,
        "is_active": True,
        "is_latest": True,
        "parent_id": None,
        "usage_count": 0,
        "created_by": created_by,
        "created_at": now,
        "updated_at": now,
    }
    with_tenant_id(doc, user)

    result = await templates.insert_one(doc)
    doc["_id"] = result.inserted_id

    return serialize_template(doc)


async def get_templates(
    *,
    templates,
    discipline: Optional[str] = None,
    equipment_type_id: Optional[str] = None,
    failure_mode_id: Optional[str] = None,
    search: Optional[str] = None,
    active_only: bool = True,
    latest_only: bool = True,
    skip: int = 0,
    limit: int = 100,
    user: Optional[dict] = None,
) -> Dict[str, Any]:
    """Get form templates with filters."""
    query: Dict[str, Any] = {}

    if active_only:
        query["is_active"] = True

    if latest_only:
        query["is_latest"] = True

    if discipline:
        query["discipline"] = discipline

    if equipment_type_id:
        query["equipment_type_ids"] = equipment_type_id

    if failure_mode_id:
        query["failure_mode_ids"] = failure_mode_id

    if search:
        from utils.mongo_regex import or_search_fields

        search_clause = or_search_fields(search, "name", "description", "tags")
        if search_clause:
            query.update(search_clause)

    query = merge_tenant_filter(query, user)

    cursor = templates.find(query).sort("name", 1).skip(skip).limit(limit)

    template_list = []
    async for doc in cursor:
        template_list.append(serialize_template(doc))

    total = await templates.count_documents(query)

    return {"total": total, "templates": template_list}


async def get_template_by_id(*, templates, template_id: str) -> Optional[Dict[str, Any]]:
    """Get a specific template."""
    if not ObjectId.is_valid(template_id):
        return None

    doc = await templates.find_one({"_id": ObjectId(template_id)})
    if doc:
        return serialize_template(doc)
    return None


async def get_template_versions(*, templates, template_id: str) -> List[Dict[str, Any]]:
    """Get all versions of a template."""
    if not ObjectId.is_valid(template_id):
        return []

    template = await templates.find_one({"_id": ObjectId(template_id)})
    if not template:
        return []

    root_id = template.get("parent_id") or template_id

    cursor = templates.find({
        "$or": [
            {"_id": ObjectId(root_id)},
            {"parent_id": root_id},
        ]
    }).sort("version", -1)

    versions = []
    async for doc in cursor:
        versions.append(serialize_template(doc))

    return versions


async def _update_linked_tasks(
    db,
    old_template_id: str,
    new_template_id: str,
    new_name: str = None,
) -> None:
    """Update task plans/templates that reference this form template."""
    update_data = {"form_template_id": new_template_id}
    if new_name:
        update_data["form_template_name"] = new_name

    await db.task_plans.update_many(
        {"form_template_id": old_template_id},
        {"$set": update_data},
    )

    await db.task_templates.update_many(
        {"form_template_id": old_template_id},
        {"$set": update_data},
    )


async def _update_linked_task_names(db, template_id: str, new_name: str) -> None:
    """Update form_template_name in linked tasks when form name changes."""
    await db.task_plans.update_many(
        {"form_template_id": template_id},
        {"$set": {"form_template_name": new_name}},
    )

    await db.task_templates.update_many(
        {"form_template_id": template_id},
        {"$set": {"form_template_name": new_name}},
    )


async def update_template(
    *,
    templates,
    db,
    template_id: str,
    data: Dict[str, Any],
    create_new_version: bool = True,
) -> Optional[Dict[str, Any]]:
    """
    Update a form template.
    If create_new_version=True, creates a new version (recommended for published forms).
    If False, updates in place (only for drafts).
    """
    if not ObjectId.is_valid(template_id):
        return None

    existing = await templates.find_one({"_id": ObjectId(template_id)})
    if not existing:
        return None

    now = datetime.now(timezone.utc)

    if create_new_version and existing.get("usage_count", 0) > 0:
        await templates.update_one(
            {"_id": ObjectId(template_id)},
            {"$set": {"is_latest": False, "updated_at": now}},
        )

        new_doc = {
            "id": str(uuid.uuid4()),
            "name": data.get("name", existing["name"]),
            "description": data.get("description", existing.get("description")),
            "discipline": data.get("discipline", existing.get("discipline")),
            "failure_mode_ids": data.get("failure_mode_ids", existing.get("failure_mode_ids", [])),
            "equipment_type_ids": data.get("equipment_type_ids", existing.get("equipment_type_ids", [])),
            "fields": data.get("fields", existing.get("fields", [])),
            "documents": data.get("documents", existing.get("documents", [])),
            "allow_partial_submission": data.get(
                "allow_partial_submission", existing.get("allow_partial_submission", False)
            ),
            "require_signature": data.get("require_signature", existing.get("require_signature", False)),
            "tags": data.get("tags", existing.get("tags", [])),
            "photo_extraction_config": data.get(
                "photo_extraction_config", existing.get("photo_extraction_config")
            ),
            "label_print_config": data.get("label_print_config", existing.get("label_print_config")),
            "version": existing.get("version", 1) + 1,
            "is_active": True,
            "is_latest": True,
            "parent_id": existing.get("parent_id") or template_id,
            "usage_count": 0,
            "created_by": existing["created_by"],
            "created_at": now,
            "updated_at": now,
        }

        result = await templates.insert_one(new_doc)
        new_doc["_id"] = result.inserted_id
        new_template_id = str(result.inserted_id)

        await _update_linked_tasks(db, template_id, new_template_id, new_doc.get("name"))

        return serialize_template(new_doc)

    update = {
        "updated_at": now,
        "version": existing.get("version", 1) + 1,
    }

    allowed_fields = [
        "name", "description", "discipline", "failure_mode_ids",
        "equipment_type_ids", "fields", "documents", "allow_partial_submission",
        "require_signature", "tags", "is_active", "photo_extraction_config",
        "label_print_config",
    ]

    for field in allowed_fields:
        if field in data and data[field] is not None:
            update[field] = data[field]

    result = await templates.find_one_and_update(
        {"_id": ObjectId(template_id)},
        {"$set": update},
        return_document=True,
    )

    if result and "name" in data:
        await _update_linked_task_names(db, template_id, data["name"])

    if result:
        return serialize_template(result)
    return None


async def delete_template(*, templates, template_id: str) -> bool:
    """Deactivate a form template."""
    if not ObjectId.is_valid(template_id):
        return False

    result = await templates.update_one(
        {"_id": ObjectId(template_id)},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}},
    )

    return result.modified_count > 0


async def add_field_to_template(
    *,
    templates,
    template_id: str,
    field: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Add a field to a form template."""
    if not ObjectId.is_valid(template_id):
        return None

    template = await templates.find_one({"_id": ObjectId(template_id)})
    if not template:
        return None

    fields = template.get("fields", [])

    if field.get("order") is None:
        field["order"] = len(fields)

    fields.append(field)

    await templates.update_one(
        {"_id": ObjectId(template_id)},
        {"$set": {"fields": fields, "updated_at": datetime.now(timezone.utc)}},
    )

    return await get_template_by_id(templates=templates, template_id=template_id)


async def update_field_in_template(
    *,
    templates,
    template_id: str,
    field_id: str,
    updates: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Update a specific field in a template."""
    if not ObjectId.is_valid(template_id):
        return None

    template = await templates.find_one({"_id": ObjectId(template_id)})
    if not template:
        return None

    fields = template.get("fields", [])
    updated = False

    for field in fields:
        if field.get("id") == field_id:
            for key, value in updates.items():
                if value is not None:
                    field[key] = value
            updated = True
            break

    if not updated:
        return None

    await templates.update_one(
        {"_id": ObjectId(template_id)},
        {"$set": {"fields": fields, "updated_at": datetime.now(timezone.utc)}},
    )

    return await get_template_by_id(templates=templates, template_id=template_id)


async def remove_field_from_template(
    *,
    templates,
    template_id: str,
    field_id: str,
) -> Optional[Dict[str, Any]]:
    """Remove a field from a template."""
    if not ObjectId.is_valid(template_id):
        return None

    template = await templates.find_one({"_id": ObjectId(template_id)})
    if not template:
        return None

    fields = [f for f in template.get("fields", []) if f.get("id") != field_id]

    await templates.update_one(
        {"_id": ObjectId(template_id)},
        {"$set": {"fields": fields, "updated_at": datetime.now(timezone.utc)}},
    )

    return await get_template_by_id(templates=templates, template_id=template_id)


async def reorder_fields(
    *,
    templates,
    template_id: str,
    field_order: List[str],
) -> Optional[Dict[str, Any]]:
    """Reorder fields in a template."""
    if not ObjectId.is_valid(template_id):
        return None

    template = await templates.find_one({"_id": ObjectId(template_id)})
    if not template:
        return None

    fields = template.get("fields", [])
    field_map = {f.get("id"): f for f in fields}

    reordered = []
    for i, field_id in enumerate(field_order):
        if field_id in field_map:
            field_map[field_id]["order"] = i
            reordered.append(field_map[field_id])

    await templates.update_one(
        {"_id": ObjectId(template_id)},
        {"$set": {"fields": reordered, "updated_at": datetime.now(timezone.utc)}},
    )

    return await get_template_by_id(templates=templates, template_id=template_id)


async def add_template_document(
    *,
    templates,
    template_id: str,
    filename: str,
    file_data: bytes,
    content_type: str,
    ext: str,
    description: Optional[str],
    uploaded_by: str,
) -> dict:
    from services.storage_service import put_object_async

    doc_id = str(uuid.uuid4())
    storage_path = f"forms/{template_id}/documents/{doc_id}.{ext}"
    result = await put_object_async(storage_path, file_data, content_type)
    doc_url = result.get("path", storage_path)
    doc_metadata = {
        "id": doc_id,
        "name": filename,
        "url": doc_url,
        "storage_path": storage_path,
        "type": ext,
        "content_type": content_type,
        "size_bytes": len(file_data),
        "description": description or "",
        "uploaded_by": uploaded_by,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    await templates.update_one(
        {"_id": ObjectId(template_id)},
        {"$push": {"documents": doc_metadata}},
    )
    return {"message": "Document uploaded successfully", "document": doc_metadata}


async def remove_template_document(*, templates, template_id: str, document_id: str) -> dict:
    result = await templates.update_one(
        {"_id": ObjectId(template_id)},
        {"$pull": {"documents": {"id": document_id}}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Document deleted successfully"}
