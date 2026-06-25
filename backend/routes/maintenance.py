"""
Maintenance Strategies routes (LEGACY v1).

Deprecated: use ``/api/maintenance-strategies-v2`` and ``equipment_type_strategies``.
These endpoints remain for backward compatibility until Sunset 2026-09-01.
"""
from typing import Optional

from fastapi import APIRouter, Depends

from auth import require_permission
from maintenance_strategy_models import (
    GenerateAllStrategiesRequest,
    GenerateStrategyRequest,
    MaintenanceStrategyCreate,
    MaintenanceStrategyUpdate,
)
from services import maintenance_routes_service as svc

# Re-export for unit tests
from services.maintenance_routes_service import _block_legacy_v1_mutation  # noqa: F401

router = APIRouter(tags=["Maintenance Strategies"])

_scheduler_read = require_permission("scheduler:read")
_scheduler_write = require_permission("scheduler:write")


@router.get("/maintenance-strategies")
async def list_maintenance_strategies(
    equipment_type_id: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(_scheduler_read),
):
    return await svc.list_maintenance_strategies(
        equipment_type_id=equipment_type_id,
        search=search,
        current_user=current_user,
    )


@router.get("/maintenance-strategies/{strategy_id}")
async def get_maintenance_strategy(
    strategy_id: str,
    current_user: dict = Depends(_scheduler_read),
):
    return await svc.get_maintenance_strategy(strategy_id, current_user)


@router.get("/maintenance-strategies/by-equipment-type/{equipment_type_id}")
async def get_strategies_by_equipment_type(
    equipment_type_id: str,
    current_user: dict = Depends(_scheduler_read),
):
    return await svc.get_strategies_by_equipment_type(equipment_type_id, current_user)


@router.post("/maintenance-strategies/generate")
async def generate_maintenance_strategy(
    request: GenerateStrategyRequest,
    current_user: dict = Depends(_scheduler_write),
):
    return await svc.generate_maintenance_strategy(request, current_user=current_user)


@router.post("/maintenance-strategies/generate-all")
async def generate_all_maintenance_strategies(
    request: GenerateAllStrategiesRequest,
    current_user: dict = Depends(_scheduler_write),
):
    return await svc.generate_all_maintenance_strategies(request, current_user=current_user)


@router.post("/maintenance-strategies")
async def create_maintenance_strategy(
    data: MaintenanceStrategyCreate,
    current_user: dict = Depends(_scheduler_write),
):
    return await svc.create_maintenance_strategy(data, current_user=current_user)


@router.patch("/maintenance-strategies/{strategy_id}")
async def update_maintenance_strategy(
    strategy_id: str,
    data: MaintenanceStrategyUpdate,
    current_user: dict = Depends(_scheduler_write),
):
    return await svc.update_maintenance_strategy(strategy_id, data, current_user=current_user)


@router.delete("/maintenance-strategies/{strategy_id}")
async def delete_maintenance_strategy(
    strategy_id: str,
    current_user: dict = Depends(_scheduler_write),
):
    return await svc.delete_maintenance_strategy(strategy_id, current_user=current_user)


@router.post("/maintenance-strategies/{strategy_id}/increment-version")
async def increment_strategy_version(
    strategy_id: str,
    major: bool = False,
    current_user: dict = Depends(_scheduler_write),
):
    return await svc.increment_strategy_version(
        strategy_id, major=major, current_user=current_user
    )


@router.get("/download/documentation")
async def download_documentation(
    current_user: dict = Depends(_scheduler_read),
):
    return await svc.download_documentation()


@router.get("/download/functional-spec")
async def download_functional_spec(
    current_user: dict = Depends(_scheduler_read),
):
    return await svc.download_functional_spec()
