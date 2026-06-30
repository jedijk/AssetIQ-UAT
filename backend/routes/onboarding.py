"""Self-service client onboarding workspace API."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from auth import require_roles
from services import onboarding_service as svc

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

_admin_dep = require_roles("owner", "admin")


class EntryPathRequest(BaseModel):
    entry_path: str = Field(..., description="Wizard card selection key")


@router.get("/status")
async def get_onboarding_status(current_user: dict = Depends(_admin_dep)):
    """Progress, readiness scores, outstanding actions, and time estimate."""
    return await svc.get_onboarding_summary(current_user)


@router.get("/summary")
async def get_onboarding_summary(current_user: dict = Depends(_admin_dep)):
    """Alias for status — landing dashboard payload."""
    return await svc.get_onboarding_summary(current_user)


@router.get("/phases/{phase_id}")
async def get_phase_detail(
    phase_id: str,
    current_user: dict = Depends(_admin_dep),
):
    return await svc.get_phase_detail(current_user, phase_id)


@router.post("/entry-path")
async def select_entry_path(
    body: EntryPathRequest,
    current_user: dict = Depends(_admin_dep),
):
    return await svc.select_entry_path(current_user, body.entry_path)


@router.post("/phases/{phase_id}/validate")
async def run_phase_validation(
    phase_id: str,
    current_user: dict = Depends(_admin_dep),
):
    from services.tenant_schema import tenant_id_from_user

    tenant_id = tenant_id_from_user(current_user)
    if not tenant_id:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="No tenant context for user")
    return await svc.validate_phase(tenant_id, phase_id, persist=True)


@router.post("/go-live/validate")
async def run_go_live_validation(current_user: dict = Depends(_admin_dep)):
    return await svc.run_go_live_validation(current_user)
