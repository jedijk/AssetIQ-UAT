"""Production dashboard, events, and AI analysis routes — orchestration only (Wave 8)."""
from typing import Optional

from fastapi import APIRouter, Depends, Query

from auth import get_current_user, require_permission

router = APIRouter(tags=["Production Dashboard"])

_forms_write = require_permission("forms:write")


@router.get("/production/dashboard")
async def get_production_dashboard(
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format (single day, used if from_date not set)"),
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD"),
    shift: Optional[str] = Query(
        "morning",
        description="Comma-separated shifts for single-day mode: morning, afternoon, night (legacy: day). Example: morning,night",
    ),
    current_user: dict = Depends(get_current_user),
):
    """Get aggregated production dashboard data."""
    from services.production_dashboard_service import get_or_compute_production_dashboard

    return await get_or_compute_production_dashboard(
        current_user,
        date=date,
        from_date=from_date,
        to_date=to_date,
        shift=shift,
    )


@router.get("/production/events")
async def get_production_events(
    date: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None, description="action or insight"),
    current_user: dict = Depends(get_current_user),
):
    from services import production_dashboard_ops

    return await production_dashboard_ops.list_production_events(date=date, event_type=event_type)


@router.post("/production/events")
async def create_production_event(
    data: dict,
    current_user: dict = Depends(_forms_write),
):
    from services import production_dashboard_ops

    return await production_dashboard_ops.create_production_event(current_user, data)


@router.delete("/production/events/{event_id}")
async def delete_production_event(
    event_id: str,
    current_user: dict = Depends(_forms_write),
):
    from services import production_dashboard_ops

    return await production_dashboard_ops.delete_production_event(current_user, event_id)


@router.post("/production/ai-insights")
async def generate_ai_insights(
    data: dict,
    current_user: dict = Depends(get_current_user),
):
    from services import production_dashboard_ops

    return await production_dashboard_ops.generate_ai_insights(current_user, data)


@router.post("/production/machine-analysis")
async def generate_machine_analysis(
    data: dict = None,
    current_user: dict = Depends(get_current_user),
):
    from services import production_dashboard_ops

    return await production_dashboard_ops.generate_machine_analysis(current_user, data)


@router.get("/production/machine-analysis")
async def get_latest_analysis(
    start: Optional[str] = None,
    end: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    from services import production_dashboard_ops

    return await production_dashboard_ops.get_latest_analysis(start=start, end=end)
