"""Equipment Criticality and Discipline Assignment."""
from fastapi import APIRouter, Depends

from auth import get_current_user
from iso14224_models import CriticalityAssignment
from services import equipment_criticality_service as svc

router = APIRouter()


@router.post("/equipment-hierarchy/nodes/{node_id}/criticality")
async def assign_criticality(
    node_id: str,
    assignment: CriticalityAssignment,
    current_user: dict = Depends(get_current_user),
):
    """Assign criticality to an equipment node using 4-dimension model."""
    return await svc.assign_criticality(current_user, node_id, assignment)


@router.post("/equipment-hierarchy/nodes/{node_id}/discipline")
async def assign_discipline(
    node_id: str,
    discipline: str,
    current_user: dict = Depends(get_current_user),
):
    """Assign discipline to an equipment node."""
    return await svc.assign_discipline(current_user, node_id, discipline)


@router.get("/equipment-hierarchy/stats")
async def get_hierarchy_stats(
    current_user: dict = Depends(get_current_user),
):
    """Get statistics about the equipment hierarchy."""
    return await svc.get_hierarchy_stats(current_user)
