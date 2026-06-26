"""AI Risk Engine — threat analysis, causal intelligence, and action optimization."""
import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from fastapi.responses import JSONResponse

from ai_risk_engine import AIRiskEngine
from ai_risk_models import (
    AnalyzeRiskRequest,
    GenerateCausesRequest,
    GenerateFaultTreeRequest,
    OptimizeActionsRequest,
)
from services.ai_gateway import chat, user_context
from services.ai_risk_dashboard import check_injection_attempt, log_ai_usage
from services.ai_risk_queries import (
    find_actions,
    find_ai_doc,
    find_equipment_by_name,
    find_tasks,
    find_threat,
    find_threats,
    list_ai_insights_cursor,
    update_threat,
    upsert_ai_doc,
)
from utils.workspace_localization import localize_ai_insights, localize_causal_analysis

logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
ai_engine = AIRiskEngine(api_key=OPENAI_API_KEY)


async def chat_analyze(
    actor: dict,
    data: dict,
):
    """
    Simple chat-based AI analysis endpoint.
    Accepts a message and returns AI-generated analysis.
    """
    message = data.get("message", data.get("input", ""))
    if not message:
        return {
            "success": False,
            "error": "No message provided",
            "message": "Please provide a message to analyze",
        }

    check_injection_attempt({"message": message}, endpoint="/ai/chat-analyze")

    try:
        uid, cid = user_context(actor)
        ai_response = await chat(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a helpful AI assistant for industrial asset management "
                        "and reliability engineering. Provide concise, actionable insights."
                    ),
                },
                {"role": "user", "content": message},
            ],
            model="gpt-4o",
            temperature=0.7,
            max_tokens=1000,
            user_id=uid,
            company_id=cid,
            endpoint="ai_routes.chat_analyze",
        )

        return {
            "success": True,
            "message": "Chat analyze working",
            "input": message,
            "response": ai_response,
            "model": "gpt-4o",
        }

    except Exception as e:
        logger.error(f"Chat analyze error: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "message": "AI analysis failed",
        }


