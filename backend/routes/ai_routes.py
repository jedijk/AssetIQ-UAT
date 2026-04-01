"""
AI Risk Engine routes with rate limiting and security.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Optional
from datetime import datetime, timezone
import uuid
import json
import logging
from slowapi import Limiter
from slowapi.util import get_remote_address

from database import db, EMERGENT_LLM_KEY, ai_usage_tracker
from auth import get_current_user
from ai_risk_engine import AIRiskEngine
from ai_risk_models import (
    AnalyzeRiskRequest, GenerateCausesRequest, GenerateFaultTreeRequest, OptimizeActionsRequest
)
from services.ai_security_service import detect_prompt_injection

logger = logging.getLogger(__name__)

router = APIRouter(tags=["AI Risk Engine"])

# Rate limiter - uses same key_func as main app
limiter = Limiter(key_func=get_remote_address)

ai_engine = AIRiskEngine(api_key=EMERGENT_LLM_KEY)

# Rate limit configurations
AI_RATE_LIMIT = "20/minute"  # 20 AI calls per minute per IP
AI_HEAVY_RATE_LIMIT = "10/minute"  # 10 heavy AI calls per minute (fault tree, bow tie)


async def log_ai_usage(
    user_id: str,
    feature: str,
    model: str = "gpt-5.2",
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    installation_name: str = "default",
    installation_id: str = "default",
    success: bool = True,
    metadata: dict = None
):
    """Helper to log AI usage to the tracking service."""
    try:
        await ai_usage_tracker.log_usage(
            installation_id=installation_id,
            installation_name=installation_name,
            user_id=user_id,
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            feature=feature,
            metadata={**(metadata or {}), "success": success}
        )
    except Exception as e:
        logger.error(f"Failed to log AI usage: {e}")


def check_injection_attempt(data: dict, endpoint: str) -> None:
    """Check for prompt injection in request data and log/block if detected."""
    for key, value in data.items():
        if isinstance(value, str):
            is_suspicious, matched = detect_prompt_injection(value)
            if is_suspicious:
                logger.warning(f"Potential prompt injection blocked on {endpoint}: {matched[:50]}")
                raise HTTPException(
                    status_code=400, 
                    detail="Request contains potentially unsafe content"
                )


@router.post("/ai/analyze-risk/{threat_id}")
@limiter.limit(AI_RATE_LIMIT)
async def analyze_threat_risk(
    request: Request,
    threat_id: str,
    body: AnalyzeRiskRequest = None,
    current_user: dict = Depends(get_current_user)
):
    """AI-powered dynamic risk analysis for a threat"""
    # Get threat without strict created_by filter - user can analyze any visible threat
    threat = await db.threats.find_one(
        {"id": threat_id},
        {"_id": 0}
    )
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    # Get equipment data if available
    equipment_data = None
    equipment_id = threat.get("linked_equipment_id")
    if threat.get("asset"):
        equipment_node = await db.equipment_nodes.find_one(
            {"name": threat["asset"]},
            {"_id": 0}
        )
        if equipment_node:
            equipment_data = equipment_node
            equipment_id = equipment_node.get("id")
    
    # Get equipment history (past observations, actions, tasks)
    equipment_history = {
        "observations": [],
        "actions": [],
        "tasks": []
    }
    
    if equipment_id or threat.get("asset"):
        # Get past observations for this equipment (no owner filter - installation-based access)
        past_observations = await db.threats.find(
            {
                "id": {"$ne": threat_id},
                "$or": [
                    {"linked_equipment_id": equipment_id} if equipment_id else {"_id": None},
                    {"asset": threat.get("asset")} if threat.get("asset") else {"_id": None}
                ]
            },
            {"_id": 0, "id": 1, "title": 1, "failure_mode": 1, "status": 1, "risk_score": 1, "created_at": 1}
        ).sort("created_at", -1).limit(10).to_list(10)
        equipment_history["observations"] = past_observations
        
        # Get actions related to this equipment
        past_actions = await db.central_actions.find(
            {
                "$or": [
                    {"linked_equipment_id": equipment_id} if equipment_id else {"_id": None},
                    {"equipment_name": threat.get("asset")} if threat.get("asset") else {"_id": None},
                    {"source_id": threat_id}
                ]
            },
            {"_id": 0, "id": 1, "title": 1, "status": 1, "priority": 1, "created_at": 1}
        ).sort("created_at", -1).limit(10).to_list(10)
        equipment_history["actions"] = past_actions
        
        # Get completed tasks for this equipment
        past_tasks = await db.task_instances.find(
            {
                "status": "completed",
                "$or": [
                    {"equipment_id": equipment_id} if equipment_id else {"_id": None},
                    {"linked_equipment_id": equipment_id} if equipment_id else {"_id": None}
                ]
            },
            {"_id": 0, "id": 1, "name": 1, "status": 1, "completed_at": 1}
        ).sort("completed_at", -1).limit(10).to_list(10)
        equipment_history["tasks"] = past_tasks
    
    # Get similar historical threats
    historical_threats = []
    if body and body.include_similar_incidents:
        similar = await db.threats.find(
            {
                "id": {"$ne": threat_id},
                "$or": [
                    {"equipment_type": threat.get("equipment_type")},
                    {"failure_mode": threat.get("failure_mode")}
                ]
            },
            {"_id": 0}
        ).limit(5).to_list(5)
        historical_threats = similar
    
    include_forecast = body.include_forecast if body else True
    
    result = await ai_engine.analyze_risk(
        threat=threat,
        equipment_data=equipment_data,
        historical_threats=historical_threats,
        equipment_history=equipment_history,
        include_forecast=include_forecast
    )
    
    # Log AI usage
    installation_name = threat.get("installation", threat.get("location", "default"))
    await log_ai_usage(
        user_id=current_user["id"],
        feature="risk_analysis",
        model="gpt-5.2",
        prompt_tokens=500,  # Estimated
        completion_tokens=1500,  # Estimated
        installation_name=installation_name,
        installation_id=threat.get("installation_id", "default"),
        success=True,
        metadata={"threat_id": threat_id, "include_forecast": include_forecast}
    )
    
    # Store the AI insights for the threat
    await db.ai_risk_insights.update_one(
        {"threat_id": threat_id},
        {"$set": {
            "threat_id": threat_id,
            "dynamic_risk": result.dynamic_risk.model_dump(),
            "forecasts": [f.model_dump() for f in result.forecasts],
            "key_insights": result.key_insights,
            "recommendations": result.recommendations,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user["id"]
        }},
        upsert=True
    )
    
    return result.model_dump()


@router.get("/ai/risk-insights/{threat_id}")
@limiter.limit(AI_RATE_LIMIT)
async def get_risk_insights(
    request: Request,
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get cached AI risk insights for a threat"""
    insight = await db.ai_risk_insights.find_one(
        {"threat_id": threat_id},
        {"_id": 0}
    )
    if not insight:
        raise HTTPException(status_code=404, detail="No AI insights available for this threat. Run analysis first.")
    return insight


