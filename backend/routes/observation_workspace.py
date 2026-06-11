"""
Observation Workspace API - Reliability Intelligence Workspace
Provides comprehensive data for the redesigned observation detail page
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
import uuid
import logging
import asyncio
import re
import time

from database import db
from auth import get_current_user
from services.action_number_service import allocate_central_action_number
from utils.auto_translate import translate_action
from utils.workspace_localization import localize_workspace_payload

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/observation-workspace", tags=["Observation Workspace"])

# In-memory cache for per-user production loss config (avoids extra DB round-trip per load).
_prod_loss_config_cache: Dict[str, tuple] = {}
_PROD_LOSS_CACHE_TTL_SEC = 300

_OBSERVATION_PAYLOAD_EXCLUDE = frozenset({"_id", "recommended_actions"})


def _build_observation_payload(observation: dict, equipment_node: Optional[dict] = None) -> dict:
    """Full observation fields for workspace + details section (single source, no second GET)."""
    payload = {k: v for k, v in observation.items() if k not in _OBSERVATION_PAYLOAD_EXCLUDE}
    if equipment_node:
        tag = equipment_node.get("tag") or equipment_node.get("tag_number")
        if tag:
            payload["equipment_tag"] = tag
    return payload


async def _resolve_installation_id(equipment_node: Optional[dict]) -> Optional[str]:
    """Find installation id without walking more than necessary."""
    if not equipment_node:
        return None
    if equipment_node.get("level") == "installation":
        return equipment_node.get("id")
    if equipment_node.get("installation_id"):
        return equipment_node.get("installation_id")

    parent_id = equipment_node.get("parent_id")
    for _ in range(15):
        if not parent_id:
            break
        node = await db.equipment_nodes.find_one(
            {"id": parent_id},
            {"_id": 0, "id": 1, "level": 1, "parent_id": 1, "installation_id": 1},
        )
        if not node:
            break
        if node.get("level") == "installation":
            return node.get("id")
        if node.get("installation_id"):
            return node.get("installation_id")
        parent_id = node.get("parent_id")
    return None


async def _get_production_loss_config(user_id: str) -> dict:
    now = time.monotonic()
    cached = _prod_loss_config_cache.get(user_id)
    if cached and cached[1] > now:
        return cached[0]
    doc = await db.production_loss_config.find_one({"created_by": user_id}, {"_id": 0}) or {}
    _prod_loss_config_cache[user_id] = (doc, now + _PROD_LOSS_CACHE_TTL_SEC)
    return doc


# Permission dependency
def _workspace_read():
    return Depends(get_current_user)


# ============================================================================
# MODELS
# ============================================================================

class ExposureData(BaseModel):
    """Risk & Exposure data for an observation"""
    production_exposure: Dict[str, Any]
    safety_exposure: Dict[str, Any]
    environmental_exposure: Dict[str, Any]
    alarp_progress: Dict[str, Any]
    risk_summary: Dict[str, Any]


class TimelineEvent(BaseModel):
    """A single event in the equipment reliability timeline"""
    id: str
    date: str
    event_type: str  # observation, failure, work_order, inspection, repair, strategy_change, investigation
    title: str
    reference_id: Optional[str] = None
    status: Optional[str] = None
    severity: Optional[str] = None
    description: Optional[str] = None


class ReliabilityIntelligence(BaseModel):
    """AI-driven reliability analysis"""
    most_likely_cause: Dict[str, Any]
    supporting_evidence: Dict[str, Any]
    contributing_factors: List[Dict[str, Any]]
    ai_confidence: float


class RecommendedAction(BaseModel):
    """A recommended action from library or AI"""
    id: str
    action_type: str  # PM, CM, PDM, OP
    title: str
    source: str  # failure_mode_library, ai_generated
    expected_impact: Optional[str] = None
    confidence: Optional[float] = None
    why_recommended: Optional[str] = None
    failure_mode_id: Optional[str] = None


class ActionPlanItem(BaseModel):
    """An action in the mitigation action plan"""
    id: str
    action_number: str
    title: str
    status: str  # open, planned, in_progress, completed, validated
    priority: str
    owner: Optional[str] = None
    due_date: Optional[str] = None


class ProcessStage(BaseModel):
    """A stage in the process journey"""
    stage: str
    status: str  # completed, in_progress, not_started
    date: Optional[str] = None
    owner: Optional[str] = None


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

async def calculate_production_exposure(observation: dict, criticality: dict, user_id: str) -> dict:
    """Calculate production exposure based on criticality, observation data, and user's production loss config"""
    production_impact = (criticality or {}).get("production_impact") or 0
    if not production_impact:  # None or 0 → not rated on the 1-5 scale
        return {"not_assessed": True, "production_impact_score": None, "formatted_value": "Not Assessed"}
    
    # Fetch user's production loss configuration
    prod_loss_config = await _get_production_loss_config(user_id)
    
    # Use config values or defaults
    hourly_cost = (prod_loss_config or {}).get("hourly_cost", 500.0)
    currency = (prod_loss_config or {}).get("currency", "EUR")
    
    # Currency symbols
    currency_symbols = {
        "EUR": "€",
        "USD": "$",
        "GBP": "£",
        "CHF": "CHF ",
        "NOK": "kr ",
        "SEK": "kr ",
        "DKK": "kr "
    }
    currency_symbol = currency_symbols.get(currency, currency + " ")
    
    # Downtime ranges based on production criticality level (1-5 scale).
    # Aligned with the default Production Criticality definitions:
    #   1 — Minimal:  No production impact / redundancy available
    #   2 — Low:      Downtime < 8 hours
    #   3 — Medium:   Downtime 8 – 24 hours
    #   4 — High:     Downtime > 24 hours (capped at 72 for the range upper bound)
    #   5 — Critical: Complete plant shutdown (> 72 hours, open-ended)
    # Returns (min_hours, max_hours). max_hours = None means "open-ended" (>min_hours).
    downtime_ranges = {
        1: (0, 0),
        2: (0, 8),
        3: (8, 24),
        4: (24, 72),
        5: (72, None),  # open-ended
    }
    min_hours, max_hours = downtime_ranges.get(production_impact, (8, 24))
    
    # Maximum exposure value:
    #   - Closed range (max_hours set): max_hours × hourly_cost  → "Up to €X"
    #   - Open-ended (max_hours = None): min_hours × hourly_cost → "More than €X"
    open_ended = max_hours is None
    hours_for_value = max_hours if not open_ended else min_hours
    max_exposure_value = hours_for_value * hourly_cost
    
    # Build the human-readable downtime label
    if open_ended:
        downtime_label = f"> {min_hours}"
    elif min_hours == 0 and max_hours == 0:
        downtime_label = "0"
    elif min_hours == 0:
        downtime_label = f"< {max_hours}"
    else:
        downtime_label = f"{min_hours} - {max_hours}"
    
    formatted_value = (
        f"More than {currency_symbol}{max_exposure_value:,.0f}"
        if open_ended
        else f"Up to {currency_symbol}{max_exposure_value:,.0f}"
    )
    
    return {
        "value": max_exposure_value,
        "formatted_value": formatted_value,
        "min_downtime_hours": min_hours,
        "max_downtime_hours": max_hours,
        "downtime_range": downtime_label,
        "open_ended": open_ended,
        "hourly_cost": hourly_cost,
        "currency": currency,
        "production_impact_score": production_impact
    }