async def analyze_threat_risk(
    actor: dict,
    threat_id: str,
    body: AnalyzeRiskRequest = None,
):
    """AI-powered dynamic risk analysis for a threat"""
    threat = await find_threat(actor, threat_id)
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")

    equipment_data = None
    equipment_id = threat.get("linked_equipment_id")
    if threat.get("asset"):
        equipment_node = await find_equipment_by_name(actor, threat["asset"])
        if equipment_node:
            equipment_data = equipment_node
            equipment_id = equipment_node.get("id")

    equipment_history = {
        "observations": [],
        "actions": [],
        "tasks": [],
    }

    if equipment_id or threat.get("asset"):
        past_observations = await find_threats(
            actor,
            {
                "id": {"$ne": threat_id},
                "$or": [
                    {"linked_equipment_id": equipment_id} if equipment_id else {"_id": None},
                    {"asset": threat.get("asset")} if threat.get("asset") else {"_id": None},
                ],
            },
            {"_id": 0, "id": 1, "title": 1, "failure_mode": 1, "status": 1, "risk_score": 1,
             "created_at": 1, "user_context": 1, "cause": 1, "impact": 1, "image_url": 1, "attachments": 1},
        ).sort("created_at", -1).limit(10).to_list(10)
        equipment_history["observations"] = past_observations

        past_actions = await find_actions(
            actor,
            {
                "$or": [
                    {"linked_equipment_id": equipment_id} if equipment_id else {"_id": None},
                    {"equipment_name": threat.get("asset")} if threat.get("asset") else {"_id": None},
                    {"source_id": threat_id},
                ],
            },
            {"_id": 0, "id": 1, "title": 1, "status": 1, "priority": 1, "created_at": 1,
             "description": 1, "action_type": 1, "discipline": 1, "completed_at": 1},
        ).sort("created_at", -1).limit(10).to_list(10)
        equipment_history["actions"] = past_actions

        past_tasks = await find_tasks(
            actor,
            {
                "status": "completed",
                "$or": [
                    {"equipment_id": equipment_id} if equipment_id else {"_id": None},
                    {"linked_equipment_id": equipment_id} if equipment_id else {"_id": None},
                ],
            },
            {"_id": 0, "id": 1, "name": 1, "status": 1, "completed_at": 1,
             "notes": 1, "completion_notes": 1, "task_type": 1},
        ).sort("completed_at", -1).limit(10).to_list(10)
        equipment_history["tasks"] = past_tasks

    historical_threats = []
    if body and body.include_similar_incidents:
        similar = await find_threats(
            actor,
            {
                "id": {"$ne": threat_id},
                "$or": [
                    {"equipment_type": threat.get("equipment_type")},
                    {"failure_mode": threat.get("failure_mode")},
                ],
            },
            {"_id": 0},
        ).limit(5).to_list(5)
        historical_threats = similar

    include_forecast = body.include_forecast if body else True

    result = await ai_engine.analyze_risk(
        threat=threat,
        equipment_data=equipment_data,
        historical_threats=historical_threats,
        equipment_history=equipment_history,
        include_forecast=include_forecast,
    )

    installation_name = threat.get("installation", threat.get("location", "default"))
    await log_ai_usage(
        user_id=actor["id"],
        feature="risk_analysis",
        model="gpt-4o",
        prompt_tokens=500,
        completion_tokens=1500,
        installation_name=installation_name,
        installation_id=threat.get("installation_id", "default"),
        success=True,
        metadata={"threat_id": threat_id, "include_forecast": include_forecast},
    )

    updated_at = datetime.now(timezone.utc).isoformat()

    await upsert_ai_doc(
        actor,
        "ai_risk_insights",
        threat_id,
        {
            "dynamic_risk": result.dynamic_risk.model_dump(),
            "forecasts": [f.model_dump() for f in result.forecasts],
            "key_insights": result.key_insights,
            "recommendations": result.recommendations,
            "updated_at": updated_at,
            "created_by": actor["id"],
        },
    )

    try:
        await update_threat(
            actor,
            threat_id,
            {
                "ai_risk_insights_updated_at": updated_at,
                "ai_risk_insights_created_by": actor["id"],
                "ai_risk_summary": {
                    "risk_score": result.dynamic_risk.risk_score,
                    "risk_level": getattr(result.dynamic_risk, "risk_level", None),
                },
            },
        )
    except Exception as e:
        logger.warning(f"Failed linking ai_risk_insights onto threat {threat_id}: {e}")

    return result.model_dump()


async def get_risk_insights(
    actor: dict,
    threat_id: str,
    language: Optional[str] = None,
):
    """Get cached AI risk insights for a threat"""
    insight = await find_ai_doc(actor, "ai_risk_insights", threat_id)
    if not insight:
        return None

    try:
        updated_at = insight.get("updated_at") or datetime.now(timezone.utc).isoformat()
        dyn = insight.get("dynamic_risk") or {}
        await update_threat(
            actor,
            threat_id,
            {
                "ai_risk_insights_updated_at": updated_at,
                "ai_risk_insights_created_by": insight.get("created_by"),
                "ai_risk_summary": {
                    "risk_score": dyn.get("risk_score"),
                    "risk_level": dyn.get("risk_level"),
                },
            },
        )
    except Exception as e:
        logger.warning(f"Failed backfilling ai_risk_insights onto threat {threat_id}: {e}")

    return await localize_ai_insights(
        insight,
        language,
        user_id=actor.get("id"),
    )


async def get_ai_top_risks(
    actor: dict,
    limit: int = 5,
):
    """Get AI-curated top risks based on dynamic scoring"""
    insights = await list_ai_insights_cursor(actor, limit).to_list(limit)

    result = []
    for insight in insights:
        threat = await find_threat(actor, insight["threat_id"])
        if threat:
            result.append({
                "threat": threat,
                "ai_insight": insight,
            })

    if len(result) < limit:
        analyzed_ids = [r["threat"]["id"] for r in result]
        additional = await find_threats(
            actor,
            {
                "id": {"$nin": analyzed_ids},
                "status": {"$ne": "Closed"},
            },
            {"_id": 0},
        ).sort("risk_score", -1).limit(limit - len(result)).to_list(limit - len(result))

        for threat in additional:
            result.append({
                "threat": threat,
                "ai_insight": None,
            })

    return {"top_risks": result}


