"""
Observation workspace intelligence and timeline data.
"""
from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone
from typing import List, Optional

from database import db
from services.tenant_schema import merge_tenant_filter


async def get_equipment_timeline_events(
    equipment_id: str = None,
    asset_name: str = None,
    current_observation_id: str = None,
    limit: int = 20,
    *,
    user: Optional[dict] = None,
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
        merge_tenant_filter({"$or": eq_conditions}, user),
        {
            "_id": 0,
            "id": 1,
            "title": 1,
            "created_at": 1,
            "status": 1,
            "risk_level": 1,
            "failure_mode": 1,
            "threat_number": 1,
        },
    ).sort("created_at", -1).limit(limit).to_list(limit)

    for obs in observations:
        is_current = obs.get("id") == current_observation_id
        status = obs.get("status", "open").lower()

        # Classify as failure if closed/mitigated
        event_type = "failure" if status in ["closed", "mitigated"] else "observation"
        if is_current:
            event_type = "observation"  # Current one is always observation

        events.append(
            {
                "id": obs.get("id"),
                "date": obs.get("created_at", ""),
                "event_type": event_type,
                "title": obs.get("title", "Observation"),
                "reference_id": obs.get("threat_number", ""),
                "status": status,
                "severity": obs.get("risk_level", ""),
                "is_current": is_current,
            }
        )

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
            merge_tenant_filter({"$or": action_conditions}, user),
            {
                "_id": 0,
                "id": 1,
                "title": 1,
                "created_at": 1,
                "status": 1,
                "action_number": 1,
                "action_type": 1,
            },
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
            merge_tenant_filter({"$or": inv_conditions}, user),
            {"_id": 0, "id": 1, "title": 1, "created_at": 1, "status": 1, "case_number": 1},
        ).sort("created_at", -1).limit(10).to_list(10)
    else:

        async def _empty_investigations():
            return []

        investigations_task = _empty_investigations()

    actions, investigations = await asyncio.gather(actions_task, investigations_task)

    for action in actions:
        action_type = action.get("action_type", "corrective").lower()

        # Skip PM (preventive), PDM (predictive) and scheduled tasks — show only reactive/corrective history
        if action_type in [
            "pm",
            "preventive",
            "preventive maintenance",
            "scheduled",
            "pdm",
            "predictive",
            "predictive maintenance",
        ]:
            continue

        event_type = "repair" if action_type in ["corrective", "repair", "cm"] else "work_order"

        events.append(
            {
                "id": action.get("id"),
                "date": action.get("created_at", ""),
                "event_type": event_type,
                "title": action.get("title", "Action"),
                "reference_id": action.get("action_number", ""),
                "status": action.get("status", ""),
                "action_type": action.get("action_type", "").upper(),
            }
        )

    for inv in investigations:
        events.append(
            {
                "id": inv.get("id"),
                "date": inv.get("created_at", ""),
                "event_type": "investigation",
                "title": inv.get("title", "Investigation"),
                "reference_id": inv.get("case_number", ""),
                "status": inv.get("status", ""),
            }
        )

    # Sort all events by date
    def parse_date(d):
        if not d:
            return datetime.min.replace(tzinfo=timezone.utc)
        if isinstance(d, str):
            try:
                return datetime.fromisoformat(d.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                return datetime.min.replace(tzinfo=timezone.utc)
        return d if hasattr(d, "timestamp") else datetime.min.replace(tzinfo=timezone.utc)

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
            db.threats.count_documents(
                {
                    "$or": eq_conditions,
                    "status": {"$in": ["Closed", "Mitigated", "closed", "mitigated"]},
                }
            ),
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
        similar_assets_count = await db.threats.count_documents(
            {"equipment_type": equipment_type, "id": {"$ne": observation.get("id")}}
        )

    # Build most likely cause from failure mode data
    most_likely_cause = {
        "name": failure_mode_data.get("failure_mode", failure_mode) if failure_mode_data else failure_mode,
        "confidence": 70,  # Default confidence
    }

    if failure_mode_data:
        # Use failure mode data to enhance analysis
        potential_causes = failure_mode_data.get("potential_causes", [])
        if potential_causes:
            if isinstance(potential_causes, str):
                most_likely_cause["name"] = potential_causes
                most_likely_cause["confidence"] = 75
            elif isinstance(potential_causes, list) and len(potential_causes) > 0:
                most_likely_cause["name"] = (
                    potential_causes[0] if isinstance(potential_causes[0], str) else str(potential_causes[0])
                )
                most_likely_cause["confidence"] = 80

    # Build supporting evidence
    supporting_evidence = {
        "historical_events": historical_count,
        "similar_assets": similar_assets_count,
        "previous_failures": previous_failures,
        "work_orders": work_orders_count,
        "inspection_evidence": work_orders_count > 0,  # Simplified
    }

    # Build contributing factors
    contributing_factors = []

    if failure_mode_data:
        # Extract factors from failure mode
        keywords = failure_mode_data.get("keywords", [])
        if keywords:
            for i, kw in enumerate(keywords[:4]):
                contributing_factors.append({"factor": kw, "rank": i + 1, "source": "failure_mode_library"})

    # Add generic factors based on equipment type
    if equipment_type and len(contributing_factors) < 4:
        generic_factors = {
            "pump": ["Seal Wear", "Impeller Degradation", "Bearing Failure", "Cavitation"],
            "motor": ["Insulation Breakdown", "Bearing Wear", "Overheating", "Vibration"],
            "conveyor": ["Belt Wear", "Alignment Issues", "Pulley Wear", "Tension Variation"],
            "compressor": ["Valve Failure", "Seal Leakage", "Bearing Wear", "Cooling Issues"],
        }

        eq_type_lower = equipment_type.lower()
        for key, factors in generic_factors.items():
            if key in eq_type_lower:
                for _, factor in enumerate(factors):
                    if len(contributing_factors) < 4:
                        contributing_factors.append(
                            {
                                "factor": factor,
                                "rank": len(contributing_factors) + 1,
                                "source": "equipment_type_analysis",
                            }
                        )
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
        "ai_confidence": ai_confidence,
    }


