"""
AI Maintenance Planner: uses OpenAI gpt-4o via Emergent LLM Key to produce
assignment + planned_date suggestions with explicit reasoning per task.
"""
from fastapi import APIRouter, Depends

from auth import require_permission
from models.maintenance_scheduler import AIScheduleRequest
from routes.maintenance_scheduler._shared import ApplyAIPlanRequest
from services import maintenance_scheduler_ai_service as ai_svc

router = APIRouter()


@router.post("/ai-plan")
async def ai_plan_tasks(
    request: AIScheduleRequest = None,
    current_user: dict = Depends(require_permission("scheduler:write")),
):
    """AI Maintenance Planner: optimizes task assignments and planned dates."""
    return await ai_svc.ai_plan_tasks(current_user, request)


@router.post("/ai-plan/apply")
async def apply_ai_plan(
    request: ApplyAIPlanRequest,
    current_user: dict = Depends(require_permission("scheduler:write")),
):
    """Apply selected AI recommendations to scheduled tasks."""
    return await ai_svc.apply_ai_plan(current_user, request.recommendations)