async def generate_threat_causes(
    actor: dict,
    threat_id: str,
    language: Optional[str] = None,
    body: GenerateCausesRequest = None,
):
    """AI-powered causal analysis - generates probable causes"""
    try:
        existing = await find_ai_doc(actor, "ai_causal_analysis", threat_id)
        if existing and isinstance(existing, dict) and existing.get("probable_causes"):
            existing["cached"] = True
            return await localize_causal_analysis(
                existing,
                language,
                user_id=actor.get("id"),
            )
    except Exception:
        pass

    threat = await find_threat(actor, threat_id)
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")

    equipment_data = None
    equipment_id = threat.get("linked_equipment_id")
    if threat.get("asset"):
        equipment_node = await find_equipment_by_name(actor, threat["asset"])
        if equipment_node:
            equipment_data = equipment_node
            equipment_id = equipment_node.get("id")

    equipment_history = {
        "observations": [],
        "actions": [],
        "tasks": [],
    }

    if equipment_id or threat.get("asset"):
        past_observations = await find_threats(
            actor,
            {
                "id": {"$ne": threat_id},
                "$or": [
                    {"linked_equipment_id": equipment_id} if equipment_id else {"_id": None},
                    {"asset": threat.get("asset")} if threat.get("asset") else {"_id": None},
                ],
            },
            {"_id": 0, "id": 1, "title": 1, "failure_mode": 1, "cause": 1, "status": 1, "risk_score": 1, "created_at": 1},
        ).sort("created_at", -1).limit(5).to_list(5)
        equipment_history["observations"] = past_observations

        past_actions = await find_actions(
            actor,
            {
                "status": "completed",
                "$or": [
                    {"linked_equipment_id": equipment_id} if equipment_id else {"_id": None},
                    {"equipment_name": threat.get("asset")} if threat.get("asset") else {"_id": None},
                ],
            },
            {"_id": 0, "id": 1, "title": 1, "status": 1, "created_at": 1},
        ).sort("created_at", -1).limit(5).to_list(5)
        equipment_history["actions"] = past_actions

    max_causes = body.max_causes if body else 5

    async def _compute_and_store():
        result = await ai_engine.generate_causes(
            threat=threat,
            equipment_data=equipment_data,
            equipment_history=equipment_history,
            max_causes=max_causes,
        )

        installation_name = threat.get("installation", threat.get("location", "default"))
        await log_ai_usage(
            user_id=actor["id"],
            feature="causal_intelligence",
            model="gpt-4o",
            prompt_tokens=600,
            completion_tokens=1200,
            installation_name=installation_name,
            installation_id=threat.get("installation_id", "default"),
            success=True,
            metadata={"threat_id": threat_id, "max_causes": max_causes},
        )

        await upsert_ai_doc(
            actor,
            "ai_causal_analysis",
            threat_id,
            {
                "summary": result.summary,
                "probable_causes": [c.model_dump() for c in result.probable_causes],
                "contributing_factors": result.contributing_factors,
                "confidence": result.confidence.value,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "created_by": actor["id"],
            },
        )
        return result

    try:
        asyncio.create_task(_compute_and_store())
    except Exception as e:
        logger.error(f"Failed to schedule causal generation: {e}")
        raise HTTPException(status_code=500, detail="Failed to start causal analysis")

    return JSONResponse(
        status_code=202,
        content={"status": "pending", "threat_id": threat_id},
    )


async def get_causal_analysis(
    actor: dict,
    threat_id: str,
    language: Optional[str] = None,
):
    """Get cached causal analysis for a threat"""
    analysis = await find_ai_doc(actor, "ai_causal_analysis", threat_id)
    if not analysis:
        return None

    return await localize_causal_analysis(
        analysis,
        language,
        user_id=actor.get("id"),
    )


