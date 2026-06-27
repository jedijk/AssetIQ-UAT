"""
Work signal routes — orchestration only (Observation/Threat convergence Phase 4).

Primary API: ``/observations/signals/*``
Deprecated aliases: ``/threats/*`` (same handlers)
"""
from typing import List, Optional, Union

from fastapi import APIRouter, BackgroundTasks, Body, Depends, Query

from auth import require_any_permission
from models.api_models import ThreatResponse, ThreatUpdate
from services.background_jobs import schedule_tracked_job
from utils.auto_translate import translate_observation

router = APIRouter(tags=["Work Signals", "Observations"])

_signals_read = require_any_permission("observations:read", "threats:read")
_signals_write = require_any_permission("observations:write", "threats:write")
_signals_delete = require_any_permission("observations:delete", "threats:delete")


@router.get("/observations/signals", response_model=List[ThreatResponse])
@router.get("/threats", response_model=List[ThreatResponse], deprecated=True)
async def get_threats(
    status: Optional[str] = None,
    limit: int = 100,
    language: Optional[str] = Query(None, description="UI language (en, nl, de) for localized titles"),
    current_user: dict = Depends(_signals_read),
):
    from services import threat_service

    return await threat_service.list_threats(
        current_user, status=status, limit=limit, language=language
    )


@router.get("/observations/signals/top", response_model=List[ThreatResponse])
@router.get("/threats/top", response_model=List[ThreatResponse], deprecated=True)
async def get_top_threats(
    limit: int = 10,
    language: Optional[str] = Query(None, description="UI language (en, nl, de) for localized titles"),
    exclude_mitigated: bool = Query(False, description="Exclude mitigated observations from results"),
    current_user: dict = Depends(_signals_read),
):
    from services import threat_service

    return await threat_service.list_top_threats(
        current_user, limit=limit, language=language, exclude_mitigated=exclude_mitigated
    )


@router.post("/observations/signals/recalculate-scores")
@router.post("/threats/recalculate-scores", deprecated=True)
async def recalculate_all_threat_scores(current_user: dict = Depends(_signals_write)):
    from services import threat_service

    return await threat_service.recalculate_all_threat_scores(current_user)


@router.get("/observations/signals/{signal_id}", response_model=ThreatResponse)
@router.get("/threats/{signal_id}", response_model=ThreatResponse, deprecated=True)
async def get_threat(
    signal_id: str,
    language: Optional[str] = Query(None, description="UI language (en, nl, de) for localized titles"),
    current_user: dict = Depends(_signals_read),
):
    from services import threat_service

    return await threat_service.get_threat_detail(current_user, signal_id, language=language)


@router.patch("/observations/signals/{signal_id}", response_model=ThreatResponse)
@router.patch("/threats/{signal_id}", response_model=ThreatResponse, deprecated=True)
async def update_threat(
    signal_id: str,
    update: ThreatUpdate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(_signals_write),
):
    from services import threat_service

    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    updated = await threat_service.update_threat(current_user, signal_id, update_data)
    if any(k in update_data for k in ("title", "description")):
        schedule_tracked_job(
            background_tasks,
            "translate_observation",
            translate_observation,
            signal_id,
            {
                "title": updated.get("title") or updated.get("name", ""),
                "description": updated.get("description", "") or "",
            },
            current_user["id"],
            user_id=current_user["id"],
        )
    return updated


@router.delete("/observations/signals/{signal_id}")
@router.delete("/threats/{signal_id}", deprecated=True)
async def delete_threat(
    signal_id: str,
    delete_actions: bool = Query(False, description="Also delete linked Central Actions"),
    delete_investigations: bool = Query(False, description="Also delete linked Investigations"),
    current_user: dict = Depends(_signals_delete),
):
    from services import threat_service

    return await threat_service.delete_threat(
        current_user,
        signal_id,
        delete_actions=delete_actions,
        delete_investigations=delete_investigations,
    )


@router.post("/observations/signals/{signal_id}/link-equipment")
@router.post("/threats/{signal_id}/link-equipment", deprecated=True)
async def link_threat_to_equipment(
    signal_id: str,
    equipment_node_id: str = Body(..., embed=True),
    current_user: dict = Depends(_signals_write),
):
    from services import threat_service

    return await threat_service.link_threat_to_equipment(
        current_user, signal_id, equipment_node_id
    )


@router.post("/observations/signals/{signal_id}/link-failure-mode")
@router.post("/threats/{signal_id}/link-failure-mode", deprecated=True)
async def link_threat_to_failure_mode(
    signal_id: str,
    failure_mode_id: Union[int, str] = Body(..., embed=True),
    current_user: dict = Depends(_signals_write),
):
    from services import threat_service

    return await threat_service.link_threat_to_failure_mode(
        current_user, signal_id, failure_mode_id
    )


@router.post("/observations/signals/{signal_id}/investigate")
@router.post("/threats/{signal_id}/investigate", deprecated=True)
async def create_investigation_from_threat(
    signal_id: str,
    current_user: dict = Depends(_signals_write),
):
    from services import threat_service

    return await threat_service.create_investigation_from_threat(current_user, signal_id)


@router.get("/observations/signals/{signal_id}/timeline")
@router.get("/threats/{signal_id}/timeline", deprecated=True)
async def get_threat_timeline(
    signal_id: str,
    current_user: dict = Depends(_signals_read),
):
    from services import threat_service

    return await threat_service.get_threat_timeline(current_user, signal_id)


@router.post("/observations/signals/{signal_id}/improve-description")
@router.post("/threats/{signal_id}/improve-description", deprecated=True)
async def improve_threat_description(
    signal_id: str,
    background_tasks: BackgroundTasks,
    language: Optional[str] = Query(None, description="UI language (en, nl, de) for improved text"),
    current_user: dict = Depends(_signals_write),
):
    from services import threat_service

    result = await threat_service.improve_threat_description(
        current_user, signal_id, language=language
    )
    schedule_tracked_job(
        background_tasks,
        "translate_observation",
        translate_observation,
        signal_id,
        {
            "title": "",
            "description": result.get("improved_description", ""),
        },
        current_user["id"],
        user_id=current_user["id"],
    )
    return result
