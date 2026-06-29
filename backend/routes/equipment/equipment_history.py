"""Equipment History Timeline."""
from fastapi import APIRouter, Depends

from auth import get_current_user
from services import equipment_history_service as svc

router = APIRouter()


@router.get("/equipment-hierarchy/nodes/{node_id}/history")
async def get_equipment_history(
    node_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get the complete history timeline for an equipment node."""
    return await svc.get_equipment_history(current_user, node_id)


@router.get("/equipment-hierarchy/nodes/{node_id}/pm-compliance")
async def get_equipment_pm_compliance(
    node_id: str,
    current_user: dict = Depends(get_current_user),
):
    """PM compliance % and execution close-out intelligence for one asset."""
    from services.equipment_pm_compliance_service import get_equipment_pm_compliance

    return await get_equipment_pm_compliance(current_user, node_id)
