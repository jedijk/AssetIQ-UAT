"""Threat service — list, detail, update, delete, and score recalculation."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from database import db
from repositories.threat_repository import delete_threat_cascade
from services.cache_service import cache
from services.criticality_score import compute_criticality_score
from services.tenant_schema import merge_tenant_filter, with_tenant_id
from services.threat_enrichment import THREAT_LIST_PROJECTION, enrich_threat_list
from services.threat_helpers import (
    _MITIGATED_THREAT_STATUSES,
    _find_threat_scoped,
    _installation_scoped_threat_query,
    _sync_threat_graph,
    assert_threat_installation_scope,
    get_failure_mode_by_name_or_id,
    get_threat_repo,
    normalize_threat_list_items,
)
from services.threat_score_service import (
    calculate_risk_score,
    fmea_score_from_failure_mode,
    get_risk_settings_for_installation,
    propagate_risk_to_linked_entities,
    update_all_ranks,
)
from utils.observation_localization import enrich_observations_for_ui

logger = logging.getLogger(__name__)

_threat_repo = get_threat_repo()


async def list_threats(
    user: dict,
    *,
    status: Optional[str] = None,
    limit: int = 100,
    language: Optional[str] = None,
) -> List[dict]:
    filters: Dict[str, Any] = {}
    if status:
        filters["status"] = status
    query = await _installation_scoped_threat_query(user, filters)
    if query is None:
        return []
    threats = await _threat_repo.find_many(
        query, user=user, projection=THREAT_LIST_PROJECTION, sort=[("rank", 1)], limit=limit,
    )
    threats = await enrich_threat_list(threats, language, user_id=user.get("id"))
    return normalize_threat_list_items(threats)


async def list_top_threats(
    user: dict,
    *,
    limit: int = 10,
    language: Optional[str] = None,
    exclude_mitigated: bool = False,
) -> List[dict]:
    status_filter: Dict[str, Any] = {"status": {"$ne": "Closed"}}
    if exclude_mitigated:
        status_filter = {"status": {"$nin": ["Closed", "closed", *_MITIGATED_THREAT_STATUSES]}}
    query = await _installation_scoped_threat_query(user, status_filter)
    if query is None:
        return []
    threats = await _threat_repo.find_many(
        query, user=user, projection=THREAT_LIST_PROJECTION, sort=[("risk_score", -1)], limit=limit,
    )
    threats = await enrich_threat_list(threats, language, user_id=user.get("id"))
    return normalize_threat_list_items(threats)


async def get_threat_detail(user: dict, threat_id: str, *, language: Optional[str] = None):
    try:
        threat = await _find_threat_scoped(user, threat_id)
        if not threat:
            raise HTTPException(status_code=404, detail="Threat not found")

        linked_equipment_id = threat.get("linked_equipment_id")
        asset_name = threat.get("asset")

        equipment_node = None
        try:
            if linked_equipment_id:
                equipment_node = cache.get_equipment(linked_equipment_id)
                if not equipment_node:
                    equipment_node = await db.equipment_nodes.find_one(
                        merge_tenant_filter({"id": linked_equipment_id}, user),
                        {"_id": 0},
                    )
                    if equipment_node:
                        cache.set_equipment(linked_equipment_id, equipment_node)
            elif asset_name:
                cache_key = f"name:{asset_name}"
                equipment_node = cache.get_equipment(cache_key)
                if not equipment_node:
                    equipment_node = await db.equipment_nodes.find_one(
                        merge_tenant_filter({"name": asset_name}, user),
                        {"_id": 0},
                    )
                    if equipment_node:
                        cache.set_equipment(cache_key, equipment_node)
        except Exception as e:
            logger.warning(f"Could not fetch equipment node for threat {threat_id}: {e}")

        failure_mode_name = threat.get("failure_mode")
        failure_mode_id = threat.get("failure_mode_id")
        fmea_score = threat.get("fmea_score", threat.get("base_risk_score", 50))
        fmea_changed = False

        if failure_mode_name and failure_mode_name != "Unknown":
            fm = await get_failure_mode_by_name_or_id(failure_mode_name, failure_mode_id)

            if fm:
                current_fmea = fmea_score_from_failure_mode(fm)
                if current_fmea is None:
                    current_fmea = fmea_score
                if current_fmea != fmea_score:
                    fmea_score = current_fmea
                    fmea_changed = True
                    logger.info(f"Auto-synced FMEA score for threat {threat_id}: {fmea_score}")

        new_criticality_score = threat.get("criticality_score", 0)
        criticality_level = threat.get("equipment_criticality", "low")
        criticality_data = threat.get("equipment_criticality_data")
        criticality_changed = False

        if equipment_node and equipment_node.get("criticality"):
            criticality = equipment_node["criticality"]
            safety_impact = criticality.get("safety_impact", 0) or 0
            production_impact = criticality.get("production_impact", 0) or 0
            environmental_impact = criticality.get("environmental_impact", 0) or 0
            reputation_impact = criticality.get("reputation_impact", 0) or 0

            calc_criticality_score = compute_criticality_score(
                safety_impact, production_impact, environmental_impact, reputation_impact
            )

            if calc_criticality_score != new_criticality_score:
                new_criticality_score = calc_criticality_score
                criticality_changed = True

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
                "criticality_score": new_criticality_score
            }

        installation_id = threat.get("installation_id") or (
            equipment_node.get("installation_id") if equipment_node else None
        )
        risk_settings = await get_risk_settings_for_installation(installation_id or "")
        expected_risk, expected_level = calculate_risk_score(
            new_criticality_score, fmea_score, risk_settings
        )
        risk_stale = int(threat.get("risk_score") or 0) != expected_risk

        if fmea_changed or criticality_changed or risk_stale:
            new_risk_score = expected_risk
            risk_level = expected_level
            update_data = {
                "risk_score": new_risk_score,
                "fmea_score": fmea_score,
                "criticality_score": new_criticality_score,
                "risk_level": risk_level,
                "equipment_criticality": criticality_level,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }

            if criticality_data:
                update_data["equipment_criticality_data"] = criticality_data

            if equipment_node:
                update_data["linked_equipment_id"] = equipment_node["id"]

            from services.work_signal_lifecycle import update_work_signal

            await update_work_signal(
                threat_id,
                user=user,
                set_fields=update_data,
                graph_label="threat_auto_sync",
            )

            threat.update(update_data)
            logger.info(
                "Auto-synced threat %s: risk=%s, crit=%s, fmea=%s",
                threat_id,
                new_risk_score,
                new_criticality_score,
                fmea_score,
            )
            await propagate_risk_to_linked_entities([threat_id], [threat], user=user)

        if isinstance(threat.get("risk_score"), float):
            threat["risk_score"] = int(threat["risk_score"])

        if equipment_node and equipment_node.get("tag"):
            threat["equipment_tag"] = equipment_node.get("tag")

        if "rank" not in threat:
            threat["rank"] = 1
        if "total_threats" not in threat:
            threat["total_threats"] = 1
        if "recommended_actions" not in threat:
            threat["recommended_actions"] = []
        if "occurrence_count" not in threat:
            threat["occurrence_count"] = 1
        if not threat.get("frequency"):
            threat["frequency"] = "Unknown"
        if not threat.get("likelihood"):
            threat["likelihood"] = "Unknown"
        if not threat.get("detectability"):
            threat["detectability"] = "Unknown"
        if not threat.get("equipment_type"):
            threat["equipment_type"] = "Equipment"
        if not threat.get("impact"):
            threat["impact"] = "Unknown"
        if threat.get("created_at") and not isinstance(threat["created_at"], str):
            threat["created_at"] = threat["created_at"].isoformat() if hasattr(threat["created_at"], 'isoformat') else str(threat["created_at"])

        localized = await enrich_observations_for_ui(
            [threat], language, user_id=user.get("id")
        )
        return localized[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching threat {threat_id}: {e}")
        raise HTTPException(status_code=500, detail="Error fetching threat data")


async def update_threat(user: dict, threat_id: str, update_data: dict) -> dict:
    threat = await _find_threat_scoped(user, threat_id)
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    await assert_threat_installation_scope(user, threat)

    update_data = {k: v for k, v in update_data.items() if v is not None}

    risk_fields = ["likelihood", "detectability", "impact", "frequency"]
    if any(f in update_data for f in risk_fields):
        likelihood = update_data.get("likelihood", threat.get("likelihood", "Possible"))
        detectability = update_data.get("detectability", threat.get("detectability", "Moderate"))

        likelihood_scores = {"Rare": 1, "Unlikely": 2, "Possible": 3, "Likely": 4, "Almost Certain": 5}
        detectability_scores = {"Easy": 1, "Moderate": 2, "Difficult": 3, "Very Difficult": 4, "Almost Impossible": 5}

        l_score = likelihood_scores.get(likelihood, 3)
        d_score = detectability_scores.get(detectability, 2)
        risk_score = l_score * d_score * 10

        if risk_score >= 150:
            risk_level = "Critical"
        elif risk_score >= 100:
            risk_level = "High"
        elif risk_score >= 50:
            risk_level = "Medium"
        else:
            risk_level = "Low"

        update_data["risk_score"] = risk_score
        update_data["risk_level"] = risk_level

    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        with_tenant_id(update_data, user)
        from services.work_signal_lifecycle import update_work_signal

        await update_work_signal(
            threat_id,
            user=user,
            set_fields=update_data,
            graph_label="threat_update",
        )

        if "status" in update_data:
            await update_all_ranks(user["id"], user=user)

        if any(f in update_data for f in ["risk_score", "risk_level", "fmea_rpn"]):
            updated_threat = await _find_threat_scoped(user, threat_id)
            await propagate_risk_to_linked_entities([threat_id], [updated_threat], user=user)

        cache.invalidate_stats(f"stats:{user['id']}")

    updated = await _find_threat_scoped(user, threat_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Threat not found")
    if isinstance(updated.get("risk_score"), float):
        updated["risk_score"] = int(updated["risk_score"])
    if update_data:
        from services.dashboard_read_model_hooks import notify_dashboard_data_changed

        await notify_dashboard_data_changed(user, reason="threat_update")
    return updated


async def delete_threat(
    user: dict,
    threat_id: str,
    *,
    delete_actions: bool = False,
    delete_investigations: bool = False,
):
    """Delete a threat/observation. Optionally delete linked Actions and Investigations."""
    threat = await _find_threat_scoped(user, threat_id)
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    await assert_threat_installation_scope(user, threat)

    try:
        result = await delete_threat_cascade(
            threat_id=threat_id,
            delete_actions=delete_actions,
            delete_investigations=delete_investigations,
            user=user,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "not_found":
            raise HTTPException(status_code=404, detail="Threat not found")
        if code == "forbidden":
            raise HTTPException(
                status_code=404,
                detail="Threat not found or you don't have permission to delete it",
            )
        raise HTTPException(status_code=500, detail="Failed to delete threat")

    await update_all_ranks(user["id"], user=user)
    cache.invalidate_stats(f"stats:{user['id']}")

    from services.dashboard_read_model_hooks import notify_dashboard_data_changed

    await notify_dashboard_data_changed(user, reason="threat_delete")

    return {
        "message": "Threat deleted",
        "deleted_actions": result["deleted_actions"],
        "deleted_investigations": result["deleted_investigations"],
    }


async def recalculate_all_threat_scores(user: dict):
    """
    Recalculate risk scores for all threats based on current criticality and FMEA data.
    Uses NEW METHODOLOGY: Risk Score = (Criticality × 0.75) + (FMEA × 0.25)
    """
    threats = await db.threats.find(
        merge_tenant_filter({"created_by": user["id"]}, user)
    ).to_list(1000)

    if not threats:
        return {"message": "No threats found", "updated_count": 0}

    equipment_nodes = await db.equipment_nodes.find(
        merge_tenant_filter({"created_by": user["id"]}, user),
        {"_id": 0, "id": 1, "name": 1, "criticality": 1},
    ).to_list(1000)

    asset_data = {}
    for node in equipment_nodes:
        name_lower = node["name"].lower()
        asset_data[name_lower] = {
            "id": node["id"],
            "name": node["name"],
            "criticality": node.get("criticality")
        }

    logger.info(f"Found {len(asset_data)} equipment nodes for matching")

    updated_count = 0
    linked_count = 0

    for threat in threats:
        failure_mode_name = threat.get("failure_mode")
        failure_mode_id = threat.get("failure_mode_id")
        fmea_score = threat.get("fmea_score", threat.get("base_risk_score", 50))

        if failure_mode_name and failure_mode_name != "Unknown":
            fm = await get_failure_mode_by_name_or_id(failure_mode_name, failure_mode_id)
            if fm:
                from_fm = fmea_score_from_failure_mode(fm)
                if from_fm is not None:
                    fmea_score = from_fm

        asset_name = threat.get("asset", "")
        asset_name_lower = asset_name.lower() if asset_name else ""

        linked_equipment_id = threat.get("linked_equipment_id")
        criticality_level = "low"
        criticality_score = 0
        criticality_data = None

        if asset_name_lower and asset_name_lower in asset_data:
            node_info = asset_data[asset_name_lower]
            linked_equipment_id = node_info["id"]
            linked_count += 1
            crit = node_info.get("criticality")
            if crit:
                criticality_level = crit.get("level", "low")

                safety_impact = crit.get("safety_impact", 0) or 0
                production_impact = crit.get("production_impact", 0) or 0
                environmental_impact = crit.get("environmental_impact", 0) or 0
                reputation_impact = crit.get("reputation_impact", 0) or 0

                criticality_score = compute_criticality_score(
                    safety_impact, production_impact, environmental_impact, reputation_impact
                )

                criticality_data = {
                    "safety_impact": safety_impact,
                    "production_impact": production_impact,
                    "environmental_impact": environmental_impact,
                    "reputation_impact": reputation_impact,
                    "level": criticality_level,
                    "criticality_score": criticality_score
                }

        installation_id = threat.get("installation_id") or ""
        risk_settings = await get_risk_settings_for_installation(installation_id)
        final_risk_score, risk_level = calculate_risk_score(
            criticality_score, fmea_score, risk_settings
        )

        update_fields = {
            "risk_score": final_risk_score,
            "fmea_score": fmea_score,
            "criticality_score": criticality_score,
            "base_risk_score": fmea_score,
            "risk_level": risk_level,
            "equipment_criticality": criticality_level
        }
        if linked_equipment_id:
            update_fields["linked_equipment_id"] = linked_equipment_id
        if criticality_data:
            update_fields["equipment_criticality_data"] = criticality_data

        from services.work_signal_lifecycle import update_work_signal

        await update_work_signal(
            threat["id"],
            user=user,
            set_fields=update_fields,
            graph_label="threat_recalculate",
            sync_graph=False,
        )
        updated_count += 1

    logger.info(f"Updated {updated_count} threats, linked {linked_count} to equipment")

    await update_all_ranks(user["id"], user=user)

    threat_ids = [t["id"] for t in threats]
    actions_updated, inv_updated = await propagate_risk_to_linked_entities(threat_ids, user=user)

    return {
        "message": f"Successfully recalculated {updated_count} threat scores",
        "updated_count": updated_count,
        "actions_propagated": actions_updated,
        "investigations_propagated": inv_updated
    }
