"""
Investigations routes — orchestration only (Wave 7 convergence).
"""
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, Response, UploadFile
from pydantic import BaseModel, Field

from auth import require_permission
from investigation_models import (
    ActionItemCreate,
    ActionItemUpdate,
    CauseNodeCreate,
    CauseNodeUpdate,
    EvidenceCreate,
    FailureIdentificationCreate,
    FailureIdentificationUpdate,
    InvestigationCreate,
    InvestigationUpdate,
    RecurringQuadrantData,
    TimelineEventCreate,
    TimelineEventUpdate,
)
from services.background_jobs import schedule_tracked_job
from utils.auto_translate import translate_investigation

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Investigations"])

_investigations_read = require_permission("investigations:read")
_investigations_write = require_permission("investigations:write")
_investigations_delete = require_permission("investigations:delete")


class AIProblemCheckRequest(BaseModel):
    description: str = Field(..., description="The problem description to analyze")


@router.post("/investigations")
async def create_investigation(
    data: InvestigationCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(_investigations_write),
):
    from services import investigation_service

    inv_doc = await investigation_service.create_investigation(current_user, data.model_dump())
    schedule_tracked_job(
        background_tasks,
        "translate_investigation",
        translate_investigation,
        inv_doc["id"],
        {"title": data.title, "description": data.description or ""},
        current_user["id"],
        user_id=current_user["id"],
    )
    return inv_doc


@router.get("/investigations")
async def get_investigations(
    status: Optional[str] = None,
    current_user: dict = Depends(_investigations_read),
):
    from services import investigation_service

    return await investigation_service.list_investigations(current_user, status=status)


@router.get("/investigations/{inv_id}")
async def get_investigation(inv_id: str, current_user: dict = Depends(_investigations_read)):
    from services import investigation_service

    return await investigation_service.get_investigation_detail(current_user, inv_id)


@router.patch("/investigations/{inv_id}")
async def update_investigation(
    inv_id: str,
    update: InvestigationUpdate,
    current_user: dict = Depends(_investigations_write),
):
    from services import investigation_service

    return await investigation_service.update_investigation(
        current_user, inv_id, update.model_dump()
    )


@router.delete("/investigations/{inv_id}")
async def delete_investigation(
    inv_id: str,
    delete_central_actions: bool = Query(False, description="Also delete linked Central Actions"),
    current_user: dict = Depends(_investigations_delete),
):
    from services import investigation_service

    result = await investigation_service.delete_investigation(
        current_user, inv_id, delete_central_actions=delete_central_actions
    )
    if result.get("deleted_central_actions"):
        logger.info(
            "Deleted %s central actions linked to investigation %s",
            result["deleted_central_actions"],
            inv_id,
        )
    return result


@router.post("/investigations/{inv_id}/events")
async def create_timeline_event(
    inv_id: str,
    data: TimelineEventCreate,
    current_user: dict = Depends(_investigations_write),
):
    from services import investigation_service

    return await investigation_service.create_timeline_event(current_user, inv_id, data)


@router.patch("/investigations/{inv_id}/events/{event_id}")
async def update_timeline_event(
    inv_id: str,
    event_id: str,
    update: TimelineEventUpdate,
    current_user: dict = Depends(_investigations_write),
):
    from services import investigation_service

    return await investigation_service.update_timeline_event(
        current_user, inv_id, event_id, update
    )


@router.delete("/investigations/{inv_id}/events/{event_id}")
async def delete_timeline_event(
    inv_id: str,
    event_id: str,
    current_user: dict = Depends(_investigations_delete),
):
    from services import investigation_service

    return await investigation_service.delete_timeline_event(current_user, inv_id, event_id)


@router.post("/investigations/{inv_id}/failures")
async def create_failure_identification(
    inv_id: str,
    data: FailureIdentificationCreate,
    current_user: dict = Depends(_investigations_write),
):
    from services import investigation_service

    return await investigation_service.create_failure_identification(current_user, inv_id, data)


@router.patch("/investigations/{inv_id}/failures/{failure_id}")
async def update_failure_identification(
    inv_id: str,
    failure_id: str,
    update: FailureIdentificationUpdate,
    current_user: dict = Depends(_investigations_write),
):
    from services import investigation_service

    return await investigation_service.update_failure_identification(
        current_user, inv_id, failure_id, update
    )


@router.delete("/investigations/{inv_id}/failures/{failure_id}")
async def delete_failure_identification(
    inv_id: str,
    failure_id: str,
    current_user: dict = Depends(_investigations_delete),
):
    from services import investigation_service

    return await investigation_service.delete_failure_identification(
        current_user, inv_id, failure_id
    )


@router.post("/investigations/{inv_id}/causes")
async def create_cause_node(
    inv_id: str,
    data: CauseNodeCreate,
    current_user: dict = Depends(_investigations_write),
):
    from services import investigation_service

    return await investigation_service.create_cause_node(current_user, inv_id, data)


