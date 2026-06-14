"""RIL Cases API."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from models.ril import (
    CreateReliabilityCaseRequest,
    UpdateReliabilityCaseRequest,
    CaseStatus,
    AlertPriority,
)
from routes.ril._auth import _ril_read, _ril_write
from services.ril_service_factory import get_ril_service, ril_owner_id

router = APIRouter(prefix="/cases", tags=["RIL Cases"])


@router.post("", response_model=dict)
async def create_case(
    request: CreateReliabilityCaseRequest,
    current_user: dict = Depends(_ril_write),
):
    case = await get_ril_service().create_reliability_case(
        ril_owner_id(current_user),
        request,
    )
    return {"success": True, "case": case.dict()}


@router.get("", response_model=dict)
async def list_cases(
    equipment_id: Optional[str] = Query(None),
    status: Optional[CaseStatus] = Query(None),
    priority: Optional[AlertPriority] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(_ril_read),
):
    cases, total = await get_ril_service().get_reliability_cases(
        ril_owner_id(current_user),
        equipment_id=equipment_id,
        status=status,
        priority=priority,
        limit=limit,
        skip=skip,
    )
    return {
        "cases": [c.dict() for c in cases],
        "total": total,
        "limit": limit,
        "skip": skip,
    }


@router.get("/{case_id}", response_model=dict)
async def get_case(
    case_id: str,
    current_user: dict = Depends(_ril_read),
):
    detail = await get_ril_service().get_case_detail(ril_owner_id(current_user), case_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Reliability case not found")
    return detail


@router.patch("/{case_id}", response_model=dict)
async def update_case(
    case_id: str,
    request: UpdateReliabilityCaseRequest,
    current_user: dict = Depends(_ril_write),
):
    case = await get_ril_service().update_reliability_case(
        ril_owner_id(current_user),
        case_id,
        request,
        current_user.get("id"),
    )
    if not case:
        raise HTTPException(status_code=404, detail="Reliability case not found")
    return {"success": True, "case": case.dict()}


@router.post("/{case_id}/link-observation", response_model=dict)
async def link_observation_to_case(
    case_id: str,
    observation_id: str,
    current_user: dict = Depends(_ril_write),
):
    ok = await get_ril_service().link_observation_to_case(
        ril_owner_id(current_user),
        case_id,
        observation_id,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Reliability case not found")
    return {"success": True, "message": "Observation linked to case"}


@router.post("/{case_id}/link-alert", response_model=dict)
async def link_alert_to_case(
    case_id: str,
    alert_id: str,
    current_user: dict = Depends(_ril_write),
):
    ok = await get_ril_service().link_alert_to_case(
        ril_owner_id(current_user),
        case_id,
        alert_id,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Reliability case not found")
    return {"success": True, "message": "Alert linked to case"}


@router.post("/{case_id}/link-investigation", response_model=dict)
async def link_investigation_to_case(
    case_id: str,
    investigation_id: str,
    current_user: dict = Depends(_ril_write),
):
    ok = await get_ril_service().link_investigation_to_case(
        ril_owner_id(current_user),
        case_id,
        investigation_id,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Reliability case not found")
    return {"success": True, "message": "Investigation linked to case"}