def calculate_safety_exposure(observation: dict, criticality: dict) -> dict:
    """Calculate safety exposure based on criticality"""
    safety_impact = (criticality or {}).get("safety_impact") or 0
    if not safety_impact:
        return {"not_assessed": True, "safety_impact_score": None, "severity": "Not Assessed"}
    
    # Map safety impact to personnel exposure
    personnel_mapping = {
        1: 0,
        2: 1,
        3: 2,
        4: 5,
        5: 10
    }
    
    severity_mapping = {
        1: "Negligible",
        2: "Low",
        3: "Medium",
        4: "High",
        5: "Critical"
    }
    
    return {
        "personnel_exposed": personnel_mapping.get(safety_impact, 0),
        "severity": severity_mapping.get(safety_impact, "Low"),
        "safety_impact_score": safety_impact
    }


def calculate_environmental_exposure(observation: dict, criticality: dict) -> dict:
    """Calculate environmental exposure"""
    env_impact = (criticality or {}).get("environmental_impact") or 0
    if not env_impact:
        return {"not_assessed": True, "environmental_impact_score": None, "impact_rating": "Not Assessed"}
    
    impact_mapping = {
        1: "Negligible",
        2: "Low",
        3: "Medium",
        4: "High",
        5: "Critical"
    }
    
    return {
        "impact_rating": impact_mapping.get(env_impact, "Low"),
        "environmental_impact_score": env_impact
    }


def calculate_reputation_exposure(observation: dict, criticality: dict) -> dict:
    """Calculate reputation exposure based on criticality.reputation_impact (1-5)."""
    rep_impact = (criticality or {}).get("reputation_impact") or 0
    if not rep_impact:
        return {"not_assessed": True, "reputation_impact_score": None, "impact_rating": "Not Assessed"}
    impact_mapping = {
        1: "Negligible",
        2: "Low",
        3: "Medium",
        4: "High",
        5: "Critical",
    }
    return {
        "impact_rating": impact_mapping.get(rep_impact, "Low"),
        "reputation_impact_score": rep_impact,
    }


async def get_criticality_definitions_for_equipment(equipment_node: dict, user_id: str) -> List[dict]:
    """
    Resolve the criticality definitions that apply to an equipment node.

    Walks the equipment hierarchy up to the installation (level == 'installation')
    and returns the user's custom criticality definitions saved for that installation
    if any exist. Falls back to the built-in DEFAULT_CRITICALITY otherwise.
    """
    from routes.definitions import DEFAULT_CRITICALITY

    if not equipment_node:
        return DEFAULT_CRITICALITY

    installation_id = await _resolve_installation_id(equipment_node)
    if not installation_id:
        return DEFAULT_CRITICALITY

    custom = await db.definitions.find_one(
        {"equipment_id": installation_id, "created_by": user_id},
        {"_id": 0, "criticality": 1},
    )
    if not custom:
        custom = await db.definitions.find_one(
            {"equipment_id": installation_id},
            {"_id": 0, "criticality": 1},
        )

    if custom and custom.get("criticality"):
        return custom["criticality"]
    return DEFAULT_CRITICALITY


