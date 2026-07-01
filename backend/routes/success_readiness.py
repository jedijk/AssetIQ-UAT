"""Success Readiness API routes."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user, require_permission, require_roles
from services import success_readiness_service as svc
from services import pulse_survey_service as pulse_svc

router = APIRouter(prefix="/success-readiness", tags=["success-readiness"])

_view_roles = require_roles("admin", "reliability_engineer", "maintenance", "operations", "viewer")
_admin_roles = require_roles("admin")
_owner_roles = require_roles()  # owner only (owner always passes require_roles)
_sr_read = require_permission("success_readiness:read")
_sr_write = require_permission("success_readiness:write")


class RegisterCreateRequest(BaseModel):
    title: str = Field(..., min_length=1)
    description: str = ""
    status: str = "draft"
    completion_pct: int = Field(0, ge=0, le=100)
    owner: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RegisterUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    completion_pct: Optional[int] = Field(None, ge=0, le=100)
    owner: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class ConfigurationUpdateRequest(BaseModel):
    targets_locked: Optional[bool] = None
    notification_enabled: Optional[bool] = None
    pillar_weights: Optional[Dict[str, float]] = None


class AssessmentSubmitRequest(BaseModel):
    answers: Dict[str, Any] = Field(default_factory=dict)
    reviewer: Optional[str] = None
    review_date: Optional[str] = None


class EvidenceCreateRequest(BaseModel):
    kpi_id: str
    title: str = "Evidence"
    description: str = ""
    attachment_url: Optional[str] = None


@router.post("/collect")
async def collect_readiness(current_user: dict = Depends(_admin_roles)):
    return await svc.collect_and_persist(current_user)


@router.get("/dashboard")
async def get_dashboard(current_user: dict = Depends(_view_roles)):
    return await svc.get_dashboard(current_user)


@router.get("/kpis")
async def list_kpis(
    pillar: Optional[str] = None,
    current_user: dict = Depends(_view_roles),
):
    return await svc.get_kpis(current_user, pillar=pillar)


@router.get("/kpis/{kpi_id}")
async def get_kpi(kpi_id: str, current_user: dict = Depends(_view_roles)):
    detail = await svc.get_kpi_detail(current_user, kpi_id)
    if not detail:
        raise HTTPException(status_code=404, detail="KPI not found")
    return detail


@router.get("/registers/{register_type}")
async def list_registers(register_type: str, current_user: dict = Depends(_view_roles)):
    return await svc.get_registers(current_user, register_type)


@router.post("/registers/{register_type}")
async def create_register(
    register_type: str,
    body: RegisterCreateRequest,
    current_user: dict = Depends(_admin_roles),
):
    try:
        return await svc.create_register(current_user, register_type, body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/registers/{register_type}/{entry_id}")
async def update_register(
    register_type: str,
    entry_id: str,
    body: RegisterUpdateRequest,
    current_user: dict = Depends(_admin_roles),
):
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    updated = await svc.update_register(current_user, entry_id, payload)
    if not updated:
        raise HTTPException(status_code=404, detail="Register entry not found")
    return updated


@router.get("/assessments")
async def list_assessments_route(current_user: dict = Depends(_view_roles)):
    from services.success_readiness_assessments import list_assessments

    return await list_assessments(current_user)


@router.post("/assessments/{assessment_id}/submit")
async def submit_assessment_route(
    assessment_id: str,
    body: AssessmentSubmitRequest,
    current_user: dict = Depends(_admin_roles),
):
    from services.success_readiness_assessments import submit_assessment

    updated = await submit_assessment(current_user, assessment_id, body.model_dump())
    if not updated:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return updated


@router.get("/evidence")
async def list_evidence(
    kpi_id: Optional[str] = None,
    current_user: dict = Depends(_view_roles),
):
    return await svc.list_evidence(current_user, kpi_id=kpi_id)


@router.post("/evidence")
async def create_evidence(
    body: EvidenceCreateRequest,
    current_user: dict = Depends(_admin_roles),
):
    return await svc.create_evidence(current_user, body.model_dump())


@router.get("/history")
async def list_history(current_user: dict = Depends(_view_roles)):
    return await svc.list_history(current_user)


@router.get("/ai-recommendations")
async def get_ai_recommendations(current_user: dict = Depends(_view_roles)):
    return await svc.get_ai_recommendations(current_user)


@router.get("/configuration")
async def get_configuration(current_user: dict = Depends(_view_roles)):
    return await svc.get_configuration(current_user)


@router.patch("/configuration")
async def update_configuration(
    body: ConfigurationUpdateRequest,
    current_user: dict = Depends(_owner_roles),
):
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    return await svc.update_configuration(current_user, payload)


class PulseSurveyCreateRequest(BaseModel):
    template_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    survey_type: Optional[str] = None
    status: Optional[str] = "draft"
    anonymous: bool = True
    recipient_rules: Dict[str, Any] = Field(default_factory=lambda: {"type": "all_users"})
    questions: Optional[List[Dict[str, Any]]] = None
    comment_prompt: Optional[str] = None
    due_date: Optional[str] = None


class PulseSurveyUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    survey_type: Optional[str] = None
    status: Optional[str] = None
    anonymous: Optional[bool] = None
    recipient_rules: Optional[Dict[str, Any]] = None
    questions: Optional[List[Dict[str, Any]]] = None
    comment_prompt: Optional[str] = None
    due_date: Optional[str] = None


class PulseSurveyResponseSubmitRequest(BaseModel):
    answers: List[Dict[str, Any]] = Field(default_factory=list)
    comment: Optional[str] = ""


@router.get("/pulse-surveys/dashboard")
async def pulse_surveys_dashboard(current_user: dict = Depends(_sr_read)):
    return await pulse_svc.get_dashboard(current_user)


@router.get("/pulse-surveys/templates")
async def pulse_surveys_templates(current_user: dict = Depends(_sr_read)):
    return pulse_svc.list_templates()


@router.get("/pulse-surveys")
async def pulse_surveys_list(
    status: Optional[str] = None,
    current_user: dict = Depends(_sr_read),
):
    return await pulse_svc.list_surveys(current_user, status=status)


@router.post("/pulse-surveys")
async def pulse_surveys_create(
    body: PulseSurveyCreateRequest,
    current_user: dict = Depends(_sr_write),
):
    try:
        return await pulse_svc.create_survey(current_user, body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/pulse-surveys/{survey_id}")
async def pulse_surveys_update(
    survey_id: str,
    body: PulseSurveyUpdateRequest,
    current_user: dict = Depends(_sr_write),
):
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    try:
        updated = await pulse_svc.update_survey(current_user, survey_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not updated:
        raise HTTPException(status_code=404, detail="Survey not found")
    return updated


@router.post("/pulse-surveys/{survey_id}/publish")
async def pulse_surveys_publish(
    survey_id: str,
    current_user: dict = Depends(_sr_write),
):
    try:
        published = await pulse_svc.publish_survey(current_user, survey_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not published:
        raise HTTPException(status_code=404, detail="Survey not found")
    return published


@router.post("/pulse-surveys/{survey_id}/close")
async def pulse_surveys_close(
    survey_id: str,
    current_user: dict = Depends(_sr_write),
):
    closed = await pulse_svc.close_survey(current_user, survey_id)
    if not closed:
        raise HTTPException(status_code=404, detail="Survey not found")
    return closed


@router.get("/pulse-surveys/{survey_id}")
async def pulse_surveys_detail(
    survey_id: str,
    current_user: dict = Depends(_sr_read),
):
    detail = await pulse_svc.get_survey_detail(current_user, survey_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Survey not found")
    return detail


@router.get("/pulse-surveys/my/pending")
async def pulse_surveys_my_pending(current_user: dict = Depends(get_current_user)):
    return await pulse_svc.list_my_pending_surveys(current_user)


@router.post("/pulse-surveys/{survey_id}/responses")
async def pulse_surveys_submit_response(
    survey_id: str,
    body: PulseSurveyResponseSubmitRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        return await pulse_svc.submit_response(current_user, survey_id, body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