async def explain_threat(
    actor: dict,
    threat_id: str,
):
    """'Why is this happening?' - AI explains the threat with evidence"""
    threat = await find_threat(actor, threat_id)
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")

    existing = await find_ai_doc(actor, "ai_causal_analysis", threat_id)

    if existing:
        return {
            "threat_id": threat_id,
            "summary": existing.get("summary", ""),
            "probable_causes": existing.get("probable_causes", []),
            "contributing_factors": existing.get("contributing_factors", []),
            "confidence": existing.get("confidence", "medium"),
            "cached": True,
        }

    result = await ai_engine.generate_causes(threat=threat, max_causes=5)

    await upsert_ai_doc(
        actor,
        "ai_causal_analysis",
        threat_id,
        {
            "summary": result.summary,
            "probable_causes": [c.model_dump() for c in result.probable_causes],
            "contributing_factors": result.contributing_factors,
            "confidence": result.confidence.value,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "created_by": actor["id"],
        },
    )

    return {
        "threat_id": threat_id,
        "summary": result.summary,
        "probable_causes": [c.model_dump() for c in result.probable_causes],
        "contributing_factors": result.contributing_factors,
        "confidence": result.confidence.value,
        "cached": False,
    }


async def generate_fault_tree(
    actor: dict,
    threat_id: str,
    body: GenerateFaultTreeRequest = None,
):
    """Generate a fault tree diagram for the threat"""
    threat = await find_threat(actor, threat_id)
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")

    max_depth = body.max_depth if body else 4

    result = await ai_engine.generate_fault_tree(
        threat=threat,
        max_depth=max_depth,
    )

    await upsert_ai_doc(
        actor,
        "ai_fault_trees",
        threat_id,
        {
            "top_event": result.top_event,
            "root": result.root.model_dump(),
            "total_nodes": result.total_nodes,
            "generated_at": result.generated_at,
            "created_by": actor["id"],
        },
    )

    return result.model_dump()


async def get_fault_tree(
    actor: dict,
    threat_id: str,
):
    """Get cached fault tree for a threat"""
    tree = await find_ai_doc(actor, "ai_fault_trees", threat_id)
    if not tree:
        raise HTTPException(status_code=404, detail="No fault tree available. Generate one first.")
    return tree


async def generate_bow_tie(
    actor: dict,
    threat_id: str,
):
    """Generate a bow-tie risk model for the threat"""
    threat = await find_threat(actor, threat_id)
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")

    result = await ai_engine.generate_bow_tie(threat=threat)

    await upsert_ai_doc(
        actor,
        "ai_bow_ties",
        threat_id,
        {
            "hazard": result.hazard,
            "top_event": result.top_event,
            "causes": result.causes,
            "consequences": result.consequences,
            "preventive_barriers": [b.model_dump() for b in result.preventive_barriers],
            "mitigative_barriers": [b.model_dump() for b in result.mitigative_barriers],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "created_by": actor["id"],
        },
    )

    return result.model_dump()


async def get_bow_tie(
    actor: dict,
    threat_id: str,
):
    """Get cached bow-tie model for a threat"""
    bow_tie = await find_ai_doc(actor, "ai_bow_ties", threat_id)
    if not bow_tie:
        raise HTTPException(status_code=404, detail="No bow-tie model available. Generate one first.")
    return bow_tie


async def optimize_threat_actions(
    actor: dict,
    threat_id: str,
    body: OptimizeActionsRequest = None,
):
    """AI-powered action optimization with ROI analysis"""
    threat = await find_threat(actor, threat_id)
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")

    causes = None
    causal_analysis = await find_ai_doc(actor, "ai_causal_analysis", threat_id)
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
                mitigation_actions=c.get("mitigation_actions", []),
            )
            for c in causal_analysis.get("probable_causes", [])
        ]

    budget_limit = body.budget_limit if body else None
    prioritize_by = body.prioritize_by if body else "roi"

    result = await ai_engine.optimize_actions(
        threat=threat,
        causes=causes,
        budget_limit=budget_limit,
        prioritize_by=prioritize_by,
    )

    await upsert_ai_doc(
        actor,
        "ai_action_optimization",
        threat_id,
        {
            "recommended_actions": [a.model_dump() for a in result.recommended_actions],
            "total_potential_risk_reduction": result.total_potential_risk_reduction,
            "optimal_action_sequence": result.optimal_action_sequence,
            "analysis_summary": result.analysis_summary,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "created_by": actor["id"],
        },
    )

    return result.model_dump()


async def get_action_optimization(
    actor: dict,
    threat_id: str,
):
    """Get cached action optimization for a threat"""
    optimization = await find_ai_doc(actor, "ai_action_optimization", threat_id)
    if not optimization:
        raise HTTPException(status_code=404, detail="No action optimization available. Generate one first.")
    return optimization
