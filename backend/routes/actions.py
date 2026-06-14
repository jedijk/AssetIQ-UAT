"""
Actions routes — orchestration only (Wave 4 convergence).
"""
from typing import Optional

from fastapi import APIRouter, Depends, BackgroundTasks
from pydantic import BaseModel

from auth import require_permission
from services.background_jobs import schedule_tracked_job
from services import action_service
from utils.auto_translate import translate_action

router = APIRouter(tags=["Actions"])

_actions_read = require_permission("actions:read")
_actions_write = require_permission("actions:write")
_actions_delete = require_permission("actions:delete")


class CentralActionCreate(BaseModel):
    title: str
    description: str
    source_type: str
    source_id: str
    source_name: str
    priority: str = "medium"
    assignee: Optional[str] = None
    action_type: Optional[str] = None
    discipline: Optional[str] = None
    due_date: Optional[str] = None
    comments: Optional[str] = None
    rpn: Optional[int] = None
    risk_score: Optional[int] = None
    risk_level: Optional[str] = None
    threat_id: Optional[str] = None


class CentralActionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    assignee: Optional[str] = None
    action_type: Optional[str] = None
    discipline: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    completion_notes: Optional[str] = None
    comments: Optional[str] = None


class ActionValidateRequest(BaseModel):
    validated_by_name: str
    validated_by_position: str
    validated_by_id: Optional[str] = None


def _schedule_translation(background_tasks: BackgroundTasks, action_id: str, doc: dict, user_id: str) -> None:
    schedule_tracked_job(
        background_tasks,
        "translate_action",
        translate_action,
        action_id,
        {
            "title": doc.get("title", ""),
            "description": doc.get("description", "") or "",
        },
        user_id,
        user_id=user_id,
    )


@router.get("/actions")
async def get_all_actions(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assignee: Optional[str] = None,
    source_type: Optional[str] = None,
    current_user: dict = Depends(_actions_read),
):
    return await action_service.list_all_actions(
        current_user,
        status=status,
        priority=priority,
        assignee=assignee,
        source_type=source_type,
    )


@router.get("/actions/overdue")
async def get_overdue_actions(current_user: dict = Depends(_actions_read)):
    return await action_service.list_overdue_actions(current_user)


@router.post("/actions")
async def create_central_action(
    data: CentralActionCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(_actions_write),
):
    action_doc = await action_service.create_action(current_user, data.dict())
    _schedule_translation(background_tasks, action_doc["id"], action_doc, current_user["id"])
    return action_doc


@router.get("/actions/{action_id}")
async def get_central_action(action_id: str, current_user: dict = Depends(_actions_read)):
    return await action_service.get_action_detail(action_id, current_user)


@router.patch("/actions/{action_id}")
async def update_central_action(
    action_id: str,
    data: CentralActionUpdate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(_actions_write),
):
    response = await action_service.update_action(action_id, current_user, data.dict())
    if any(k in data.dict(exclude_unset=True) for k in ("title", "description")):
        _schedule_translation(background_tasks, action_id, response, current_user["id"])
    return response


@router.delete("/actions/{action_id}")
async def delete_central_action_route(
    action_id: str,
    current_user: dict = Depends(_actions_delete),
):
    await action_service.delete_action(action_id, current_user)
    return {"message": "Action deleted"}


@router.post("/actions/{action_id}/validate")
async def validate_action(
    action_id: str,
    data: ActionValidateRequest,
    current_user: dict = Depends(_actions_write),
):
    return await action_service.set_action_validation(
        action_id,
        current_user,
        validated=True,
        validated_by_name=data.validated_by_name,
        validated_by_position=data.validated_by_position,
        validated_by_id=data.validated_by_id,
    )


@router.post("/actions/{action_id}/unvalidate")
async def unvalidate_action(action_id: str, current_user: dict = Depends(_actions_write)):
    return await action_service.set_action_validation(action_id, current_user, validated=False)


@router.get("/actions/source/{source_type}/{source_id}/completion-status")
async def get_source_action_completion_status(
    source_type: str,
    source_id: str,
    current_user: dict = Depends(_actions_read),
):
    return await action_service.get_source_completion_status(source_type, source_id, current_user)