async def get_recommended_actions(
    observation: dict,
    failure_mode_data: dict = None,
    *,
    user: Optional[dict] = None,
) -> List[dict]:
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

            recommendations.append(
                {
                    "id": f"fm-{failure_mode_data.get('id', 'unknown')}-{i}",
                    "action_type": action_type if action_type in ["PM", "CM", "PDM", "OP"] else "PM",
                    "title": action_title,
                    "source": "failure_mode_library",
                    "source_display": "Failure Mode Library",
                    "expected_impact": expected_impact,
                    "confidence": None,  # Library actions don't have confidence
                    "failure_mode_id": failure_mode_data.get("id"),
                    "discipline": discipline,
                    "why_recommended": (
                        "Recommended because this action is part of the standard mitigation strategy for "
                        f"'{failure_mode_data.get('failure_mode', 'this failure mode')}'."
                    ),
                }
            )

    # Source 2: AI Generated Actions — pulled from the cached AI Risk Insights for this threat.
    # If the user hasn't run the AI Reliability Analysis yet, this section is empty and the
    # frontend renders a "Generate AI Recommendations" call-to-action.
    threat_id = observation.get("id")
    if threat_id:
        try:
            insights = await db.ai_risk_insights.find_one(
                merge_tenant_filter({"threat_id": threat_id}, user),
                {"_id": 0},
            )
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
            recommendations.append(
                {
                    "id": f"ai-{threat_id}-{i}",
                    "action_type": action_type if action_type in ["PM", "CM", "PDM", "OP"] else "PM",
                    "title": title,
                    "source": "ai_generated",
                    "source_display": "AI Reliability Analysis",
                    "expected_impact": impact,
                    "confidence": confidence,
                    "failure_mode_id": None,
                    "discipline": discipline,
                    "why_recommended": (
                        "Generated by the AI Reliability Analysis for this observation based on historical "
                        "patterns and the linked failure mode."
                    ),
                }
            )

    return recommendations


async def _load_failure_mode_data(observation: dict, user: Optional[dict] = None) -> Optional[dict]:
    """Load failure mode by id or name with at most two sequential lookups."""
    failure_mode_id = observation.get("failure_mode_id")
    failure_mode_name = observation.get("failure_mode")
    if failure_mode_id:
        failure_mode_data = await db.failure_modes.find_one(
            merge_tenant_filter({"id": failure_mode_id}, user),
            {"_id": 0},
        )
        if failure_mode_data:
            return failure_mode_data
    if failure_mode_name:
        return await db.failure_modes.find_one(
            merge_tenant_filter(
                {"failure_mode": {"$regex": f"^{re.escape(failure_mode_name)}$", "$options": "i"}},
                user,
            ),
            {"_id": 0},
        )
    return None


async def _load_equipment_node(observation: dict, user: Optional[dict] = None) -> Optional[dict]:
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
    return await db.equipment_nodes.find_one(
        merge_tenant_filter({"$or": lookup_filters}, user),
        {"_id": 0},
    )
