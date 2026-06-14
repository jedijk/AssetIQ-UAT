"""Equipment Failure Modes routes."""
from typing import Optional

from fastapi import APIRouter, Depends

from auth import require_permission
from services import efms_routes_service as svc
from services.efms_routes_service import EFMUpdate

router = APIRouter(tags=["Equipment Failure Modes"])

_library_read = require_permission("library:read")
_library_write = require_permission("library:write")


@router.get("/equipment/{equipment_id}/efms")
async def get_equipment_efms(
    equipment_id: str,
    active_only: bool = True,
    category: Optional[str] = None,
    current_user: dict = Depends(_library_read),
):
    return await svc.get_equipment_efms(
        equipment_id,
        active_only=active_only,
        category=category,
        current_user=current_user,
    )


@router.get("/equipment/{equipment_id}/efms/summary")
async def get_equipment_efm_summary(
    equipment_id: str,
    current_user: dict = Depends(_library_read),
):
    return await svc.get_equipment_efm_summary(equipment_id, current_user)


@router.get("/equipment/{equipment_id}/risk")
async def get_equipment_risk(
    equipment_id: str,
    current_user: dict = Depends(_library_read),
):
    return await svc.get_equipment_risk(equipment_id, current_user)


@router.post("/equipment/{equipment_id}/efms/generate")
async def generate_efms_for_equipment(
    equipment_id: str,
    current_user: dict = Depends(_library_write),
):
    return await svc.generate_efms_for_equipment(equipment_id, current_user)


@router.get("/efms/high-risk")
async def get_high_risk_efms(
    equipment_id: Optional[str] = None,
    min_rpn: int = 150,
    current_user: dict = Depends(_library_read),
):
    return await svc.get_high_risk_efms(
        equipment_id=equipment_id,
        min_rpn=min_rpn,
        current_user=current_user,
    )


@router.get("/efms/{efm_id}")
async def get_efm_by_id(
    efm_id: str,
    current_user: dict = Depends(_library_read),
):
    return await svc.get_efm_by_id(efm_id, current_user)


@router.patch("/efms/{efm_id}")
async def update_efm(
    efm_id: str,
    data: EFMUpdate,
    current_user: dict = Depends(_library_write),
):
    return await svc.update_efm(efm_id, data, current_user)


@router.post("/efms/{efm_id}/reset")
async def reset_efm_to_template(
    efm_id: str,
    current_user: dict = Depends(_library_write),
):
    return await svc.reset_efm_to_template(efm_id, current_user)
