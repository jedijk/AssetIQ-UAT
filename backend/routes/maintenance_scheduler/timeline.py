"""
Timeline view: scheduled tasks grouped per equipment within a date window.
"""
from fastapi import APIRouter, Depends
from typing import Optional

from auth import require_permission
from services import maintenance_scheduler_service as svc

router = APIRouter()


@router.get("/timeline")
async def get_timeline(
    equipment_type_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(require_permission("scheduler:read")),
):
    """Get timeline view of scheduled tasks grouped by equipment."""
    return await svc.get_timeline(
        current_user,
        equipment_type_id=equipment_type_id,
        start_date=start_date,
        end_date=end_date,
    )
