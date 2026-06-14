"""Execution & Reliability Insights — orchestration only (Wave 11)."""
from fastapi import APIRouter, Depends

from auth import require_permission
from services import insights_service as svc

router = APIRouter(tags=["insights"])

_read = require_permission("library:read")


@router.get("/execution/actions")
async def get_action_execution_metrics(current_user: dict = Depends(_read)):
    return await svc.get_action_execution_metrics(current_user)


@router.get("/execution/tasks")
async def get_task_execution_metrics(current_user: dict = Depends(_read)):
    return await svc.get_task_execution_metrics(current_user)


@router.get("/execution/disciplines")
async def get_discipline_performance(current_user: dict = Depends(_read)):
    return await svc.get_discipline_performance(current_user)


@router.get("/reliability/data-quality")
async def get_data_quality_metrics(current_user: dict = Depends(_read)):
    return await svc.get_data_quality_metrics(current_user)


@router.get("/reliability/gaps")
async def get_reliability_gaps(current_user: dict = Depends(_read)):
    return await svc.get_reliability_gaps(current_user)


@router.post("/ai/recommendations")
async def generate_ai_recommendations(current_user: dict = Depends(_read)):
    return await svc.generate_ai_recommendations(current_user)


@router.get("/insights/summary")
async def get_insights_summary(current_user: dict = Depends(_read)):
    return await svc.get_insights_summary(current_user)