async def calculate_alarp_progress(observation: dict, actions: list, investigation: dict = None) -> dict:
    """
    Stage-based mitigation progress aligned with the Process Journey:
        Observation reached               → 10%
        Assessment (FM + Eq + risk)       → +10%
        Planning (≥1 action on plan)      → +10%
        Investigation                     → 0% (optional, no contribution)
        Action — per completed action     → +40% × (completed / total)
        Mitigated (all actions complete)  → 90%
        Learning implemented              → 100%
    """
    progress = 10  # Observation stage reached (the observation exists)

    observation = observation or {}

    # Assessment (+10) — requires failure mode + equipment + risk score
    has_fm = bool(observation.get("failure_mode") or observation.get("failure_mode_id"))
    has_eq = bool(observation.get("linked_equipment_id"))
    has_risk = (observation.get("risk_score") or 0) > 0
    assessment_done = has_fm and has_eq and has_risk
    if assessment_done:
        progress += 10

    # Planning (+10) — at least one action exists on the plan
    total_actions = len(actions) if actions else 0
    planning_done = total_actions > 0
    if planning_done:
        progress += 10

    # Investigation contributes 0% intentionally (optional stage).

    # Action contribution: up to 40% pro-rated by completion ratio.
    completed_count = sum(
        1 for a in (actions or []) if a.get("status") in ("completed", "validated")
    )
    action_pct = 0
    if total_actions > 0:
        if completed_count == total_actions:
            # Mitigated stage reached — promote to 90% regardless of running total.
            progress = 90
        else:
            action_pct = round(40 * completed_count / total_actions)
            progress += action_pct

    # Learning implemented → 100%
    learning_done = any(
        (a.get("action_type") or "").lower() in ("learning", "learn")
        and a.get("status") in ("completed", "validated")
        for a in (actions or [])
    )
    if learning_done:
        progress = 100

    progress = min(progress, 100)

    # Status label reflects the furthest journey stage reached rather than an
    # arbitrary percentage bucket — easier for the user to read at a glance.
    if learning_done:
        status = "Learning Complete"
    elif total_actions > 0 and completed_count == total_actions:
        status = "Mitigated"
    elif total_actions > 0 and completed_count > 0:
        status = "In Action"
    elif planning_done:
        status = "In Planning"
    elif assessment_done:
        status = "In Assessment"
    else:
        status = "Observation"

    return {
        "percentage": progress,
        "status": status,
        "components": {
            "observation": 10,
            "assessment": 10 if assessment_done else 0,
            "planning": 10 if planning_done else 0,
            "investigation": 0,
            "actions": action_pct,
            "learning": 100 if learning_done else 0,
        },
    }


