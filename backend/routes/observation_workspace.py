"""
Observation Workspace routes — orchestration only (Wave 9 convergence).
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query

from auth import get_current_user

router = APIRouter(prefix="/observation-workspace", tags=["Observation Workspace"])


@router.get("/{observation_id}")
async def get_observation_workspace(
    observation_id: str,
    language: Optional[str] = Query(None, description="UI language code (nl, de) for localized content"),
    current_user: dict = Depends(get_current_user),
):
    from services import observation_workspace_service

    return await observation_workspace_service.get_workspace(
        current_user, observation_id, language=language
    )


@router.post("/{observation_id}/add-action")
async def add_action_to_plan(
    observation_id: str,
    action_data: dict,
    current_user: dict = Depends(get_current_user),
):
    from services import observation_workspace_service

    return await observation_workspace_service.add_action_to_plan(
        current_user, observation_id, action_data
    )


@router.post("/{observation_id}/add-recommendation")
async def add_recommendation_to_plan(
    observation_id: str,
    recommendation: dict,
    current_user: dict = Depends(get_current_user),
):
    from services import observation_workspace_service

    return await observation_workspace_service.add_recommendation_to_plan(
        current_user, observation_id, recommendation
    )


@router.get("/{observation_id}/timeline")
async def get_observation_timeline_enhanced(
    observation_id: str,
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    from services import observation_workspace_service

    return await observation_workspace_service.get_timeline_enhanced(
        current_user, observation_id, limit=limit
    )