@router.get("/ai/top-risks")
@limiter.limit(AI_RATE_LIMIT)
async def get_ai_top_risks(
    request: Request,
    limit: int = 5,
    current_user: dict = Depends(get_current_user)
):
    """Get AI-curated top risks based on dynamic scoring"""
    # Get threats with AI insights (no owner filter - installation-based)
    insights = await db.ai_risk_insights.find(
        {},
        {"_id": 0}
    ).sort("dynamic_risk.risk_score", -1).limit(limit).to_list(limit)
    
    # Enrich with threat data
    result = []
    for insight in insights:
        threat = await db.threats.find_one(
            {"id": insight["threat_id"]},
            {"_id": 0}
        )
        if threat:
            result.append({
                "threat": threat,
                "ai_insight": insight
            })
    
    # If not enough AI-analyzed threats, include top threats by regular score
    if len(result) < limit:
        analyzed_ids = [r["threat"]["id"] for r in result]
        additional = await db.threats.find(
            {
                "id": {"$nin": analyzed_ids},
                "status": {"$ne": "Closed"}
            },
            {"_id": 0}
        ).sort("risk_score", -1).limit(limit - len(result)).to_list(limit - len(result))
        
        for threat in additional:
            result.append({
                "threat": threat,
                "ai_insight": None
            })
    
    return {"top_risks": result}


