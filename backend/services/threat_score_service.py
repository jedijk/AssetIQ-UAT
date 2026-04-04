"""
Threat score calculation and rank management helpers.
Used by threat routes and equipment routes when scores need recalculation.
"""
import logging
from datetime import datetime, timezone

from database import db
from failure_modes import FAILURE_MODES_LIBRARY
from models.risk_settings import DEFAULT_RISK_SETTINGS

logger = logging.getLogger(__name__)


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
    
    final_risk_score = int((criticality_score * crit_weight) + (fmea_score * fmea_weight))
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


async def calculate_rank(risk_score: int, user_id: str) -> tuple:
    total = await db.threats.count_documents({"created_by": user_id, "status": {"$ne": "Closed"}})
    higher = await db.threats.count_documents({
        "created_by": user_id,
        "status": {"$ne": "Closed"},
        "risk_score": {"$gt": risk_score}
    })
    return higher + 1, total + 1


async def update_all_ranks(user_id: str):
    threats = await db.threats.find(
        {"created_by": user_id, "status": {"$ne": "Closed"}},
        {"_id": 0}
    ).sort("risk_score", -1).to_list(1000)

    total = len(threats)
    for idx, threat in enumerate(threats):
        await db.threats.update_one(
            {"id": threat["id"]},
            {"$set": {"rank": idx + 1, "total_threats": total}}
        )


async def recalculate_threat_scores_for_asset(asset_name: str, user_id: str, new_criticality: dict = None, equipment_node_id: str = None, installation_id: str = None):
    query_conditions = [{"asset": asset_name, "created_by": user_id}]
    if equipment_node_id:
        query_conditions.append({"linked_equipment_id": equipment_node_id, "created_by": user_id})

    threats = await db.threats.find({"$or": query_conditions}).to_list(1000)
    if not threats:
        return 0

    # Get installation-specific risk settings
    risk_settings = await get_risk_settings_for_installation(installation_id)

    if new_criticality:
        safety_impact = new_criticality.get("safety_impact", 0) or 0
        production_impact = new_criticality.get("production_impact", 0) or 0
        environmental_impact = new_criticality.get("environmental_impact", 0) or 0
        reputation_impact = new_criticality.get("reputation_impact", 0) or 0

        criticality_score = (
            (safety_impact * 25) +
            (production_impact * 20) +
            (environmental_impact * 15) +
            (reputation_impact * 10)
        ) / 3.5
        criticality_score = min(100, int(criticality_score))

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
            for fm in FAILURE_MODES_LIBRARY:
                if fm["failure_mode"].lower() == failure_mode_name.lower():
                    fmea_score = min(100, int(fm["rpn"] / 10))
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

    await update_all_ranks(user_id)
    return updated_count


async def recalculate_threat_scores_for_failure_mode(failure_mode_name: str, new_severity: int, new_occurrence: int, new_detectability: int):
    threats = await db.threats.find(
        {"failure_mode": {"$regex": f"^{failure_mode_name}$", "$options": "i"}}
    ).to_list(1000)

    if not threats:
        return 0

    new_fmea_score = min(100, int((new_severity * new_occurrence * new_detectability) / 10))

    updated_count = 0
    users_updated = set()
    
    # Cache settings by installation to avoid repeated DB calls
    settings_cache = {}

    for threat in threats:
        # Get installation ID for this threat
        installation_id = threat.get("installation_id")
        
        # Get or cache settings for this installation
        if installation_id not in settings_cache:
            settings_cache[installation_id] = await get_risk_settings_for_installation(installation_id)
        risk_settings = settings_cache[installation_id]
        
        criticality_score = threat.get("criticality_score", 0)
        criticality_data = threat.get("equipment_criticality_data")

        if criticality_data and criticality_score == 0:
            safety_impact = criticality_data.get("safety_impact", 0) or 0
            production_impact = criticality_data.get("production_impact", 0) or 0
            environmental_impact = criticality_data.get("environmental_impact", 0) or 0
            reputation_impact = criticality_data.get("reputation_impact", 0) or 0

            criticality_score = (
                (safety_impact * 25) +
                (production_impact * 20) +
                (environmental_impact * 15) +
                (reputation_impact * 10)
            ) / 3.5
            criticality_score = min(100, int(criticality_score))

        # Use installation-specific settings
        final_risk_score, risk_level = calculate_risk_score(criticality_score, new_fmea_score, risk_settings)

        await db.threats.update_one(
            {"id": threat["id"]},
            {"$set": {
                "risk_score": final_risk_score,
                "fmea_score": new_fmea_score,
                "criticality_score": criticality_score,
                "base_risk_score": new_fmea_score,
                "risk_level": risk_level,
                "risk_settings_used": {
                    "criticality_weight": risk_settings["criticality_weight"],
                    "fmea_weight": risk_settings["fmea_weight"],
                    "installation_id": installation_id
                },
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        updated_count += 1
        users_updated.add(threat.get("created_by"))

    for user_id in users_updated:
        if user_id:
            await update_all_ranks(user_id)

    return updated_count


async def recalculate_all_for_installation(installation_id: str) -> dict:
    """
    Recalculate all risk scores for an installation when settings change.
    Updates: observations (threats), actions, and investigations.
    """
    if not installation_id:
        return {"error": "Installation ID required"}
    
    risk_settings = await get_risk_settings_for_installation(installation_id)
    
    # Find all threats linked to this installation
    threats = await db.threats.find({
        "installation_id": installation_id
    }).to_list(10000)
    
    threats_updated = 0
    users_updated = set()
    
    for threat in threats:
        criticality_score = threat.get("criticality_score", 0)
        fmea_score = threat.get("fmea_score", threat.get("base_risk_score", 50))
        
        # Recalculate with new settings
        final_risk_score, risk_level = calculate_risk_score(criticality_score, fmea_score, risk_settings)
        
        await db.threats.update_one(
            {"id": threat["id"]},
            {"$set": {
                "risk_score": final_risk_score,
                "risk_level": risk_level,
                "risk_settings_used": {
                    "criticality_weight": risk_settings["criticality_weight"],
                    "fmea_weight": risk_settings["fmea_weight"],
                    "installation_id": installation_id
                },
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        threats_updated += 1
        users_updated.add(threat.get("created_by"))
    
    # Update actions linked to these threats
    actions_updated = 0
    if threats:
        threat_ids = [t["id"] for t in threats]
        actions = await db.central_actions.find({
            "threat_id": {"$in": threat_ids}
        }).to_list(10000)
        
        for action in actions:
            # Get the parent threat's new risk score
            parent_threat = next((t for t in threats if t["id"] == action.get("threat_id")), None)
            if parent_threat:
                new_threat_risk = parent_threat.get("risk_score", 0)
                # Recalculate with new settings
                crit_score = parent_threat.get("criticality_score", 0)
                fmea = parent_threat.get("fmea_score", 50)
                new_score, _ = calculate_risk_score(crit_score, fmea, risk_settings)
                
                await db.central_actions.update_one(
                    {"id": action["id"]},
                    {"$set": {
                        "threat_risk_score": new_score,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                actions_updated += 1
    
    # Update ranks for all affected users
    for user_id in users_updated:
        if user_id:
            await update_all_ranks(user_id)
    
    return {
        "installation_id": installation_id,
        "threats_updated": threats_updated,
        "actions_updated": actions_updated,
        "settings_applied": risk_settings
    }

