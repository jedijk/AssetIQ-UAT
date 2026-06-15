"""
Threat score propagation and bulk recalculation helpers.

Extracted from threat_score_service to keep core scoring/rank logic focused.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from database import db
from services.criticality_score import compute_criticality_score
from services.tenant_schema import merge_tenant_filter
from utils.mongo_regex import exact_case_insensitive

logger = logging.getLogger(__name__)


def _tenant_user_from_threats(threats: Optional[list]) -> Optional[dict]:
    """Derive tenant context from threat docs when caller did not pass user."""
    if not threats:
        return None
    for t in threats:
        tid = t.get("tenant_id")
        if tid:
            return {"company_id": tid}
    return None


async def propagate_risk_to_linked_entities(
    threat_ids: list,
    threats: list = None,
    user: Optional[dict] = None,
):
    """
    Propagate updated risk_score, rpn, and risk_level from threats
    to all linked central_actions and investigations.
    """
    if not threat_ids:
        return 0, 0

    if user is None:
        user = _tenant_user_from_threats(threats)

    now = datetime.now(timezone.utc).isoformat()

    if threats:
        threat_map = {}
        for t in threats:
            tid = t.get("id") or t.get("_id")
            if tid:
                threat_map[str(tid)] = t
    else:
        threat_docs = await db.threats.find(
            merge_tenant_filter({"id": {"$in": threat_ids}}, user),
            {"_id": 0, "id": 1, "risk_score": 1, "risk_level": 1, "fmea_rpn": 1, "fmea_score": 1},
        ).to_list(len(threat_ids))
        threat_map = {t["id"]: t for t in threat_docs}

    actions_updated = 0
    actions = await db.central_actions.find(
        merge_tenant_filter(
            {
                "$or": [
                    {"threat_id": {"$in": threat_ids}},
                    {"source_type": "threat", "source_id": {"$in": threat_ids}},
                ]
            },
            user,
        ),
        {"_id": 0, "id": 1, "threat_id": 1, "source_type": 1, "source_id": 1},
    ).to_list(10000)

    for action in actions:
        action_threat_id = action.get("threat_id") or (
            action.get("source_id") if action.get("source_type") == "threat" else None
        )
        threat = threat_map.get(action_threat_id)
        if threat:
            await db.central_actions.update_one(
                merge_tenant_filter({"id": action["id"]}, user),
                {
                    "$set": {
                        "rpn": threat.get("fmea_rpn") or threat.get("rpn"),
                        "risk_score": threat.get("risk_score"),
                        "risk_level": threat.get("risk_level"),
                        "updated_at": now,
                    }
                },
            )
            actions_updated += 1

    investigations = await db.investigations.find(
        merge_tenant_filter({"threat_id": {"$in": threat_ids}}, user),
        {"_id": 0, "id": 1, "threat_id": 1},
    ).to_list(10000)

    inv_ids = [inv["id"] for inv in investigations]
    if inv_ids:
        inv_actions = await db.central_actions.find(
            merge_tenant_filter(
                {"source_type": "investigation", "source_id": {"$in": inv_ids}},
                user,
            ),
            {"_id": 0, "id": 1, "source_id": 1},
        ).to_list(10000)

        inv_threat_map = {inv["id"]: inv["threat_id"] for inv in investigations}

        for action in inv_actions:
            inv_threat_id = inv_threat_map.get(action.get("source_id"))
            threat = threat_map.get(inv_threat_id) if inv_threat_id else None
            if threat:
                await db.central_actions.update_one(
                    merge_tenant_filter({"id": action["id"]}, user),
                    {
                        "$set": {
                            "rpn": threat.get("fmea_rpn") or threat.get("rpn"),
                            "risk_score": threat.get("risk_score"),
                            "risk_level": threat.get("risk_level"),
                            "updated_at": now,
                        }
                    },
                )
                actions_updated += 1

    inv_updated = len(investigations)
    logger.info(
        "Propagated risk to %s actions, %s investigations for %s threats",
        actions_updated,
        inv_updated,
        len(threat_ids),
    )
    return actions_updated, inv_updated


async def recalculate_threat_scores_for_failure_mode(
    failure_mode_name: str,
    new_severity: int,
    new_occurrence: int,
    new_detectability: int,
    user: Optional[dict] = None,
):
    from services.threat_score_service import (
        calculate_risk_score,
        get_risk_settings_for_installation,
        update_all_ranks,
    )

    query = merge_tenant_filter(
        {"failure_mode": exact_case_insensitive(failure_mode_name)},
        user,
    )
    threats = await db.threats.find(query).to_list(1000)

    if not threats:
        return 0

    new_fmea_score = min(100, int((new_severity * new_occurrence * new_detectability) / 10))

    updated_count = 0
    users_updated = set()
    settings_cache = {}

    for threat in threats:
        installation_id = threat.get("installation_id")

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

            criticality_score = compute_criticality_score(
                safety_impact, production_impact, environmental_impact, reputation_impact
            )

        final_risk_score, risk_level = calculate_risk_score(
            criticality_score, new_fmea_score, risk_settings
        )

        await db.threats.update_one(
            {"id": threat["id"]},
            {
                "$set": {
                    "risk_score": final_risk_score,
                    "fmea_score": new_fmea_score,
                    "criticality_score": criticality_score,
                    "base_risk_score": new_fmea_score,
                    "risk_level": risk_level,
                    "risk_settings_used": {
                        "criticality_weight": risk_settings["criticality_weight"],
                        "fmea_weight": risk_settings["fmea_weight"],
                        "installation_id": installation_id,
                    },
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )
        updated_count += 1
        users_updated.add(threat.get("created_by"))

    threat_ids = [t["id"] for t in threats]
    await propagate_risk_to_linked_entities(threat_ids, user=user)

    for uid in users_updated:
        if uid:
            await update_all_ranks(uid, user=user)

    return updated_count


async def recalculate_all_for_installation(
    installation_id: str,
    user: Optional[dict] = None,
) -> dict:
    """Recalculate all risk scores for an installation when settings change."""
    from services.threat_score_service import (
        calculate_risk_score,
        get_risk_settings_for_installation,
        update_all_ranks,
    )

    if not installation_id:
        return {"error": "Installation ID required"}

    risk_settings = await get_risk_settings_for_installation(installation_id)

    query = merge_tenant_filter({"installation_id": installation_id}, user)
    threats = await db.threats.find(query).to_list(10000)

    threats_updated = 0
    users_updated = set()

    for threat in threats:
        criticality_score = threat.get("criticality_score", 0)
        fmea_score = threat.get("fmea_score", threat.get("base_risk_score", 50))

        final_risk_score, risk_level = calculate_risk_score(
            criticality_score, fmea_score, risk_settings
        )

        await db.threats.update_one(
            {"id": threat["id"]},
            {
                "$set": {
                    "risk_score": final_risk_score,
                    "risk_level": risk_level,
                    "risk_settings_used": {
                        "criticality_weight": risk_settings["criticality_weight"],
                        "fmea_weight": risk_settings["fmea_weight"],
                        "installation_id": installation_id,
                    },
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )
        threats_updated += 1
        users_updated.add(threat.get("created_by"))

    actions_updated = 0
    if threats:
        threat_ids = [t["id"] for t in threats]
        actions = await db.central_actions.find(
            merge_tenant_filter({"threat_id": {"$in": threat_ids}}, user),
        ).to_list(10000)

        for action in actions:
            parent_threat = next((t for t in threats if t["id"] == action.get("threat_id")), None)
            if parent_threat:
                crit_score = parent_threat.get("criticality_score", 0)
                fmea = parent_threat.get("fmea_score", 50)
                new_score, _ = calculate_risk_score(crit_score, fmea, risk_settings)

                await db.central_actions.update_one(
                    merge_tenant_filter({"id": action["id"]}, user),
                    {
                        "$set": {
                            "threat_risk_score": new_score,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                        }
                    },
                )
                actions_updated += 1

    for uid in users_updated:
        if uid:
            await update_all_ranks(uid, user=user)

    return {
        "installation_id": installation_id,
        "threats_updated": threats_updated,
        "actions_updated": actions_updated,
        "settings_applied": risk_settings,
    }