@router.post("/ai/generate-causes/{threat_id}")
@limiter.limit(AI_RATE_LIMIT)
async def generate_threat_causes(
    request: Request,
    threat_id: str,
    body: GenerateCausesRequest = None,
    current_user: dict = Depends(get_current_user)
):
    """AI-powered causal analysis - generates probable causes"""
    threat = await db.threats.find_one(
        {"id": threat_id},
        {"_id": 0}
    )
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    equipment_data = None
    equipment_id = threat.get("linked_equipment_id")
    if threat.get("asset"):
        equipment_node = await db.equipment_nodes.find_one(
            {"name": threat["asset"]},
            {"_id": 0}
        )
        if equipment_node:
            equipment_data = equipment_node
            equipment_id = equipment_node.get("id")
    
    # Get equipment history for context
    equipment_history = {
        "observations": [],
        "actions": [],
        "tasks": []
    }
    
    if equipment_id or threat.get("asset"):
        # Get past observations for this equipment
        past_observations = await db.threats.find(
            {
                "id": {"$ne": threat_id},
                "$or": [
                    {"linked_equipment_id": equipment_id} if equipment_id else {"_id": None},
                    {"asset": threat.get("asset")} if threat.get("asset") else {"_id": None}
                ]
            },
            {"_id": 0, "id": 1, "title": 1, "failure_mode": 1, "cause": 1, "status": 1, "risk_score": 1, "created_at": 1}
        ).sort("created_at", -1).limit(5).to_list(5)
        equipment_history["observations"] = past_observations
        
        # Get completed actions
        past_actions = await db.central_actions.find(
            {
                "status": "completed",
                "$or": [
                    {"linked_equipment_id": equipment_id} if equipment_id else {"_id": None},
                    {"equipment_name": threat.get("asset")} if threat.get("asset") else {"_id": None}
                ]
            },
            {"_id": 0, "id": 1, "title": 1, "status": 1, "created_at": 1}
        ).sort("created_at", -1).limit(5).to_list(5)
        equipment_history["actions"] = past_actions
    
    max_causes = body.max_causes if body else 5
    
    result = await ai_engine.generate_causes(
        threat=threat,
        equipment_data=equipment_data,
        equipment_history=equipment_history,
        max_causes=max_causes
    )
    
    # Log AI usage for causal intelligence
    installation_name = threat.get("installation", threat.get("location", "default"))
    await log_ai_usage(
        user_id=current_user["id"],
        feature="causal_intelligence",
        model="gpt-5.2",
        prompt_tokens=600,
        completion_tokens=1200,
        installation_name=installation_name,
        installation_id=threat.get("installation_id", "default"),
        success=True,
        metadata={"threat_id": threat_id, "max_causes": max_causes}
    )
    
    # Store the causal analysis
    await db.ai_causal_analysis.update_one(
        {"threat_id": threat_id},
        {"$set": {
            "threat_id": threat_id,
            "summary": result.summary,
            "probable_causes": [c.model_dump() for c in result.probable_causes],
            "contributing_factors": result.contributing_factors,
            "confidence": result.confidence.value,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user["id"]
        }},
        upsert=True
    )
    
    return result.model_dump()


