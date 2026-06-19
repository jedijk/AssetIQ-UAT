"""
Threat score calculation and rank management helpers.
Used by threat routes and equipment routes when scores need recalculation.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from database import db
from failure_modes import FAILURE_MODES_LIBRARY
from models.risk_settings import DEFAULT_RISK_SETTINGS
from services.criticality_score import compute_criticality_score
from services.tenant_schema import merge_tenant_filter
from utils.mongo_regex import exact_case_insensitive
from services.threat_score_propagation import propagate_risk_to_linked_entities

logger = logging.getLogger(__name__)


def _round_half_up(value: float) -> int:
    """Round like JavaScript Math.round (half away from zero), not Python banker's round."""
    if value >= 0:
        return int(value + 0.5)
    return int(value - 0.5)


def fmea_score_from_failure_mode(failure_mode: Optional[dict]) -> Optional[int]:
    """
    FMEA contribution (0–100) from severity × occurrence × detectability / 10,
    matching the observation workspace score calculation modal.
    """
    if not failure_mode or not isinstance(failure_mode, dict):
        return None
    severity = failure_mode.get("severity")
    occurrence = failure_mode.get("occurrence")
    detectability = failure_mode.get("detectability")
    if severity is not None and occurrence is not None and detectability is not None:
        try:
            return min(
                100,
                max(
                    0,
                    _round_half_up(
                        (float(severity) * float(occurrence) * float(detectability)) / 10
                    ),
                ),
            )
        except (TypeError, ValueError):
            pass
    rpn = failure_mode.get("rpn")
    if rpn is not None:
        try:
            return min(100, max(0, _round_half_up(float(rpn) / 10)))
        except (TypeError, ValueError):
            pass
    return None


async def get_risk_settings_for_installation(installation_id: str) -> dict:
    """Get risk calculation settings for an installation, or defaults if not set."""
    if not installation_id:
        return DEFAULT_RISK_SETTINGS.copy()
    
    settings = await db.risk_settings.find_one(
        {"installation_id": installation_id},
        {"_id": 0}
    )
    
    if settings:
        return {
            "criticality_weight": settings.get("criticality_weight", DEFAULT_RISK_SETTINGS["criticality_weight"]),
            "fmea_weight": settings.get("fmea_weight", DEFAULT_RISK_SETTINGS["fmea_weight"]),
            "critical_threshold": settings.get("critical_threshold", DEFAULT_RISK_SETTINGS["critical_threshold"]),
            "high_threshold": settings.get("high_threshold", DEFAULT_RISK_SETTINGS["high_threshold"]),
            "medium_threshold": settings.get("medium_threshold", DEFAULT_RISK_SETTINGS["medium_threshold"]),
        }
    
    return DEFAULT_RISK_SETTINGS.copy()


def calculate_risk_score(criticality_score: int, fmea_score: int, settings: dict) -> tuple:
    """Calculate final risk score and level based on settings."""
    crit_weight = settings.get("criticality_weight", 0.75)
    fmea_weight = settings.get("fmea_weight", 0.25)

    weighted = (criticality_score * crit_weight) + (fmea_score * fmea_weight)
    final_risk_score = _round_half_up(weighted)
    final_risk_score = min(100, max(0, final_risk_score))
    
    critical_threshold = settings.get("critical_threshold", 70)
    high_threshold = settings.get("high_threshold", 50)
    medium_threshold = settings.get("medium_threshold", 30)
    
    if final_risk_score >= critical_threshold:
        risk_level = "Critical"
    elif final_risk_score >= high_threshold:
        risk_level = "High"
    elif final_risk_score >= medium_threshold:
        risk_level = "Medium"
    else:
        risk_level = "Low"
    
    return final_risk_score, risk_level


async def calculate_rank(risk_score: int, user_id: str, user: Optional[dict] = None) -> tuple:
    base = {"created_by": user_id, "status": {"$ne": "Closed"}}
    query = merge_tenant_filter(base, user)
    total = await db.threats.count_documents(query)
    higher = await db.threats.count_documents({**query, "risk_score": {"$gt": risk_score}})
    return higher + 1, total + 1


