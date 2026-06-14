"""Equipment nodes routes — orchestration only (Wave 10)."""

from fastapi import APIRouter, BackgroundTasks, Depends

from auth import get_current_user
from iso14224_models import EquipmentNodeCreate, EquipmentNodeUpdate
from services import equipment_nodes_service as svc

router = APIRouter()


@router.post("/equipment-hierarchy/refresh")
async def refresh_equipment_cache(
    current_user: dict = Depends(get_current_user)
):
    return await svc.refresh_equipment_cache(current_user)

@router.get("/equipment-hierarchy/nodes")
async def get_equipment_nodes(
    current_user: dict = Depends(get_current_user)
):
    return await svc.get_equipment_nodes(current_user)

@router.get("/equipment-hierarchy/installations")
async def get_all_installations(
    current_user: dict = Depends(get_current_user)
):
    return await svc.get_all_installations(current_user)

@router.get("/equipment-hierarchy/export")
async def export_equipment_hierarchy_excel(
    current_user: dict = Depends(get_current_user)
):
    return await svc.export_equipment_hierarchy_excel(current_user)

@router.get("/equipment-hierarchy/nodes/{node_id}")
async def get_equipment_node(
    node_id: str,
    current_user: dict = Depends(get_current_user)
):
    return await svc.get_equipment_node(current_user, node_id)

@router.post("/equipment-hierarchy/nodes")
async def create_equipment_node(
    node_data: EquipmentNodeCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    return await svc.create_equipment_node(current_user, node_data, background_tasks)

@router.patch("/equipment-hierarchy/nodes/{node_id}")
async def update_equipment_node(
    node_id: str,
    update: EquipmentNodeUpdate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    return await svc.update_equipment_node(current_user, node_id, update, background_tasks)

@router.get("/equipment-hierarchy/nodes/{node_id}/deletion-impact")
async def get_deletion_impact(
    node_id: str,
    current_user: dict = Depends(get_current_user)
):
    return await svc.get_deletion_impact(current_user, node_id)

@router.delete("/equipment-hierarchy/nodes/{node_id}")
async def delete_equipment_node(
    node_id: str,
    cascade: bool = False,
    current_user: dict = Depends(get_current_user)
):
    return await svc.delete_equipment_node(current_user, node_id, cascade)