@router.get("/ai/causal-analysis/{threat_id}")
@limiter.limit(AI_RATE_LIMIT)
async def get_causal_analysis(
    request: Request,
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get cached causal analysis for a threat"""
    analysis = await db.ai_causal_analysis.find_one(
        {"threat_id": threat_id},
        {"_id": 0}
    )
    if not analysis:
        raise HTTPException(status_code=404, detail="No causal analysis available. Generate one first.")
    return analysis


@router.post("/ai/explain/{threat_id}")
@limiter.limit(AI_RATE_LIMIT)
async def explain_threat(
    request: Request,
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    """'Why is this happening?' - AI explains the threat with evidence"""
    threat = await db.threats.find_one(
        {"id": threat_id},
        {"_id": 0}
    )
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    # Check if we have cached causal analysis
    existing = await db.ai_causal_analysis.find_one(
        {"threat_id": threat_id},
        {"_id": 0}
    )
    
    if existing:
        return {
            "threat_id": threat_id,
            "summary": existing.get("summary", ""),
            "probable_causes": existing.get("probable_causes", []),
            "contributing_factors": existing.get("contributing_factors", []),
            "confidence": existing.get("confidence", "medium"),
            "cached": True
        }
    
    # Generate new analysis
    result = await ai_engine.generate_causes(threat=threat, max_causes=5)
    
    # Store it
    await db.ai_causal_analysis.update_one(
        {"threat_id": threat_id},
        {"$set": {
            "threat_id": threat_id,
            "summary": result.summary,
            "probable_causes": [c.model_dump() for c in result.probable_causes],
            "contributing_factors": result.contributing_factors,
            "confidence": result.confidence.value,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user["id"]
        }},
        upsert=True
    )
    
    return {
        "threat_id": threat_id,
        "summary": result.summary,
        "probable_causes": [c.model_dump() for c in result.probable_causes],
        "contributing_factors": result.contributing_factors,
        "confidence": result.confidence.value,
        "cached": False
    }


@router.post("/ai/fault-tree/{threat_id}")
@limiter.limit(AI_HEAVY_RATE_LIMIT)
async def generate_fault_tree(
    request: Request,
    threat_id: str,
    body: GenerateFaultTreeRequest = None,
    current_user: dict = Depends(get_current_user)
):
    """Generate a fault tree diagram for the threat"""
    threat = await db.threats.find_one(
        {"id": threat_id},
        {"_id": 0}
    )
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    max_depth = body.max_depth if body else 4
    
    result = await ai_engine.generate_fault_tree(
        threat=threat,
        max_depth=max_depth
    )
    
    # Store the fault tree
    await db.ai_fault_trees.update_one(
        {"threat_id": threat_id},
        {"$set": {
            "threat_id": threat_id,
            "top_event": result.top_event,
            "root": result.root.model_dump(),
            "total_nodes": result.total_nodes,
            "generated_at": result.generated_at,
            "created_by": current_user["id"]
        }},
        upsert=True
    )
    
    return result.model_dump()


@router.get("/ai/fault-tree/{threat_id}")
@limiter.limit(AI_RATE_LIMIT)
async def get_fault_tree(
    request: Request,
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get cached fault tree for a threat"""
    tree = await db.ai_fault_trees.find_one(
        {"threat_id": threat_id},
        {"_id": 0}
    )
    if not tree:
        raise HTTPException(status_code=404, detail="No fault tree available. Generate one first.")
    return tree


@router.post("/ai/bow-tie/{threat_id}")
@limiter.limit(AI_HEAVY_RATE_LIMIT)
async def generate_bow_tie(
    request: Request,
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Generate a bow-tie risk model for the threat"""
    threat = await db.threats.find_one(
        {"id": threat_id},
        {"_id": 0}
    )
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    result = await ai_engine.generate_bow_tie(threat=threat)
    
    # Store the bow-tie model
    await db.ai_bow_ties.update_one(
        {"threat_id": threat_id},
        {"$set": {
            "threat_id": threat_id,
            "hazard": result.hazard,
            "top_event": result.top_event,
            "causes": result.causes,
            "consequences": result.consequences,
            "preventive_barriers": [b.model_dump() for b in result.preventive_barriers],
            "mitigative_barriers": [b.model_dump() for b in result.mitigative_barriers],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user["id"]
        }},
        upsert=True
    )
    
    return result.model_dump()


@router.get("/ai/bow-tie/{threat_id}")
@limiter.limit(AI_RATE_LIMIT)
async def get_bow_tie(
    request: Request,
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get cached bow-tie model for a threat"""
    bow_tie = await db.ai_bow_ties.find_one(
        {"threat_id": threat_id},
        {"_id": 0}
    )
    if not bow_tie:
        raise HTTPException(status_code=404, detail="No bow-tie model available. Generate one first.")
    return bow_tie


@router.post("/ai/optimize-actions/{threat_id}")
@limiter.limit(AI_RATE_LIMIT)
async def optimize_threat_actions(
    request: Request,
    threat_id: str,
    body: OptimizeActionsRequest = None,
    current_user: dict = Depends(get_current_user)
):
    """AI-powered action optimization with ROI analysis"""
    threat = await db.threats.find_one(
        {"id": threat_id},
        {"_id": 0}
    )
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    # Get existing causal analysis if available
    causes = None
    causal_analysis = await db.ai_causal_analysis.find_one(
        {"threat_id": threat_id},
        {"_id": 0}
    )
    if causal_analysis:
        from ai_risk_models import ProbableCause, CauseProbability
        causes = [
            ProbableCause(
                id=c.get("id", ""),
                description=c.get("description", ""),
                category=c.get("category", "technical_cause"),
                probability=c.get("probability", 50.0),
                probability_level=CauseProbability(c.get("probability_level", "possible")),
                evidence=c.get("evidence", []),
                supporting_data=c.get("supporting_data", []),
                mitigation_actions=c.get("mitigation_actions", [])
            )
            for c in causal_analysis.get("probable_causes", [])
        ]
    
    budget_limit = body.budget_limit if body else None
    prioritize_by = body.prioritize_by if body else "roi"
    
    result = await ai_engine.optimize_actions(
        threat=threat,
        causes=causes,
        budget_limit=budget_limit,
        prioritize_by=prioritize_by
    )
    
    # Store the optimization result
    await db.ai_action_optimization.update_one(
        {"threat_id": threat_id},
        {"$set": {
            "threat_id": threat_id,
            "recommended_actions": [a.model_dump() for a in result.recommended_actions],
            "total_potential_risk_reduction": result.total_potential_risk_reduction,
            "optimal_action_sequence": result.optimal_action_sequence,
            "analysis_summary": result.analysis_summary,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user["id"]
        }},
        upsert=True
    )
    
    return result.model_dump()


@router.get("/ai/action-optimization/{threat_id}")
@limiter.limit(AI_RATE_LIMIT)
async def get_action_optimization(
    request: Request,
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get cached action optimization for a threat"""
    optimization = await db.ai_action_optimization.find_one(
        {"threat_id": threat_id},
        {"_id": 0}
    )
    if not optimization:
        raise HTTPException(status_code=404, detail="No action optimization available. Generate one first.")
    return optimization


# ============= MAINTENANCE STRATEGY ENDPOINTS =============

