"""Custom equipment type CRUD."""
from datetime import datetime, timezone

from fastapi import BackgroundTasks, HTTPException

from database import db
from iso14224_models import EQUIPMENT_TYPES, EquipmentTypeCreate, EquipmentTypeUpdate
from services.background_jobs import schedule_tracked_job
from services.tenant_schema import merge_tenant_filter, with_tenant_id
from utils.auto_translate import translate_equipment_type


async def list_equipment_types(user: dict) -> dict:
    custom_types = await db.custom_equipment_types.find(
        merge_tenant_filter({}, user),
        {"_id": 0},
    ).to_list(100)

    custom_ids = {t["id"] for t in custom_types}
    merged_types = [t for t in EQUIPMENT_TYPES if t["id"] not in custom_ids] + custom_types

    return {"equipment_types": merged_types}


async def create_equipment_type(
    user: dict,
    type_data: EquipmentTypeCreate,
    background_tasks: BackgroundTasks,
) -> dict:
    existing = await db.custom_equipment_types.find_one(
        merge_tenant_filter({"id": type_data.id}, user),
    )
    if existing:
        raise HTTPException(status_code=400, detail="Equipment type ID already exists")

    type_doc = with_tenant_id({
        "id": type_data.id,
        "name": type_data.name,
        "iso_class": type_data.iso_class,
        "discipline": type_data.discipline,
        "icon": type_data.icon,
        "category": type_data.category,
        "default_failure_modes": type_data.default_failure_modes or [],
        "compatible_systems": type_data.compatible_systems or [],
        "is_system_level": type_data.is_system_level or False,
        "applicable_levels": type_data.applicable_levels or ["equipment_unit"],
        "is_custom": True,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }, user)

    await db.custom_equipment_types.insert_one(type_doc)

    schedule_tracked_job(
        background_tasks,
        "translate_equipment_type",
        translate_equipment_type,
        type_data.id,
        {"name": type_data.name, "description": ""},
        user["id"],
        user_id=user["id"],
    )

    type_doc.pop("_id", None)
    return type_doc


async def update_equipment_type(
    user: dict,
    type_id: str,
    update: EquipmentTypeUpdate,
    background_tasks: BackgroundTasks,
) -> dict:
    existing = await db.custom_equipment_types.find_one(
        merge_tenant_filter({"id": type_id}, user),
    )

    if not existing:
        default_type = next((t for t in EQUIPMENT_TYPES if t["id"] == type_id), None)
        if not default_type:
            raise HTTPException(status_code=404, detail="Equipment type not found")

        type_doc = with_tenant_id({
            **default_type,
            "is_custom": True,
            "created_by": user["id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }, user)
        update_data = {k: v for k, v in update.model_dump().items() if v is not None}
        type_doc.update(update_data)

        await db.custom_equipment_types.insert_one(type_doc)
        type_doc.pop("_id", None)
        return type_doc

    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        await db.custom_equipment_types.update_one(
            merge_tenant_filter({"id": type_id}, user),
            {"$set": update_data},
        )

    updated = await db.custom_equipment_types.find_one(
        merge_tenant_filter({"id": type_id}, user),
        {"_id": 0},
    )

    if update.name:
        schedule_tracked_job(
            background_tasks,
            "translate_equipment_type",
            translate_equipment_type,
            type_id,
            {"name": updated.get("name", ""), "description": ""},
            user["id"],
            user_id=user["id"],
        )

    return updated


async def delete_equipment_type(user: dict, type_id: str) -> dict:
    result = await db.custom_equipment_types.delete_one(
        merge_tenant_filter({"id": type_id}, user),
    )
    if result.deleted_count == 0:
        default_type = next((t for t in EQUIPMENT_TYPES if t["id"] == type_id), None)
        if default_type:
            raise HTTPException(status_code=400, detail="Cannot delete default equipment types")
        raise HTTPException(status_code=404, detail="Equipment type not found")
    return {"message": "Equipment type deleted"}
