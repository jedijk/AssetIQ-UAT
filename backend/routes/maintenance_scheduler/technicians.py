"""
Technician capacity registry.
"""
from fastapi import APIRouter, Depends

from database import db
from auth import get_current_user
from models.maintenance_scheduler import TechnicianCapacity

router = APIRouter()


@router.get("/technicians")
async def get_technicians(current_user: dict = Depends(get_current_user)):
    """Get all technicians and their capacity."""
    technicians = await db.technician_capacity.find({"is_active": True}, {"_id": 0}).to_list(100)
    return {"technicians": technicians}


@router.post("/technicians")
async def create_technician(
    technician: TechnicianCapacity,
    current_user: dict = Depends(get_current_user),
):
    """Create a new technician capacity record."""
    await db.technician_capacity.insert_one(technician.model_dump())
    return {"message": "Technician created", "id": technician.id}
