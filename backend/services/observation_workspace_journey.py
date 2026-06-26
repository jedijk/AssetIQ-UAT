"""
Observation workspace journey and orchestration service.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import List, Optional
import uuid

from fastapi import HTTPException

from database import db
from services.action_number_service import allocate_central_action_number
from services.criticality_score import resolve_observation_criticality
from services.observation_workspace_exposure import (
    calculate_alarp_progress,
    calculate_environmental_exposure,
    calculate_production_exposure,
    calculate_reputation_exposure,
    calculate_safety_exposure,
    compute_workspace_risk_summary,
    get_criticality_definitions_for_equipment,
    resolve_installation_id as _resolve_installation_id,
)
from services.observation_workspace_intel import (
    _load_equipment_node,
    _load_failure_mode_data,
    get_equipment_timeline_events,
    get_recommended_actions,
    get_reliability_intelligence,
)
from services.observation_workspace_models import _build_observation_payload, _find_observation
from services.tenant_schema import merge_tenant_filter, with_tenant_id
from services.work_signal_projection import project_detail
from utils.auto_translate import translate_action
from utils.workspace_localization import localize_workspace_payload


async def get_action_plan(observation_id: str, investigation: dict = None, *, user: Optional[dict] = None) -> List[dict]:
    """
    Get actions linked to this observation (existing actions system).

    Also surfaces any linked causal investigation as a synthetic IV-type entry
    so the investigation appears in the plan without duplicating data in
    central_actions.
    """
    actions = await db.central_actions.find(
        merge_tenant_filter(
            {
                "$or": [
                    {"source_id": observation_id},
                    {"observation_id": observation_id},
                    {"threat_id": observation_id},
                ]
            },
            user,
        ),
        {"_id": 0},
    ).sort("created_at", -1).to_list(50)

    action_plan = []

    # Surface the linked investigation (if any) as a synthetic IV entry
    if investigation is None:
        investigation = await db.investigations.find_one(
            merge_tenant_filter({"threat_id": observation_id}, user),
            {"_id": 0},
        )
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
        action_plan.append(
            {
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
            }
        )

    for action in actions:
        action_plan.append(
            {
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
            }
        )

    return action_plan


async def get_process_journey(observation: dict, actions: list, investigation: dict = None) -> List[dict]:
    """
    Build the process journey showing workflow status:
    Observation → Assessment → Planning → Investigation → Action → ALARP → Learning
    """
    stages = []

    # 1. Observation - always completed if we're viewing it
    stages.append(
        {
            "stage": "Observation",
            "status": "completed",
            "date": observation.get("created_at"),
            "owner": observation.get("created_by_name"),
        }
    )

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

    stages.append(
        {
            "stage": "Assessment",
            "status": assessment_status,
            "date": observation.get("updated_at") if assessment_status == "completed" else None,
            "owner": None,
        }
    )

    # 3. Planning - completed if actions are defined
    if len(actions) > 0:
        planning_status = "completed"
    elif assessment_status == "completed":
        planning_status = "in_progress"
    else:
        planning_status = "not_started"

    stages.append(
        {
            "stage": "Planning",
            "status": planning_status,
            "date": actions[0].get("created_at") if actions else None,
            "owner": None,
        }
    )

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

    stages.append(
        {
            "stage": "Investigation",
            "status": investigation_status,
            "date": investigation.get("created_at") if investigation else None,
            "owner": investigation.get("lead_investigator_name") if investigation else None,
        }
    )

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

    stages.append({"stage": "Action", "status": action_status, "date": None, "owner": None})

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

    stages.append({"stage": "Mitigated", "status": alarp_status, "date": None, "owner": None})

    # 7. Learning - only if mitigated
    learning_status = "completed" if alarp_status == "completed" else "not_started"

    stages.append({"stage": "Learning", "status": learning_status, "date": None, "owner": None})

    return stages


async def get_workspace(user: dict, observation_id: str, language: Optional[str] = None):
    """
    Get complete workspace data for an observation.
    Returns all data needed for the Reliability Intelligence Workspace.
    """
    # Get the observation
    observation = await _find_observation(observation_id, user)

    if not observation:
        raise HTTPException(status_code=404, detail="Observation not found")

    equipment_node, failure_mode_data, investigation = await asyncio.gather(
        _load_equipment_node(observation, user),
        _load_failure_mode_data(observation, user),
        db.investigations.find_one(
            merge_tenant_filter({"threat_id": observation_id}, user),
            {"_id": 0},
        ),
    )

    criticality = resolve_observation_criticality(observation, equipment_node)

    # Run independent queries in parallel for better performance
    action_plan_task = asyncio.create_task(get_action_plan(observation_id, investigation, user=user))
    criticality_definitions_task = asyncio.create_task(
        get_criticality_definitions_for_equipment(equipment_node, user["id"])
    )
    production_exposure_task = asyncio.create_task(calculate_production_exposure(observation, criticality, user["id"]))
    timeline_events_task = asyncio.create_task(
        get_equipment_timeline_events(
            equipment_id=observation.get("linked_equipment_id"),
            asset_name=observation.get("asset"),
            current_observation_id=observation_id,
            user=user,
        )
    )
    reliability_intelligence_task = asyncio.create_task(get_reliability_intelligence(observation, failure_mode_data))
    recommended_actions_task = asyncio.create_task(get_recommended_actions(observation, failure_mode_data, user=user))

    # Await all parallel tasks
    (
        action_plan,
        criticality_definitions,
        production_exposure,
        timeline_events,
        reliability_intelligence,
        recommended_actions,
    ) = await asyncio.gather(
        action_plan_task,
        criticality_definitions_task,
        production_exposure_task,
        timeline_events_task,
        reliability_intelligence_task,
        recommended_actions_task,
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
            environmental_exposure["impact_rating"] = (
                d.get("label") or d.get("name") or environmental_exposure.get("impact_rating", "Low")
            )
            environmental_exposure["definition"] = d.get("environment") or (
                d.get("definitions") or {}
            ).get("environment", "")
    if reputation_exposure.get("reputation_impact_score"):
        d = _def_for(reputation_exposure["reputation_impact_score"])
        if d:
            reputation_exposure["impact_rating"] = (
                d.get("label") or d.get("name") or reputation_exposure.get("impact_rating", "Low")
            )
            reputation_exposure["definition"] = d.get("reputation") or (d.get("definitions") or {}).get(
                "reputation", ""
            )

    installation_id = await _resolve_installation_id(equipment_node)
    risk_summary = await compute_workspace_risk_summary(
        observation,
        criticality,
        failure_mode_data,
        installation_id=installation_id,
    )
    observation_aligned = {
        **observation,
        "risk_score": risk_summary["risk_score"],
        "risk_level": risk_summary["risk_level"],
        "criticality_score": risk_summary.get("criticality_score"),
        "fmea_score": risk_summary.get("fmea_score"),
    }

    alarp_progress, process_journey = await asyncio.gather(
        calculate_alarp_progress(observation_aligned, action_plan, investigation),
        get_process_journey(observation_aligned, action_plan, investigation),
    )

    exposure_data = {
        "production": production_exposure,
        "safety": safety_exposure,
        "environmental": environmental_exposure,
        "reputation": reputation_exposure,
        "alarp": alarp_progress,
        "risk_summary": risk_summary,
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
                    {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}},
                )
            except Exception:
                pass

        asyncio.create_task(_sync_observation_status())

    payload = {
        "observation_id": observation_id,
        "observation": _build_observation_payload(observation_aligned, equipment_node),
        "work_signal": project_detail(observation),
        "equipment": {
            "id": equipment_node.get("id") if equipment_node else None,
            "name": equipment_node.get("name") if equipment_node else observation.get("asset"),
            "tag": equipment_node.get("tag_number") if equipment_node else None,
            "equipment_type": (
                equipment_node.get("equipment_type") if equipment_node else observation.get("equipment_type")
            ),
            "criticality": criticality,
        },
        "failure_mode": {
            "id": failure_mode_data.get("id") if failure_mode_data else None,
            "name": failure_mode_data.get("failure_mode") if failure_mode_data else observation.get("failure_mode"),
            "rpn": failure_mode_data.get("rpn") if failure_mode_data else None,
            "severity": failure_mode_data.get("severity") if failure_mode_data else None,
            "occurrence": failure_mode_data.get("occurrence") if failure_mode_data else None,
            "detectability": failure_mode_data.get("detectability") if failure_mode_data else None,
            "recommended_actions": failure_mode_data.get("recommended_actions", []) if failure_mode_data else [],
        },
        "exposure": exposure_data,
        "timeline": {
            "events": timeline_events,
            "total": len(timeline_events),
            "ai_evidence": {
                "historical_events": reliability_intelligence["supporting_evidence"]["historical_events"],
                "similar_assets": reliability_intelligence["supporting_evidence"]["similar_assets"],
                "previous_failures": reliability_intelligence["supporting_evidence"]["previous_failures"],
                "confidence": reliability_intelligence["ai_confidence"],
            },
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
            "case_number": investigation.get("case_number") if investigation else None,
        }
        if investigation
        else None,
    }

    return await localize_workspace_payload(
        payload,
        language,
        user_id=user.get("id"),
        allow_live_translation=False,
    )


async def add_action_to_plan(user: dict, observation_id: str, action_data: dict):
    """
    Add a new action to the observation's action plan.
    This creates an action in the central actions system linked to this observation.
    """
    # Verify observation exists
    observation = await _find_observation(observation_id, user)
    if not observation:
        raise HTTPException(status_code=404, detail="Observation not found")

    action_number = await allocate_central_action_number()

    # Create action
    action_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    observation_title = observation.get("title") or observation.get("asset") or "Observation"

    new_action = with_tenant_id(
        {
            "id": action_id,
            "action_number": action_number,
            "title": action_data.get("title", ""),
            "description": action_data.get("description", ""),
            "action_type": action_data.get("action_type", "corrective"),
            "status": "open",
            "priority": action_data.get("priority", "medium"),
            "source_type": "threat",
            "source_name": observation_title,
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
            "created_by": user.get("id"),
            "created_by_name": user.get("name"),
        },
        user,
    )

    await db.central_actions.insert_one(new_action)

    asyncio.create_task(
        translate_action(
            action_id,
            {
                "title": new_action.get("title", ""),
                "description": new_action.get("description", "") or "",
            },
            user.get("id"),
        )
    )

    return {
        "success": True,
        "action": {k: v for k, v in new_action.items() if k != "_id"},
        "message": f"Action {action_number} added to plan",
    }


async def add_recommendation_to_plan(user: dict, observation_id: str, recommendation: dict):
    """
    Add a recommended action to the observation's action plan.
    Converts a recommendation into an actual action.
    """
    # Verify observation exists
    observation = await _find_observation(observation_id, user)
    if not observation:
        raise HTTPException(status_code=404, detail="Observation not found")

    action_number = await allocate_central_action_number()

    # Map action type to action_type
    action_type_map = {
        "PM": "preventive",
        "CM": "corrective",
        "PDM": "predictive",
        "OP": "operational",
    }

    action_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    observation_title = observation.get("title") or observation.get("asset") or "Observation"
    rec_source = recommendation.get("source", "recommendation")
    source_type = "ai_recommendation" if rec_source == "ai_generated" else "threat"

    new_action = with_tenant_id(
        {
            "id": action_id,
            "action_number": action_number,
            "title": recommendation.get("title", ""),
            "description": recommendation.get("why_recommended", ""),
            "action_type": action_type_map.get(recommendation.get("action_type", "PM"), "corrective"),
            "status": "open",
            "priority": "medium",
            "discipline": recommendation.get("discipline"),
            "source_type": source_type,
            "source_name": observation_title,
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
            "created_by": user.get("id"),
            "created_by_name": user.get("name"),
        },
        user,
    )

    await db.central_actions.insert_one(new_action)

    asyncio.create_task(
        translate_action(
            action_id,
            {
                "title": new_action.get("title", ""),
                "description": new_action.get("description", "") or "",
            },
            user.get("id"),
        )
    )

    return {
        "success": True,
        "action": {k: v for k, v in new_action.items() if k != "_id"},
        "message": f"Recommendation added as Action {action_number}",
    }


async def get_timeline_enhanced(user: dict, observation_id: str, limit: int = 20):
    """
    Get enhanced equipment timeline for the observation.
    """
    observation = await _find_observation(observation_id, user)
    if not observation:
        raise HTTPException(status_code=404, detail="Observation not found")

    timeline_events = await get_equipment_timeline_events(
        equipment_id=observation.get("linked_equipment_id"),
        asset_name=observation.get("asset"),
        current_observation_id=observation_id,
        limit=limit,
        user=user,
    )

    return {
        "observation_id": observation_id,
        "events": timeline_events,
        "total": len(timeline_events),
    }
