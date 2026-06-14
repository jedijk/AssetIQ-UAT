"""Equipment Node Operations - Change Level, Reorder, Move."""
from fastapi import APIRouter, Depends

from auth import get_current_user
from iso14224_models import MoveNodeRequest
from services import equipment_operations_service as svc
from services.equipment_operations_service import (
    ChangeLevelRequest,
    ReorderRequest,
    ReorderToPositionRequest,
)

router = APIRouter()


@router.post("/equipment-hierarchy/nodes/{node_id}/change-level")
async def change_node_level(
    node_id: str,
    request: ChangeLevelRequest,
    current_user: dict = Depends(get_current_user),
):
    """Change the hierarchy level of a node (promote or demote)."""
    return await svc.change_node_level(current_user, node_id, request)


@router.post("/equipment-hierarchy/nodes/{node_id}/reorder")
async def reorder_equipment_node(
    node_id: str,
    request: ReorderRequest,
    current_user: dict = Depends(get_current_user),
):
    """Reorder a node among its siblings (move up or down)."""
    return await svc.reorder_equipment_node(current_user, node_id, request)


@router.post("/equipment-hierarchy/nodes/{node_id}/reorder-to")
async def reorder_node_to_position(
    node_id: str,
    request: ReorderToPositionRequest,
    current_user: dict = Depends(get_current_user),
):
    """Reorder a node to a specific position relative to another node via drag-and-drop."""
    return await svc.reorder_node_to_position(current_user, node_id, request)


@router.post("/equipment-hierarchy/nodes/{node_id}/move")
async def move_equipment_node(
    node_id: str,
    move_request: MoveNodeRequest,
    current_user: dict = Depends(get_current_user),
):
    """Move a node to a new parent with ISO 14224 validation."""
    return await svc.move_equipment_node(current_user, node_id, move_request)
