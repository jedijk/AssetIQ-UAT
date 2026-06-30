"""Self-service client onboarding workspace API."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel, Field

from auth import require_roles
from services import onboarding_service as svc
from services.tenant_schema import tenant_id_from_user

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

_admin_dep = require_roles("owner", "admin")


class EntryPathRequest(BaseModel):
    entry_path: str = Field(..., description="Wizard card selection key")


class CoachRequest(BaseModel):
    phase_id: str = Field(..., description="Onboarding phase id")
    message: str = Field(..., min_length=1, description="User question for the coach")


class CompanyProfileUpdate(BaseModel):
    name: Optional[str] = None
    default_language: Optional[str] = None
    default_timezone: Optional[str] = None


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


@router.post("/coach")
async def ask_onboarding_coach(
    body: CoachRequest,
    current_user: dict = Depends(_admin_dep),
):
    return await svc.ask_coach(current_user, body.phase_id, body.message)


@router.get("/company-profile")
async def get_company_profile(current_user: dict = Depends(_admin_dep)):
    return await svc.get_company_profile(current_user)


@router.patch("/company-profile")
async def update_company_profile(
    body: CompanyProfileUpdate,
    current_user: dict = Depends(_admin_dep),
):
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    return await svc.update_company_profile(current_user, payload)


@router.post("/company-profile/logo")
async def upload_company_logo(
    file: UploadFile = File(...),
    current_user: dict = Depends(_admin_dep),
):
    content = await file.read()
    content_type = file.content_type or "application/octet-stream"
    return await svc.upload_company_logo(
        current_user,
        content=content,
        content_type=content_type,
        filename=file.filename or "logo.png",
    )


@router.get("/company-profile/logo")
async def get_company_logo(current_user: dict = Depends(_admin_dep)):
    tenant_id = tenant_id_from_user(current_user)
    if not tenant_id:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="No tenant context for user")
    return await svc.get_company_logo_response(tenant_id)
