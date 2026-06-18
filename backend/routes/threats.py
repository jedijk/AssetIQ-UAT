"""
Threats routes — orchestration only (Wave 7 convergence).
"""
from typing import List, Optional, Union

from fastapi import APIRouter, BackgroundTasks, Body, Depends, Query

from auth import require_permission
from models.api_models import ThreatResponse, ThreatUpdate
from services.background_jobs import schedule_tracked_job
from utils.auto_translate import translate_observation

router = APIRouter(tags=["Threats"])

_threats_read = require_permission("threats:read")
_threats_write = require_permission("threats:write")
_threats_delete = require_permission("threats:delete")


@router.get("/threats", response_model=List[ThreatResponse])
async def get_threats(
    status: Optional[str] = None,
    limit: int = 100,
    language: Optional[str] = Query(None, description="UI language (en, nl, de) for localized titles"),
    current_user: dict = Depends(_threats_read),
):
    from services import threat_service

    return await threat_service.list_threats(
        current_user, status=status, limit=limit, language=language
    )


@router.get("/threats/top", response_model=List[ThreatResponse])
async def get_top_threats(
    limit: int = 10,
    language: Optional[str] = Query(None, description="UI language (en, nl, de) for localized titles"),
    exclude_mitigated: bool = Query(False, description="Exclude mitigated observations from results"),
    current_user: dict = Depends(_threats_read),
):
    from services import threat_service

    return await threat_service.list_top_threats(
        current_user, limit=limit, language=language, exclude_mitigated=exclude_mitigated
    )


@router.post("/threats/recalculate-scores")
async def recalculate_all_threat_scores(current_user: dict = Depends(_threats_write)):
    from services import threat_service

    return await threat_service.recalculate_all_threat_scores(current_user)


@router.get("/threats/{threat_id}", response_model=ThreatResponse)
async def get_threat(
    threat_id: str,
    language: Optional[str] = Query(None, description="UI language (en, nl, de) for localized titles"),
    current_user: dict = Depends(_threats_read),
):
    from services import threat_service

    return await threat_service.get_threat_detail(current_user, threat_id, language=language)


@router.patch("/threats/{threat_id}", response_model=ThreatResponse)
async def update_threat(
    threat_id: str,
    update: ThreatUpdate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(_threats_write),
):
    from services import threat_service

    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    updated = await threat_service.update_threat(current_user, threat_id, update_data)
    if any(k in update_data for k in ("title", "description")):
        schedule_tracked_job(
            background_tasks,
            "translate_observation",
            translate_observation,
            threat_id,
            {
                "title": updated.get("title") or updated.get("name", ""),
                "description": updated.get("description", "") or "",
            },
            current_user["id"],
            user_id=current_user["id"],
        )
    return updated


@router.delete("/threats/{threat_id}")
async def delete_threat(
    threat_id: str,
    delete_actions: bool = Query(False, description="Also delete linked Central Actions"),
    delete_investigations: bool = Query(False, description="Also delete linked Investigations"),
    current_user: dict = Depends(_threats_delete),
):
    from services import threat_service

    return await threat_service.delete_threat(
        current_user,
        threat_id,
        delete_actions=delete_actions,
        delete_investigations=delete_investigations,
    )


@router.post("/threats/{threat_id}/link-equipment")
async def link_threat_to_equipment(
    threat_id: str,
    equipment_node_id: str = Body(..., embed=True),
    current_user: dict = Depends(_threats_write),
):
    from services import threat_service

    return await threat_service.link_threat_to_equipment(
        current_user, threat_id, equipment_node_id
    )


@router.post("/threats/{threat_id}/link-failure-mode")
async def link_threat_to_failure_mode(
    threat_id: str,
    failure_mode_id: Union[int, str] = Body(..., embed=True),
    current_user: dict = Depends(_threats_write),
):
    from services import threat_service

    return await threat_service.link_threat_to_failure_mode(
        current_user, threat_id, failure_mode_id
    )


@router.post("/threats/{threat_id}/investigate")
async def create_investigation_from_threat(
    threat_id: str,
    current_user: dict = Depends(_threats_write),
):
    from services import threat_service

    return await threat_service.create_investigation_from_threat(current_user, threat_id)


@router.get("/threats/{threat_id}/timeline")
async def get_threat_timeline(
    threat_id: str,
    current_user: dict = Depends(_threats_read),
):
    from services import threat_service

    return await threat_service.get_threat_timeline(current_user, threat_id)


@router.post("/threats/{threat_id}/improve-description")
async def improve_threat_description(
    threat_id: str,
    background_tasks: BackgroundTasks,
    language: Optional[str] = Query(None, description="UI language (en, nl, de) for improved text"),
    current_user: dict = Depends(_threats_write),
):
    from services import threat_service

    result = await threat_service.improve_threat_description(
        current_user, threat_id, language=language
    )
    schedule_tracked_job(
        background_tasks,
        "translate_observation",
        translate_observation,
        threat_id,
        {
            "title": "",
            "description": result.get("improved_description", ""),
        },
        current_user["id"],
        user_id=current_user["id"],
    )
    return result
