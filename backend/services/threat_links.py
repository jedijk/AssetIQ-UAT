"""Threat service — equipment/failure-mode linking and AI description improvement."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

from database import db, installation_filter
from services.criticality_score import compute_criticality_score
from services.tenant_schema import merge_tenant_filter
from services.threat_helpers import (
    _find_threat_scoped,
    _mirror_threat_observation,
    _sync_threat_graph,
    assert_threat_installation_scope,
    get_failure_mode_by_name_or_id,
)
from services.threat_score_service import (
    calculate_risk_score,
    fmea_score_from_failure_mode,
    get_risk_settings_for_installation,
    update_all_ranks,
)

logger = logging.getLogger(__name__)


async def link_threat_to_equipment(user: dict, threat_id: str, equipment_node_id: str):
    """
    Link a threat to an equipment node and apply its criticality to the threat score.
    This updates the threat's asset field and recalculates the risk score.
    """
    threat = await _find_threat_scoped(user, threat_id)
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    await assert_threat_installation_scope(user, threat)
    await installation_filter.assert_user_can_access_equipment(user, equipment_node_id)

    node = await db.equipment_nodes.find_one(
        merge_tenant_filter({"id": equipment_node_id}, user),
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")

    criticality = node.get("criticality")

    safety_impact = criticality.get("safety_impact", 0) or 0 if criticality else 0
    production_impact = criticality.get("production_impact", 0) or 0 if criticality else 0
    environmental_impact = criticality.get("environmental_impact", 0) or 0 if criticality else 0
    reputation_impact = criticality.get("reputation_impact", 0) or 0 if criticality else 0
    criticality_score = compute_criticality_score(
        safety_impact, production_impact, environmental_impact, reputation_impact
    )

    criticality_level = criticality.get("level", "low") if criticality else "low"
    criticality_data = {
        "safety_impact": safety_impact,
        "production_impact": production_impact,
        "environmental_impact": environmental_impact,
        "reputation_impact": reputation_impact,
        "level": criticality_level,
        "criticality_score": criticality_score
    }

    fmea_score = threat.get("fmea_score", threat.get("base_risk_score", 50))

    failure_mode_name = threat.get("failure_mode")
    failure_mode_id = threat.get("failure_mode_id")
    if failure_mode_name and failure_mode_name != "Unknown":
        fm = await get_failure_mode_by_name_or_id(failure_mode_name, failure_mode_id)
        if fm:
            from_fm = fmea_score_from_failure_mode(fm)
            if from_fm is not None:
                fmea_score = from_fm

    installation_id = (
        threat.get("installation_id")
        or node.get("installation_id")
        or ""
    )
    risk_settings = await get_risk_settings_for_installation(installation_id)
    final_risk_score, risk_level = calculate_risk_score(
        criticality_score, fmea_score, risk_settings
    )

    update_data = {
        "asset": node["name"],
        "linked_equipment_id": equipment_node_id,
        "equipment_criticality": criticality_level,
        "equipment_criticality_data": criticality_data,
        "criticality_score": criticality_score,
        "fmea_score": fmea_score,
        "base_risk_score": fmea_score,
        "risk_score": final_risk_score,
        "risk_level": risk_level,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    await db.threats.update_one(
        merge_tenant_filter({"id": threat_id}, user),
        {"$set": update_data},
    )

    await update_all_ranks(user["id"], user=user)

    updated_threat = await _find_threat_scoped(user, threat_id)
    await _mirror_threat_observation(user, updated_threat)
    await _sync_threat_graph(user, updated_threat, label="threat_link_equipment")

    return {
        "message": f"Threat linked to {node['name']}",
        "threat": updated_threat,
        "score_calculation": {
            "criticality_score": criticality_score,
            "fmea_score": fmea_score,
            "formula": "(Criticality + FMEA) / 2",
            "final_score": final_risk_score,
            "risk_level": risk_level
        }
    }


async def link_threat_to_failure_mode(user: dict, threat_id: str, failure_mode_id):
    """
    Link a threat to a failure mode from the FMEA library and recalculate the risk score.
    """
    from database import get_current_db_name
    current_db = get_current_db_name()
    logger.info(f"link_threat_to_failure_mode: Looking for threat {threat_id} in database {current_db}")

    threat = await _find_threat_scoped(user, threat_id)
    if not threat:
        logger.warning(f"link_threat_to_failure_mode: Threat {threat_id} NOT FOUND in database {current_db}")
        raise HTTPException(status_code=404, detail="Threat not found")
    await assert_threat_installation_scope(user, threat)

    matched_fm = await get_failure_mode_by_name_or_id(failure_mode_id=failure_mode_id)
    if not matched_fm:
        logger.warning(
            "link_threat_to_failure_mode: Failure mode %s NOT FOUND in database %s",
            failure_mode_id,
            current_db,
        )
        raise HTTPException(status_code=404, detail="Failure mode not found in library")

    failure_mode_data = {
        "id": matched_fm["id"],
        "failure_mode": matched_fm["failure_mode"],
        "category": matched_fm["category"],
        "equipment": matched_fm["equipment"],
        "severity": matched_fm["severity"],
        "occurrence": matched_fm["occurrence"],
        "detectability": matched_fm["detectability"],
        "rpn": matched_fm["rpn"],
        "recommended_actions": matched_fm.get("recommended_actions", [])
    }

    fmea_score = fmea_score_from_failure_mode(matched_fm) or 0

    criticality_data = threat.get("equipment_criticality_data")
    criticality_score = threat.get("criticality_score", 0)

    if criticality_data:
        safety_impact = criticality_data.get("safety_impact", 0) or 0
        production_impact = criticality_data.get("production_impact", 0) or 0
        environmental_impact = criticality_data.get("environmental_impact", 0) or 0
        reputation_impact = criticality_data.get("reputation_impact", 0) or 0

        if safety_impact or production_impact or environmental_impact or reputation_impact:
            criticality_score = compute_criticality_score(
                safety_impact, production_impact, environmental_impact, reputation_impact
            )

    installation_id = threat.get("installation_id") or ""
    risk_settings = await get_risk_settings_for_installation(installation_id)
    final_risk_score, risk_level = calculate_risk_score(
        criticality_score, fmea_score, risk_settings
    )

    update_data = {
        "failure_mode": matched_fm["failure_mode"],
        "failure_mode_id": matched_fm["id"],
        "failure_mode_data": failure_mode_data,
        "fmea_score": fmea_score,
        "criticality_score": criticality_score,
        "base_risk_score": fmea_score,
        "risk_score": final_risk_score,
        "risk_level": risk_level,
        "recommended_actions": matched_fm.get("recommended_actions", threat.get("recommended_actions", [])),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    await db.threats.update_one(
        merge_tenant_filter({"id": threat_id}, user),
        {"$set": update_data},
    )

    await update_all_ranks(user["id"], user=user)

    updated_threat = await _find_threat_scoped(user, threat_id)
    await _mirror_threat_observation(user, updated_threat)
    await _sync_threat_graph(user, updated_threat, label="threat_link_failure_mode")

    return {
        "message": f"Threat linked to failure mode: {matched_fm['failure_mode']}",
        "threat": updated_threat,
        "score_calculation": {
            "fmea_score": fmea_score,
            "criticality_score": criticality_score,
            "formula": "(Criticality + FMEA) / 2",
            "final_score": final_risk_score,
            "risk_level": risk_level
        }
    }


async def improve_threat_description(
    user: dict,
    threat_id: str,
    *,
    language: Optional[str] = None,
) -> dict:
    """
    Use AI to improve/enhance the observation description to be more professional
    and engineer-like in the user's UI language.
    """
    from services.ai_platform import execute_prompt

    threat = await _find_threat_scoped(user, threat_id)
    if not threat:
        raise HTTPException(status_code=404, detail="Observation not found")

    current_desc = threat.get("user_context") or threat.get("description") or ""
    if not current_desc.strip():
        raise HTTPException(status_code=400, detail="No description to improve")

    equipment_name = threat.get("asset") or ""
    failure_mode = threat.get("failure_mode") or ""
    ui_lang = (language or "en").lower()[:2]
    if ui_lang not in ("en", "nl", "de"):
        ui_lang = "en"
    output_language_names = {"en": "English", "nl": "Dutch", "de": "German"}
    output_language = output_language_names[ui_lang]

    try:
        from services.ai_platform import execute_prompt

        result = await execute_prompt(
            "threat.improve_description",
            user=user,
            user_message=(
                f"Equipment: {equipment_name}\nFailure mode: {failure_mode}\n\n"
                f"Original description: {current_desc[:1500]}"
            ),
            variables={"output_language": output_language},
            endpoint="threats.improve_description",
            model="gpt-4o-mini",
            temperature=0.3,
            max_tokens=300,
        )
        improved = (result["content"] or "").strip()

        improved = (improved or "").strip()
        if not improved:
            raise HTTPException(status_code=500, detail="AI returned empty response")

        await db.threats.update_one(
            merge_tenant_filter({"id": threat_id}, user),
            {"$set": {
                "user_context": improved,
                "description": improved,
                "ai_improved_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        updated = await _find_threat_scoped(user, threat_id)
        if updated:
            await _mirror_threat_observation(user, updated)
            await _sync_threat_graph(user, updated, label="threat_improve_description")

        return {
            "success": True,
            "improved_description": improved,
            "original_description": current_desc,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to improve description: %s", e)
        raise HTTPException(status_code=500, detail=f"AI processing failed: {str(e)}")