async def get_equipment_timeline_events(
    equipment_id: str = None,
    asset_name: str = None,
    current_observation_id: str = None,
    limit: int = 20
) -> List[dict]:
    """
    Get historical events for equipment:
    - Observations
    - Failures (closed/mitigated observations)
    - Work orders (from actions)
    - Inspections (from scheduled tasks)
    - Investigations
    """
    events = []
    
    # Build query for equipment matching
    eq_conditions = []
    if equipment_id:
        eq_conditions.append({"linked_equipment_id": equipment_id})
    if asset_name:
        eq_conditions.append({"asset": asset_name})
    
    if not eq_conditions:
        return events
    
    # 1. Get observations (including failures - closed observations)
    observations = await db.threats.find(
        {"$or": eq_conditions},
        {"_id": 0, "id": 1, "title": 1, "created_at": 1, "status": 1, 
         "risk_level": 1, "failure_mode": 1, "threat_number": 1}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    for obs in observations:
        is_current = obs.get("id") == current_observation_id
        status = obs.get("status", "open").lower()
        
        # Classify as failure if closed/mitigated
        event_type = "failure" if status in ["closed", "mitigated"] else "observation"
        if is_current:
            event_type = "observation"  # Current one is always observation
        
        events.append({
            "id": obs.get("id"),
            "date": obs.get("created_at", ""),
            "event_type": event_type,
            "title": obs.get("title", "Observation"),
            "reference_id": obs.get("threat_number", ""),
            "status": status,
            "severity": obs.get("risk_level", ""),
            "is_current": is_current
        })
    
    # 2. Get actions (work orders)
    action_conditions = []
    if equipment_id:
        action_conditions.append({"linked_equipment_id": equipment_id})
    if asset_name:
        action_conditions.append({"equipment_name": asset_name})
    
    # Also get actions linked to observations on this equipment
    obs_ids = [o.get("id") for o in observations if o.get("id")]
    if obs_ids:
        action_conditions.append({"source_id": {"$in": obs_ids}})
        action_conditions.append({"observation_id": {"$in": obs_ids}})
    
    if action_conditions:
        actions_task = db.central_actions.find(
            {"$or": action_conditions},
            {"_id": 0, "id": 1, "title": 1, "created_at": 1, "status": 1,
             "action_number": 1, "action_type": 1}
        ).sort("created_at", -1).limit(limit).to_list(limit)
    else:
        async def _empty_actions():
            return []
        actions_task = _empty_actions()

    inv_conditions = []
    if asset_name:
        inv_conditions.append({"asset_name": asset_name})
    if obs_ids:
        inv_conditions.append({"threat_id": {"$in": obs_ids}})

    if inv_conditions:
        investigations_task = db.investigations.find(
            {"$or": inv_conditions},
            {"_id": 0, "id": 1, "title": 1, "created_at": 1, "status": 1, "case_number": 1}
        ).sort("created_at", -1).limit(10).to_list(10)
    else:
        async def _empty_investigations():
            return []
        investigations_task = _empty_investigations()

    actions, investigations = await asyncio.gather(actions_task, investigations_task)

    for action in actions:
        action_type = action.get("action_type", "corrective").lower()

        # Skip PM (preventive), PDM (predictive) and scheduled tasks — show only reactive/corrective history
        if action_type in ["pm", "preventive", "preventive maintenance", "scheduled", "pdm", "predictive", "predictive maintenance"]:
            continue

        event_type = "repair" if action_type in ["corrective", "repair", "cm"] else "work_order"

        events.append({
            "id": action.get("id"),
            "date": action.get("created_at", ""),
            "event_type": event_type,
            "title": action.get("title", "Action"),
            "reference_id": action.get("action_number", ""),
            "status": action.get("status", ""),
            "action_type": action.get("action_type", "").upper()
        })

    for inv in investigations:
        events.append({
            "id": inv.get("id"),
            "date": inv.get("created_at", ""),
            "event_type": "investigation",
            "title": inv.get("title", "Investigation"),
            "reference_id": inv.get("case_number", ""),
            "status": inv.get("status", "")
        })

    # Sort all events by date
    def parse_date(d):
        if not d:
            return datetime.min.replace(tzinfo=timezone.utc)
        if isinstance(d, str):
            try:
                return datetime.fromisoformat(d.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                return datetime.min.replace(tzinfo=timezone.utc)
        return d if hasattr(d, 'timestamp') else datetime.min.replace(tzinfo=timezone.utc)
    
    events.sort(key=lambda x: parse_date(x.get("date")), reverse=True)
    
    return events[:limit]


async def get_reliability_intelligence(observation: dict, failure_mode_data: dict = None) -> dict:
    """
    Generate reliability intelligence analysis:
    - Most likely cause
    - Supporting evidence
    - Contributing factors
    """
    # Get similar events count
    equipment_id = observation.get("linked_equipment_id")
    asset_name = observation.get("asset")
    failure_mode = observation.get("failure_mode", "")
    
    # Count historical events
    eq_conditions = []
    if equipment_id:
        eq_conditions.append({"linked_equipment_id": equipment_id})
    if asset_name:
        eq_conditions.append({"asset": asset_name})
    
    historical_count = 0
    previous_failures = 0
    similar_assets_count = 0
    work_orders_count = 0
    
    if eq_conditions:
        action_conditions = []
        if equipment_id:
            action_conditions.append({"linked_equipment_id": equipment_id})
        if asset_name:
            action_conditions.append({"equipment_name": asset_name})

        count_tasks = [
            db.threats.count_documents({"$or": eq_conditions}),
            db.threats.count_documents({
                "$or": eq_conditions,
                "status": {"$in": ["Closed", "Mitigated", "closed", "mitigated"]}
            }),
        ]
        if action_conditions:
            count_tasks.append(db.central_actions.count_documents({"$or": action_conditions}))
        else:
            async def _zero():
                return 0
            count_tasks.append(_zero())

        historical_count, previous_failures, work_orders_count = await asyncio.gather(*count_tasks)
    
    # Count similar assets (same equipment type)
    equipment_type = observation.get("equipment_type")
    if equipment_type:
        similar_assets_count = await db.threats.count_documents({
            "equipment_type": equipment_type,
            "id": {"$ne": observation.get("id")}
        })
    
    # Build most likely cause from failure mode data
    most_likely_cause = {
        "name": failure_mode_data.get("failure_mode", failure_mode) if failure_mode_data else failure_mode,
        "confidence": 70  # Default confidence
    }
    
    if failure_mode_data:
        # Use failure mode data to enhance analysis
        potential_causes = failure_mode_data.get("potential_causes", [])
        if potential_causes:
            if isinstance(potential_causes, str):
                most_likely_cause["name"] = potential_causes
                most_likely_cause["confidence"] = 75
            elif isinstance(potential_causes, list) and len(potential_causes) > 0:
                most_likely_cause["name"] = potential_causes[0] if isinstance(potential_causes[0], str) else str(potential_causes[0])
                most_likely_cause["confidence"] = 80
    
    # Build supporting evidence
    supporting_evidence = {
        "historical_events": historical_count,
        "similar_assets": similar_assets_count,
        "previous_failures": previous_failures,
        "work_orders": work_orders_count,
        "inspection_evidence": work_orders_count > 0  # Simplified
    }
    
    # Build contributing factors
    contributing_factors = []
    
    if failure_mode_data:
        # Extract factors from failure mode
        keywords = failure_mode_data.get("keywords", [])
        if keywords:
            for i, kw in enumerate(keywords[:4]):
                contributing_factors.append({
                    "factor": kw,
                    "rank": i + 1,
                    "source": "failure_mode_library"
                })
    
    # Add generic factors based on equipment type
    if equipment_type and len(contributing_factors) < 4:
        generic_factors = {
            "pump": ["Seal Wear", "Impeller Degradation", "Bearing Failure", "Cavitation"],
            "motor": ["Insulation Breakdown", "Bearing Wear", "Overheating", "Vibration"],
            "conveyor": ["Belt Wear", "Alignment Issues", "Pulley Wear", "Tension Variation"],
            "compressor": ["Valve Failure", "Seal Leakage", "Bearing Wear", "Cooling Issues"]
        }
        
        eq_type_lower = equipment_type.lower()
        for key, factors in generic_factors.items():
            if key in eq_type_lower:
                for i, factor in enumerate(factors):
                    if len(contributing_factors) < 4:
                        contributing_factors.append({
                            "factor": factor,
                            "rank": len(contributing_factors) + 1,
                            "source": "equipment_type_analysis"
                        })
                break
    
    # Calculate overall AI confidence
    ai_confidence = 70
    if failure_mode_data:
        ai_confidence += 10
    if historical_count > 5:
        ai_confidence += 5
    if previous_failures > 0:
        ai_confidence += 5
    ai_confidence = min(ai_confidence, 95)
    
    return {
        "most_likely_cause": most_likely_cause,
        "supporting_evidence": supporting_evidence,
        "contributing_factors": contributing_factors,
        "ai_confidence": ai_confidence
    }


async def get_recommended_actions(observation: dict, failure_mode_data: dict = None) -> List[dict]:
    """
    Get recommended actions from two sources:
    1. Failure Mode Library - existing actions linked to the failure mode (strategy)
    2. AI Generated - actual recommendations from the cached AI risk insights, if the
       user has run the AI Reliability Analysis for this observation. Returns nothing
       under "ai_generated" when the analysis has not yet been run, so the UI can show
       a "Generate AI recommendations" CTA.
    """
    recommendations = []
    
    # Source 1: Failure Mode Library Actions
    if failure_mode_data and failure_mode_data.get("recommended_actions"):
        fm_actions = failure_mode_data.get("recommended_actions", [])
        
        for i, action in enumerate(fm_actions[:5]):  # Limit to 5
            if isinstance(action, dict):
                action_title = action.get("action") or action.get("title") or action.get("description", "")
                # Support both `action_type` and legacy `type`
                action_type = (action.get("action_type") or action.get("type") or "PM").upper()
                expected_impact = action.get("expected_impact") or action.get("impact", "")
                discipline = action.get("discipline")
            else:
                action_title = str(action)
                action_type = "PM"
                expected_impact = ""
                discipline = None
            
            recommendations.append({
                "id": f"fm-{failure_mode_data.get('id', 'unknown')}-{i}",
                "action_type": action_type if action_type in ["PM", "CM", "PDM", "OP"] else "PM",
                "title": action_title,
                "source": "failure_mode_library",
                "source_display": "Failure Mode Library",
                "expected_impact": expected_impact,
                "confidence": None,  # Library actions don't have confidence
                "failure_mode_id": failure_mode_data.get("id"),
                "discipline": discipline,
                "why_recommended": f"Recommended because this action is part of the standard mitigation strategy for '{failure_mode_data.get('failure_mode', 'this failure mode')}'."
            })

    # Source 2: AI Generated Actions — pulled from the cached AI Risk Insights for this threat.
    # If the user hasn't run the AI Reliability Analysis yet, this section is empty and the
    # frontend renders a "Generate AI Recommendations" call-to-action.
    threat_id = observation.get("id")
    if threat_id:
        try:
            insights = await db.ai_risk_insights.find_one({"threat_id": threat_id}, {"_id": 0})
        except Exception:
            insights = None
        ai_recs = (insights or {}).get("recommendations", []) or []
        for i, rec in enumerate(ai_recs[:6]):
            if isinstance(rec, dict):
                title = rec.get("action") or rec.get("title") or rec.get("description", "")
                action_type = (rec.get("action_type") or rec.get("type") or "PM").upper()
                impact = rec.get("impact") or rec.get("expected_impact", "")
                confidence = rec.get("confidence")
                discipline = rec.get("discipline")
            else:
                title = str(rec)
                action_type = "PM"
                impact = ""
                confidence = None
                discipline = None
            if not title:
                continue
            recommendations.append({
                "id": f"ai-{threat_id}-{i}",
                "action_type": action_type if action_type in ["PM", "CM", "PDM", "OP"] else "PM",
                "title": title,
                "source": "ai_generated",
                "source_display": "AI Reliability Analysis",
                "expected_impact": impact,
                "confidence": confidence,
                "failure_mode_id": None,
                "discipline": discipline,
                "why_recommended": "Generated by the AI Reliability Analysis for this observation based on historical patterns and the linked failure mode."
            })
    
    return recommendations


async def _load_failure_mode_data(observation: dict) -> Optional[dict]:
    """Load failure mode by id or name with at most two sequential lookups."""
    failure_mode_id = observation.get("failure_mode_id")
    failure_mode_name = observation.get("failure_mode")
    if failure_mode_id:
        failure_mode_data = await db.failure_modes.find_one(
            {"id": failure_mode_id},
            {"_id": 0}
        )
        if failure_mode_data:
            return failure_mode_data
    if failure_mode_name:
        return await db.failure_modes.find_one(
            {"failure_mode": {"$regex": f"^{re.escape(failure_mode_name)}$", "$options": "i"}},
            {"_id": 0}
        )
    return None


async def _load_equipment_node(observation: dict) -> Optional[dict]:
    lookup_filters = []
    if observation.get("linked_equipment_id"):
        lookup_filters.append({"id": observation["linked_equipment_id"]})
    if observation.get("equipment_tag"):
        lookup_filters.append({"tag": observation["equipment_tag"]})
        lookup_filters.append({"equipment_tag": observation["equipment_tag"]})
    if observation.get("asset"):
        lookup_filters.append({"name": observation["asset"]})
    if not lookup_filters:
        return None
    return await db.equipment_nodes.find_one({"$or": lookup_filters}, {"_id": 0})


async def get_action_plan(observation_id: str, investigation: dict = None) -> List[dict]:
    """
    Get actions linked to this observation (existing actions system).
    
    Also surfaces any linked causal investigation as a synthetic IV-type entry
    so the investigation appears in the plan without duplicating data in
    central_actions.
    """
    actions = await db.central_actions.find(
        {
            "$or": [
                {"source_id": observation_id},
                {"observation_id": observation_id},
                {"threat_id": observation_id}
            ]
        },
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    action_plan = []
    
    # Surface the linked investigation (if any) as a synthetic IV entry
    if investigation is None:
        investigation = await db.investigations.find_one({"threat_id": observation_id}, {"_id": 0})
    if investigation:
        inv_status = (investigation.get("status") or "draft").lower()
        # Map investigation status → action plan status
        status_map = {
            "draft": "open",
            "in_progress": "in_progress",
            "review": "in_progress",
            "completed": "completed",
            "closed": "completed",
        }
        action_plan.append({
            "id": f"inv-{investigation.get('id')}",
            "action_number": investigation.get("case_number", ""),
            "title": "Complete causal investigation",
            "description": "Linked causal investigation. Click to open in Causal Engine.",
            "status": status_map.get(inv_status, "open"),
            "priority": "medium",
            "action_type": "IV",
            "discipline": "Reliability",
            "assignee": investigation.get("investigation_leader", ""),
            "owner": investigation.get("investigation_leader", ""),
            "due_date": "",
            "comments": "",
            "recommendation_id": None,
            "linked_investigation_id": investigation.get("id"),
            "is_synthetic": True,
        })

    for action in actions:
        action_plan.append({
            "id": action.get("id"),
            "action_number": action.get("action_number", ""),
            "title": action.get("title", ""),
            "description": action.get("description", ""),
            "status": action.get("status", "open"),
            "priority": action.get("priority", "medium"),
            "action_type": (action.get("action_type") or "").upper() if action.get("action_type") else "",
            "discipline": action.get("discipline"),
            "assignee": action.get("assignee") or action.get("assigned_to") or "",
            "owner": action.get("owner_name") or action.get("assigned_to_name", ""),
            "due_date": action.get("due_date", ""),
            "comments": action.get("comments", ""),
            "recommendation_id": action.get("recommendation_id"),
            "linked_investigation_id": action.get("linked_investigation_id"),
        })
    
    return action_plan


async def get_process_journey(observation: dict, actions: list, investigation: dict = None) -> List[dict]:
    """
    Build the process journey showing workflow status:
    Observation → Assessment → Planning → Investigation → Action → ALARP → Learning
    """
    stages = []
    
    # 1. Observation - always completed if we're viewing it
    stages.append({
        "stage": "Observation",
        "status": "completed",
        "date": observation.get("created_at"),
        "owner": observation.get("created_by_name")
    })
    
    # 2. Assessment - completed if failure mode and equipment are linked
    has_fm = bool(observation.get("failure_mode") or observation.get("failure_mode_id"))
    has_eq = bool(observation.get("linked_equipment_id"))
    has_risk = observation.get("risk_score", 0) > 0
    
    if has_fm and has_eq and has_risk:
        assessment_status = "completed"
    elif has_fm or has_eq:
        assessment_status = "in_progress"
    else:
        assessment_status = "not_started"
    
    stages.append({
        "stage": "Assessment",
        "status": assessment_status,
        "date": observation.get("updated_at") if assessment_status == "completed" else None,
        "owner": None
    })
    
    # 3. Planning - completed if actions are defined
    if len(actions) > 0:
        planning_status = "completed"
    elif assessment_status == "completed":
        planning_status = "in_progress"
    else:
        planning_status = "not_started"
    
    stages.append({
        "stage": "Planning",
        "status": planning_status,
        "date": actions[0].get("created_at") if actions else None,
        "owner": None
    })
    
    # 4. Investigation - check if investigation exists
    if investigation:
        inv_status = investigation.get("status", "draft").lower()
        if inv_status in ["completed", "closed"]:
            investigation_status = "completed"
        elif inv_status in ["draft", "in_progress", "review"]:
            investigation_status = "in_progress"
        else:
            investigation_status = "not_started"
    else:
        investigation_status = "not_started"
    
    stages.append({
        "stage": "Investigation",
        "status": investigation_status,
        "date": investigation.get("created_at") if investigation else None,
        "owner": investigation.get("lead_investigator_name") if investigation else None
    })
    
    # 5. Action - based on action completion
    completed_actions = [a for a in actions if a.get("status") in ["completed", "validated"]]
    total_actions = len(actions)
    
    if total_actions > 0 and len(completed_actions) == total_actions:
        action_status = "completed"
    elif len(completed_actions) > 0:
        action_status = "in_progress"
    elif planning_status == "completed":
        action_status = "not_started"
    else:
        action_status = "not_started"
    
    stages.append({
        "stage": "Action",
        "status": action_status,
        "date": None,
        "owner": None
    })
    
    # 6. ALARP - based on overall progress
    obs_status = observation.get("status", "open").lower()
    if obs_status in ["closed", "mitigated"]:
        alarp_status = "completed"
    elif action_status == "completed" and investigation_status == "completed":
        alarp_status = "in_progress"
    elif action_status in ["completed", "in_progress"]:
        alarp_status = "not_started"
    else:
        alarp_status = "not_started"
    
    stages.append({
        "stage": "Mitigated",
        "status": alarp_status,
        "date": None,
        "owner": None
    })
    
    # 7. Learning - only if mitigated
    learning_status = "completed" if alarp_status == "completed" else "not_started"
    
    stages.append({
        "stage": "Learning",
        "status": learning_status,
        "date": None,
        "owner": None
    })
    
    return stages


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.get("/{observation_id}")
async def get_observation_workspace(
    observation_id: str,
    language: Optional[str] = Query(None, description="UI language code (nl, de) for localized content"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get complete workspace data for an observation.
    Returns all data needed for the Reliability Intelligence Workspace.
    """
    # Get the observation
    observation = await db.threats.find_one(
        {"id": observation_id},
        {"_id": 0}
    )
    
    if not observation:
        raise HTTPException(status_code=404, detail="Observation not found")

    equipment_node, failure_mode_data, investigation = await asyncio.gather(
        _load_equipment_node(observation),
        _load_failure_mode_data(observation),
        db.investigations.find_one({"threat_id": observation_id}, {"_id": 0}),
    )

    criticality = None
    if equipment_node:
        criticality = equipment_node.get("criticality")
    if not criticality and observation.get("equipment_criticality_data"):
        criticality = observation.get("equipment_criticality_data")

    # Run independent queries in parallel for better performance
    action_plan_task = asyncio.create_task(get_action_plan(observation_id, investigation))
    criticality_definitions_task = asyncio.create_task(
        get_criticality_definitions_for_equipment(equipment_node, current_user["id"])
    )
    production_exposure_task = asyncio.create_task(
        calculate_production_exposure(observation, criticality, current_user["id"])
    )
    timeline_events_task = asyncio.create_task(
        get_equipment_timeline_events(
            equipment_id=observation.get("linked_equipment_id"),
            asset_name=observation.get("asset"),
            current_observation_id=observation_id
        )
    )
    reliability_intelligence_task = asyncio.create_task(
        get_reliability_intelligence(observation, failure_mode_data)
    )
    recommended_actions_task = asyncio.create_task(
        get_recommended_actions(observation, failure_mode_data)
    )
    
    # Await all parallel tasks
    (
        action_plan,
        criticality_definitions,
        production_exposure,
        timeline_events,
        reliability_intelligence,
        recommended_actions
    ) = await asyncio.gather(
        action_plan_task,
        criticality_definitions_task,
        production_exposure_task,
        timeline_events_task,
        reliability_intelligence_task,
        recommended_actions_task
    )
    
    def _def_for(score: int) -> dict:
        """Return the criticality definition entry for a 1-5 score, or {}."""
        if not score:
            return {}
        for entry in criticality_definitions or []:
            if entry.get("rank") == score:
                return entry
        return {}
    
    # Build all workspace components - sync functions run immediately
    
    # 1. Exposure data (sync calculations)
    safety_exposure = calculate_safety_exposure(observation, criticality)
    environmental_exposure = calculate_environmental_exposure(observation, criticality)
    reputation_exposure = calculate_reputation_exposure(observation, criticality)
    
    # Enrich exposures with the resolved definition labels so the card text
    # matches the right-click popover content for that installation.
    if safety_exposure.get("safety_impact_score"):
        d = _def_for(safety_exposure["safety_impact_score"])
        if d:
            safety_exposure["severity"] = d.get("label") or d.get("name") or safety_exposure.get("severity", "Low")
            safety_exposure["definition"] = d.get("safety") or (d.get("definitions") or {}).get("safety", "")
    if environmental_exposure.get("environmental_impact_score"):
        d = _def_for(environmental_exposure["environmental_impact_score"])
        if d:
            environmental_exposure["impact_rating"] = d.get("label") or d.get("name") or environmental_exposure.get("impact_rating", "Low")
            environmental_exposure["definition"] = d.get("environment") or (d.get("definitions") or {}).get("environment", "")
    if reputation_exposure.get("reputation_impact_score"):
        d = _def_for(reputation_exposure["reputation_impact_score"])
        if d:
            reputation_exposure["impact_rating"] = d.get("label") or d.get("name") or reputation_exposure.get("impact_rating", "Low")
            reputation_exposure["definition"] = d.get("reputation") or (d.get("definitions") or {}).get("reputation", "")
    
    alarp_progress, process_journey = await asyncio.gather(
        calculate_alarp_progress(observation, action_plan, investigation),
        get_process_journey(observation, action_plan, investigation),
    )
    
    exposure_data = {
        "production": production_exposure,
        "safety": safety_exposure,
        "environmental": environmental_exposure,
        "reputation": reputation_exposure,
        "alarp": alarp_progress,
        "risk_summary": {
            "risk_score": observation.get("risk_score", 0),
            "risk_level": observation.get("risk_level", "Low"),
            "rpn": observation.get("fmea_rpn") or observation.get("rpn") or (
                failure_mode_data.get("rpn") if failure_mode_data else None
            )
        }
    }
    
    # 2-4 already fetched in parallel above
    
    # Filter recommended actions - remove items already added to the action plan
    added_recommendation_ids = {a.get("recommendation_id") for a in action_plan if a.get("recommendation_id")}
    if added_recommendation_ids:
        recommended_actions = [r for r in recommended_actions if r.get("id") not in added_recommendation_ids]
    
    # Sync observation.status with the current stage of the process journey.
    # The "current" stage is the furthest stage that is in_progress, or the latest
    # completed stage if none are in progress. Status values map 1:1 to stage names.
    current_stage = None
    for stg in process_journey:
        if stg.get("status") == "in_progress":
            current_stage = stg.get("stage")
            break
    if not current_stage:
        for stg in process_journey:
            if stg.get("status") == "completed":
                current_stage = stg.get("stage")
        # falls through to last completed
    if current_stage and observation.get("status") != current_stage:
        new_status = current_stage
        observation["status"] = new_status

        async def _sync_observation_status():
            try:
                await db.threats.update_one(
                    {"id": observation_id},
                    {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
            except Exception:
                pass

        asyncio.create_task(_sync_observation_status())
    
    payload = {
        "observation_id": observation_id,
        "observation": _build_observation_payload(observation, equipment_node),
        "equipment": {
            "id": equipment_node.get("id") if equipment_node else None,
            "name": equipment_node.get("name") if equipment_node else observation.get("asset"),
            "tag": equipment_node.get("tag_number") if equipment_node else None,
            "equipment_type": equipment_node.get("equipment_type") if equipment_node else observation.get("equipment_type"),
            "criticality": criticality
        },
        "failure_mode": {
            "id": failure_mode_data.get("id") if failure_mode_data else None,
            "name": failure_mode_data.get("failure_mode") if failure_mode_data else observation.get("failure_mode"),
            "rpn": failure_mode_data.get("rpn") if failure_mode_data else None,
            "severity": failure_mode_data.get("severity") if failure_mode_data else None,
            "occurrence": failure_mode_data.get("occurrence") if failure_mode_data else None,
            "detectability": failure_mode_data.get("detectability") if failure_mode_data else None,
            "recommended_actions": failure_mode_data.get("recommended_actions", []) if failure_mode_data else []
        },
        "exposure": exposure_data,
        "timeline": {
            "events": timeline_events,
            "total": len(timeline_events),
            "ai_evidence": {
                "historical_events": reliability_intelligence["supporting_evidence"]["historical_events"],
                "similar_assets": reliability_intelligence["supporting_evidence"]["similar_assets"],
                "previous_failures": reliability_intelligence["supporting_evidence"]["previous_failures"],
                "confidence": reliability_intelligence["ai_confidence"]
            }
        },
        "reliability_intelligence": reliability_intelligence,
        "recommended_actions": recommended_actions,
        # Has the user already run the AI risk analysis for this threat? Drives the
        # "Generate AI Recommendations" CTA in the Recommended Actions panel.
        "ai_insights_available": any(r.get("source") == "ai_generated" for r in recommended_actions),
        "action_plan": action_plan,
        "process_journey": process_journey,
        # Custom criticality definitions for this observation's installation (falls
        # back to defaults if no custom configuration exists). Used by the right-click
        # popovers on exposure cards.
        "criticality_definitions": criticality_definitions,
        "investigation": {
            "id": investigation.get("id") if investigation else None,
            "title": investigation.get("title") if investigation else None,
            "status": investigation.get("status") if investigation else None,
            "case_number": investigation.get("case_number") if investigation else None
        } if investigation else None
    }

    return await localize_workspace_payload(
        payload,
        language,
        user_id=current_user.get("id"),
        allow_live_translation=False,
    )


@router.post("/{observation_id}/add-action")
async def add_action_to_plan(
    observation_id: str,
    action_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Add a new action to the observation's action plan.
    This creates an action in the central actions system linked to this observation.
    """
    # Verify observation exists
    observation = await db.threats.find_one({"id": observation_id}, {"_id": 0})
    if not observation:
        raise HTTPException(status_code=404, detail="Observation not found")
    
    action_number = await allocate_central_action_number()
    
    # Create action
    action_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    new_action = {
        "id": action_id,
        "action_number": action_number,
        "title": action_data.get("title", ""),
        "description": action_data.get("description", ""),
        "action_type": action_data.get("action_type", "corrective"),
        "status": "open",
        "priority": action_data.get("priority", "medium"),
        "source": "observation",
        "source_id": observation_id,
        "observation_id": observation_id,
        "threat_id": observation_id,
        "linked_equipment_id": observation.get("linked_equipment_id"),
        "equipment_name": observation.get("asset"),
        "due_date": action_data.get("due_date"),
        "owner_id": action_data.get("owner_id"),
        "owner_name": action_data.get("owner_name"),
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name")
    }
    
    await db.central_actions.insert_one(new_action)

    asyncio.create_task(
        translate_action(
            action_id,
            {
                "title": new_action.get("title", ""),
                "description": new_action.get("description", "") or "",
            },
            current_user.get("id"),
        )
    )
    
    return {
        "success": True,
        "action": {k: v for k, v in new_action.items() if k != "_id"},
        "message": f"Action {action_number} added to plan"
    }


@router.post("/{observation_id}/add-recommendation")
async def add_recommendation_to_plan(
    observation_id: str,
    recommendation: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Add a recommended action to the observation's action plan.
    Converts a recommendation into an actual action.
    """
    # Verify observation exists
    observation = await db.threats.find_one({"id": observation_id}, {"_id": 0})
    if not observation:
        raise HTTPException(status_code=404, detail="Observation not found")
    
    action_number = await allocate_central_action_number()
    
    # Map action type to action_type
    action_type_map = {
        "PM": "preventive",
        "CM": "corrective",
        "PDM": "predictive",
        "OP": "operational"
    }
    
    action_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    new_action = {
        "id": action_id,
        "action_number": action_number,
        "title": recommendation.get("title", ""),
        "description": recommendation.get("why_recommended", ""),
        "action_type": action_type_map.get(recommendation.get("action_type", "PM"), "corrective"),
        "status": "open",
        "priority": "medium",
        "discipline": recommendation.get("discipline"),
        "source": recommendation.get("source", "recommendation"),
        "source_id": observation_id,
        "observation_id": observation_id,
        "threat_id": observation_id,
        "linked_equipment_id": observation.get("linked_equipment_id"),
        "equipment_name": observation.get("asset"),
        "recommendation_id": recommendation.get("id"),
        "expected_impact": recommendation.get("expected_impact"),
        "confidence": recommendation.get("confidence"),
        "failure_mode_id": recommendation.get("failure_mode_id"),
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name")
    }
    
    await db.central_actions.insert_one(new_action)

    asyncio.create_task(
        translate_action(
            action_id,
            {
                "title": new_action.get("title", ""),
                "description": new_action.get("description", "") or "",
            },
            current_user.get("id"),
        )
    )
    
    return {
        "success": True,
        "action": {k: v for k, v in new_action.items() if k != "_id"},
        "message": f"Recommendation added as Action {action_number}"
    }


@router.get("/{observation_id}/timeline")
async def get_observation_timeline_enhanced(
    observation_id: str,
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """
    Get enhanced equipment timeline for the observation.
    """
    observation = await db.threats.find_one({"id": observation_id}, {"_id": 0})
    if not observation:
        raise HTTPException(status_code=404, detail="Observation not found")
    
    timeline_events = await get_equipment_timeline_events(
        equipment_id=observation.get("linked_equipment_id"),
        asset_name=observation.get("asset"),
        current_observation_id=observation_id,
        limit=limit
    )
    
    return {
        "observation_id": observation_id,
        "events": timeline_events,
        "total": len(timeline_events)
    }
