"""
Dashboard KPIs for the scheduler view.
"""
from fastapi import APIRouter, Depends
from typing import Optional

from auth import require_permission
from services import maintenance_scheduler_service as svc

router = APIRouter()


@router.get("/dashboard")
async def get_scheduler_dashboard(
    equipment_type_id: Optional[str] = None,
    current_user: dict = Depends(require_permission("scheduler:read")),
):
    """Get scheduler dashboard KPIs."""
    return await svc.get_dashboard_kpis(current_user, equipment_type_id)
