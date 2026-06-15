"""
Technician capacity registry.
"""
from fastapi import APIRouter, Depends

from auth import require_permission
from models.maintenance_scheduler import TechnicianCapacity
from services import maintenance_scheduler_service as svc

router = APIRouter()


@router.get("/technicians")
async def get_technicians(current_user: dict = Depends(require_permission("scheduler:read"))):
    """Get all technicians and their capacity."""
    return await svc.list_technicians(current_user)


@router.post("/technicians")
async def create_technician(
    technician: TechnicianCapacity,
    current_user: dict = Depends(require_permission("scheduler:write")),
):
    """Create a new technician capacity record."""
    return await svc.create_technician(current_user, technician)
