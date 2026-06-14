"""AI Risk Engine routes — orchestration only (Wave 13)."""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from ai_risk_models import (
    AnalyzeRiskRequest,
    GenerateCausesRequest,
    GenerateFaultTreeRequest,
    OptimizeActionsRequest,
)
from auth import get_current_user
from services import ai_risk_service as svc

router = APIRouter(tags=["AI Risk Engine"])
limiter = Limiter(key_func=get_remote_address)

AI_RATE_LIMIT = "20/minute"
AI_HEAVY_RATE_LIMIT = "10/minute"


@router.post("/ai/dashboard-intent")
@limiter.limit(AI_RATE_LIMIT)
async def dashboard_intent(
    request: Request,
    body: Dict[str, Any],
    current_user: dict = Depends(get_current_user),
):
    return await svc.dashboard_intent(current_user, body)


@router.post("/ai/chat-analyze")
async def chat_analyze(
    request: Request,
    data: dict,
    current_user: dict = Depends(get_current_user),
):
    return await svc.chat_analyze(current_user, data)


@router.post("/ai/analyze-risk/{threat_id}")
@limiter.limit(AI_RATE_LIMIT)
async def analyze_threat_risk(
    request: Request,
    threat_id: str,
    body: AnalyzeRiskRequest = None,
    current_user: dict = Depends(get_current_user),
):
    return await svc.analyze_threat_risk(current_user, threat_id, body)


@router.get("/ai/risk-insights/{threat_id}")
@limiter.limit(AI_RATE_LIMIT)
async def get_risk_insights(
    request: Request,
    threat_id: str,
    language: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    return await svc.get_risk_insights(current_user, threat_id, language)


@router.get("/ai/top-risks")
@limiter.limit(AI_RATE_LIMIT)
async def get_ai_top_risks(
    request: Request,
    limit: int = 5,
    current_user: dict = Depends(get_current_user),
):
    return await svc.get_ai_top_risks(current_user, limit)


@router.post("/ai/generate-causes/{threat_id}")
@limiter.limit(AI_RATE_LIMIT)
async def generate_threat_causes(
    request: Request,
    threat_id: str,
    body: GenerateCausesRequest = None,
    language: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    return await svc.generate_threat_causes(current_user, threat_id, language, body)


@router.get("/ai/causal-analysis/{threat_id}")
@limiter.limit(AI_RATE_LIMIT)
async def get_causal_analysis(
    request: Request,
    threat_id: str,
    language: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    return await svc.get_causal_analysis(current_user, threat_id, language)


@router.post("/ai/explain/{threat_id}")
@limiter.limit(AI_RATE_LIMIT)
async def explain_threat(
    request: Request,
    threat_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await svc.explain_threat(current_user, threat_id)


@router.post("/ai/fault-tree/{threat_id}")
@limiter.limit(AI_HEAVY_RATE_LIMIT)
async def generate_fault_tree(
    request: Request,
    threat_id: str,
    body: GenerateFaultTreeRequest = None,
    current_user: dict = Depends(get_current_user),
):
    return await svc.generate_fault_tree(current_user, threat_id, body)


@router.get("/ai/fault-tree/{threat_id}")
@limiter.limit(AI_RATE_LIMIT)
async def get_fault_tree(
    request: Request,
    threat_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await svc.get_fault_tree(current_user, threat_id)


@router.post("/ai/bow-tie/{threat_id}")
@limiter.limit(AI_HEAVY_RATE_LIMIT)
async def generate_bow_tie(
    request: Request,
    threat_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await svc.generate_bow_tie(current_user, threat_id)


@router.get("/ai/bow-tie/{threat_id}")
@limiter.limit(AI_RATE_LIMIT)
async def get_bow_tie(
    request: Request,
    threat_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await svc.get_bow_tie(current_user, threat_id)


@router.post("/ai/optimize-actions/{threat_id}")
@limiter.limit(AI_RATE_LIMIT)
async def optimize_threat_actions(
    request: Request,
    threat_id: str,
    body: OptimizeActionsRequest = None,
    current_user: dict = Depends(get_current_user),
):
    return await svc.optimize_threat_actions(current_user, threat_id, body)


@router.get("/ai/action-optimization/{threat_id}")
@limiter.limit(AI_RATE_LIMIT)
async def get_action_optimization(
    request: Request,
    threat_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await svc.get_action_optimization(current_user, threat_id)
