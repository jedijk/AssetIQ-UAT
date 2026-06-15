"""Equipment Types CRUD operations."""
from fastapi import APIRouter, BackgroundTasks, Depends

from auth import get_current_user, require_permission
from iso14224_models import EquipmentTypeCreate, EquipmentTypeUpdate
from services import equipment_types_service as svc

_equipment_write = require_permission("equipment:write")

router = APIRouter()


@router.get("/equipment-hierarchy/types")
async def get_iso_equipment_types(
    current_user: dict = Depends(get_current_user),
):
    """Get all equipment types - merged from defaults and user-custom types."""
    return await svc.list_equipment_types(current_user)


@router.post("/equipment-hierarchy/types")
async def create_equipment_type(
    type_data: EquipmentTypeCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(_equipment_write),
):
    """Create a custom equipment type."""
    return await svc.create_equipment_type(current_user, type_data, background_tasks)


@router.patch("/equipment-hierarchy/types/{type_id}")
async def update_equipment_type(
    type_id: str,
    update: EquipmentTypeUpdate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(_equipment_write),
):
    """Update a custom equipment type."""
    return await svc.update_equipment_type(current_user, type_id, update, background_tasks)


@router.delete("/equipment-hierarchy/types/{type_id}")
async def delete_equipment_type(
    type_id: str,
    current_user: dict = Depends(_equipment_write),
):
    """Delete a custom equipment type."""
    return await svc.delete_equipment_type(current_user, type_id)
