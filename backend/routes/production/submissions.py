"""Orchestration only — Wave 10."""
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Query

from auth import get_current_user, require_permission
from services import production_submissions_service as svc

router = APIRouter(tags=["Production Dashboard"])

_forms_write = require_permission("forms:write")
_settings_write = require_permission("settings:write")


@router.patch("/production/information/{submission_id}/pin")
async def set_production_information_pin(
    submission_id: str,
    data: dict,
    current_user: dict = Depends(_forms_write),
):
    return await svc.set_production_information_pin(current_user, submission_id, data)

@router.patch("/production/submission/{submission_id}")
async def update_production_submission(
    submission_id: str,
    data: dict,
    current_user: dict = Depends(_forms_write),
):
    return await svc.update_production_submission(current_user, submission_id, data)

@router.post("/production/create-viscosity")
async def create_viscosity_submission(
    data: dict,
    current_user: dict = Depends(_forms_write),
):
    return await svc.create_viscosity_submission(current_user, data)

@router.get("/production/viscosity-pairing/status")
async def viscosity_pairing_status(
    date: str = Query(..., description="YYYY-MM-DD"),
    current_user: dict = Depends(get_current_user),
):
    return await svc.viscosity_pairing_status(current_user, date)

@router.post("/production/viscosity-pairing/repair")
async def repair_viscosity_pairing(
    date: str = Query(..., description="YYYY-MM-DD"),
    limit: int = Query(50, ge=1, le=500),
    current_user: dict = Depends(_settings_write),
):
    return await svc.repair_viscosity_pairing(current_user, date, limit)

@router.get("/production/viscosity-pairing/debug-report")
async def viscosity_pairing_debug_report(
    date: str = Query(..., description="YYYY-MM-DD"),
    current_user: dict = Depends(get_current_user),
):
    return await svc.viscosity_pairing_debug_report(current_user, date)