async def update_all_ranks(user_id: str, user: Optional[dict] = None):
    query = merge_tenant_filter({"created_by": user_id, "status": {"$ne": "Closed"}}, user)
    threats = await db.threats.find(query, {"_id": 0}).sort("risk_score", -1).to_list(1000)

    total = len(threats)
    for idx, threat in enumerate(threats):
        await db.threats.update_one(
            {"id": threat["id"]},
            {"$set": {"rank": idx + 1, "total_threats": total}}
        )


async def recalculate_threat_scores_for_asset(asset_name: str, user_id: str, new_criticality: dict = None, equipment_node_id: str = None, installation_id: str = None, user: Optional[dict] = None):
    # Threats are shared tenant entities - match by asset name or equipment node ID without created_by filter
    query_conditions = [{"asset": asset_name}]
    if equipment_node_id:
        query_conditions.append({"linked_equipment_id": equipment_node_id})

    query = merge_tenant_filter({"$or": query_conditions}, user)
    threats = await db.threats.find(query).to_list(1000)
    if not threats:
        return 0

    # Get installation-specific risk settings
    risk_settings = await get_risk_settings_for_installation(installation_id)

    if new_criticality:
        safety_impact = new_criticality.get("safety_impact", 0) or 0
        production_impact = new_criticality.get("production_impact", 0) or 0
        environmental_impact = new_criticality.get("environmental_impact", 0) or 0
        reputation_impact = new_criticality.get("reputation_impact", 0) or 0

        criticality_score = compute_criticality_score(
            safety_impact, production_impact, environmental_impact, reputation_impact
        )

        max_impact = max(safety_impact, production_impact, environmental_impact, reputation_impact)
        if max_impact >= 5:
            criticality_level = "safety_critical"
        elif max_impact >= 4:
            criticality_level = "production_critical"
        elif max_impact >= 3:
            criticality_level = "medium"
        else:
            criticality_level = "low"

        criticality_data = {
            "safety_impact": safety_impact,
            "production_impact": production_impact,
            "environmental_impact": environmental_impact,
            "reputation_impact": reputation_impact,
            "level": criticality_level,
            "criticality_score": criticality_score
        }
    else:
        criticality_score = 0
        criticality_level = "low"
        criticality_data = None

    updated_count = 0
    for threat in threats:
        fmea_score = threat.get("fmea_score", threat.get("base_risk_score", 50))

        failure_mode_name = threat.get("failure_mode")
        if failure_mode_name and failure_mode_name != "Unknown":
            # First check database for user-created failure modes
            db_fm = await db.failure_modes.find_one({"name": exact_case_insensitive(failure_mode_name)})
            if db_fm:
                from_fm = fmea_score_from_failure_mode(db_fm)
                if from_fm is not None:
                    fmea_score = from_fm
            else:
                # Fall back to static library
                for fm in FAILURE_MODES_LIBRARY:
                    if fm["failure_mode"].lower() == failure_mode_name.lower():
                        from_fm = fmea_score_from_failure_mode(fm)
                        if from_fm is not None:
                            fmea_score = from_fm
                        break

        # Use installation-specific settings for calculation
        final_risk_score, risk_level = calculate_risk_score(criticality_score, fmea_score, risk_settings)

        update_data = {
            "risk_score": final_risk_score,
            "criticality_score": criticality_score,
            "fmea_score": fmea_score,
            "base_risk_score": fmea_score,
            "risk_level": risk_level,
            "equipment_criticality": criticality_level,
            "risk_settings_used": {
                "criticality_weight": risk_settings["criticality_weight"],
                "fmea_weight": risk_settings["fmea_weight"],
                "installation_id": installation_id
            },
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

        if criticality_data:
            update_data["equipment_criticality_data"] = criticality_data

        await db.threats.update_one({"id": threat["id"]}, {"$set": update_data})
        updated_count += 1

    # Propagate updated risk scores to linked actions and investigations
    threat_ids = [t["id"] for t in threats]
    await propagate_risk_to_linked_entities(threat_ids, user=user)

    await update_all_ranks(user_id, user=user)
    return updated_count


from services.threat_score_propagation import (  # noqa: E402 — re-export for callers
    recalculate_all_for_installation,
    recalculate_threat_scores_for_failure_mode,
)

