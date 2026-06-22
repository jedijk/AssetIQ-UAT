"""Intelligence Map Routes."""
from typing import Optional

from fastapi import APIRouter, Depends

from auth import require_permission
from services import intelligence_map_routes_service as svc

# Re-exports for unit tests
from services.intelligence_map_routes_service import (  # noqa: F401
    PM_IMPORT_ACTIVE_TASK_MATCH,
    PM_IMPORT_EQUIPMENT_LINKED_TASK_MATCH,
    PM_IMPORT_IMPORTED_TASK_MATCH,
    _active_v2_program_match,
    _intelligence_map_schedule_query,
    _normalize_equipment_tags,
    _pm_import_equipment_linked_task_match,
    _pm_import_imported_task_match,
    _pm_import_task_match,
    _schedules_missing_frequency_filter,
    _serialize_scheduled_task_missing_frequency,
)

router = APIRouter(prefix="/intelligence-map", tags=["Intelligence Map"])

_library_read = require_permission("library:read")


@router.get("/stats")
async def get_intelligence_map_stats(
    plant_id: Optional[str] = None,
    system_id: Optional[str] = None,
    equipment_type_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    show_linked_only: bool = False,
    current_user: dict = Depends(_library_read),
):
    return await svc.get_intelligence_map_stats(
        plant_id=plant_id,
        system_id=system_id,
        equipment_type_id=equipment_type_id,
        equipment_id=equipment_id,
        show_linked_only=show_linked_only,
        current_user=current_user,
    )


@router.get("/schedules-missing-frequency")
async def get_schedules_missing_frequency(
    plant_id: Optional[str] = None,
    system_id: Optional[str] = None,
    equipment_type_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    limit: int = 100,
    skip: int = 0,
    current_user: dict = Depends(_library_read),
):
    return await svc.get_schedules_missing_frequency(
        plant_id=plant_id,
        system_id=system_id,
        equipment_type_id=equipment_type_id,
        equipment_id=equipment_id,
        limit=limit,
        skip=skip,
        current_user=current_user,
    )


@router.get("/filters")
async def get_intelligence_map_filters(
    current_user: dict = Depends(_library_read),
):
    return await svc.get_intelligence_map_filters(current_user=current_user)


@router.get("/context/strategy/{equipment_type_id}")
async def get_strategy_intelligence_context(
    equipment_type_id: str,
    current_user: dict = Depends(_library_read),
):
    return await svc.get_strategy_intelligence_context(
        equipment_type_id,
        current_user=current_user,
    )