@router.patch("/investigations/{inv_id}/causes/{cause_id}")
async def update_cause_node(
    inv_id: str,
    cause_id: str,
    update: CauseNodeUpdate,
    current_user: dict = Depends(_investigations_write),
):
    from services import investigation_service

    return await investigation_service.update_cause_node(
        current_user, inv_id, cause_id, update
    )


@router.delete("/investigations/{inv_id}/causes/{cause_id}")
async def delete_cause_node(
    inv_id: str,
    cause_id: str,
    current_user: dict = Depends(_investigations_delete),
):
    from services import investigation_service

    return await investigation_service.delete_cause_node(current_user, inv_id, cause_id)


@router.post("/investigations/{inv_id}/actions")
async def create_action_item(
    inv_id: str,
    data: ActionItemCreate,
    current_user: dict = Depends(_investigations_write),
):
    from services import investigation_service

    return await investigation_service.create_action_item(current_user, inv_id, data)


@router.patch("/investigations/{inv_id}/actions/{action_id}")
async def update_action_item(
    inv_id: str,
    action_id: str,
    update: ActionItemUpdate,
    current_user: dict = Depends(_investigations_write),
):
    from services import investigation_service

    return await investigation_service.update_action_item(
        current_user, inv_id, action_id, update
    )


@router.delete("/investigations/{inv_id}/actions/{action_id}")
async def delete_action_item(
    inv_id: str,
    action_id: str,
    current_user: dict = Depends(_investigations_delete),
):
    from services import investigation_service

    return await investigation_service.delete_action_item(current_user, inv_id, action_id)


@router.post("/investigations/{inv_id}/evidence")
async def add_evidence(
    inv_id: str,
    data: EvidenceCreate,
    current_user: dict = Depends(_investigations_write),
):
    from services import investigation_service

    return await investigation_service.add_evidence(current_user, inv_id, data)


@router.delete("/investigations/{inv_id}/evidence/{evidence_id}")
async def delete_evidence(
    inv_id: str,
    evidence_id: str,
    current_user: dict = Depends(_investigations_delete),
):
    from services import investigation_service

    return await investigation_service.delete_evidence(current_user, inv_id, evidence_id)


@router.post("/investigations/{inv_id}/upload")
async def upload_investigation_file(
    inv_id: str,
    file: UploadFile = File(...),
    description: str = Form(None),
    current_user: dict = Depends(_investigations_write),
):
    from services import investigation_service

    file_data = await file.read()
    return await investigation_service.upload_investigation_file(
        current_user,
        inv_id,
        file_data=file_data,
        filename=file.filename or "",
        content_type=file.content_type or "",
        description=description,
    )


@router.get("/files/{path:path}")
async def download_file(path: str, current_user: dict = Depends(_investigations_read)):
    from services import investigation_service

    data, content_type, filename = await investigation_service.download_file(current_user, path)
    return Response(
        content=data,
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post("/investigations/{inv_id}/ai-problem-check")
async def ai_problem_check(
    inv_id: str,
    request: AIProblemCheckRequest,
    current_user: dict = Depends(_investigations_read),
):
    from services import investigation_service

    return await investigation_service.ai_problem_check(
        current_user, inv_id, request.description
    )


@router.get("/investigations/{inv_id}/similar-incidents")
async def get_similar_incidents(inv_id: str, current_user: dict = Depends(_investigations_read)):
    from services import investigation_service

    return await investigation_service.get_similar_incidents(current_user, inv_id)


@router.get("/investigations/{inv_id}/linked-incident")
async def get_linked_incident(inv_id: str, current_user: dict = Depends(_investigations_read)):
    from services import investigation_service

    return await investigation_service.get_linked_incident(current_user, inv_id)


@router.patch("/investigations/{inv_id}/recurring-quadrant")
async def update_recurring_quadrant(
    inv_id: str,
    quadrant_data: RecurringQuadrantData,
    current_user: dict = Depends(_investigations_write),
):
    from services import investigation_service

    return await investigation_service.update_recurring_quadrant(
        current_user, inv_id, quadrant_data
    )


@router.patch("/investigations/{inv_id}/link-incident")
async def link_incident(
    inv_id: str,
    linked_incident_id: str = Query(..., description="ID of the previous incident to link"),
    current_user: dict = Depends(_investigations_write),
):
    from services import investigation_service

    return await investigation_service.link_incident(
        current_user, inv_id, linked_incident_id
    )


@router.delete("/investigations/{inv_id}/link-incident")
async def unlink_incident(inv_id: str, current_user: dict = Depends(_investigations_delete)):
    from services import investigation_service

    return await investigation_service.unlink_incident(current_user, inv_id)
