"""
Threat service — Wave 5/6 convergence.

Installation-scoped reads and CRUD via ThreatRepository.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

from fastapi import HTTPException

from database import db, failure_modes_service, installation_filter
from failure_modes import FAILURE_MODES_LIBRARY
from investigation_models import InvestigationStatus
from repositories.equipment_repository import EquipmentRepository
from repositories.threat_repository import ThreatRepository, delete_threat_cascade
from services.cache_service import cache
from services.criticality_score import compute_criticality_score
from services.tenant_schema import merge_tenant_filter, with_tenant_id
from services.threat_enrichment import THREAT_LIST_PROJECTION, enrich_threat_list
from services.threat_score_service import (
    calculate_risk_score,
    fmea_score_from_failure_mode,
    get_risk_settings_for_installation,
    propagate_risk_to_linked_entities,
    recalculate_threat_scores_for_asset,
    recalculate_threat_scores_for_failure_mode,
    update_all_ranks,
)
from utils.observation_localization import enrich_observations_for_ui

logger = logging.getLogger(__name__)

_threat_repo = ThreatRepository(db)
_equipment_repo = EquipmentRepository(db)


async def _mirror_threat_observation(user: dict, threat: dict) -> None:
    """Best-effort dual-write threat updates to observations collection."""
    try:
        from services.threat_observation_bridge import sync_threat_mirror
        await sync_threat_mirror(threat, user=user)
    except Exception as exc:
        logger.warning("Threat observation mirror failed: %s", exc)


async def _sync_threat_graph(user: dict, threat: dict, *, label: str) -> None:
    """Best-effort graph sync for UI threat CRUD paths."""
    threat_id = threat.get("id")
    if not threat_id:
        return
    try:
        from services.reliability_graph import dispatch_graph_sync
        from services.tenant_schema import tenant_id_from_user

        await dispatch_graph_sync(
            "sync_threat_edges",
            label,
            threat_id=threat_id,
            equipment_id=threat.get("linked_equipment_id"),
            failure_mode_id=threat.get("failure_mode_id"),
            tenant_id=tenant_id_from_user(user) or threat.get("tenant_id"),
        )
    except Exception as exc:
        logger.warning("Threat graph sync failed (%s): %s", label, exc)


async def _find_threat_scoped(user: dict, threat_id: str, *, projection: Optional[dict] = None) -> Optional[dict]:
    filt = merge_tenant_filter({"id": threat_id}, user)
    return await db.threats.find_one(filt, projection or {"_id": 0})

FAILURE_MODES_BY_ID = {fm["id"]: fm for fm in FAILURE_MODES_LIBRARY if "id" in fm}
FAILURE_MODES_BY_NAME = {fm["failure_mode"].lower(): fm for fm in FAILURE_MODES_LIBRARY if "failure_mode" in fm}


def _fm_serialized_to_threat_format(db_fm: dict) -> dict:
    effects = db_fm.get("potential_effects") or []
    causes = db_fm.get("potential_causes") or []
    return {
        "id": db_fm.get("id"),
        "failure_mode": db_fm.get("failure_mode", ""),
        "category": db_fm.get("category", ""),
        "equipment": db_fm.get("equipment", ""),
        "severity": db_fm.get("severity", 5),
        "occurrence": db_fm.get("occurrence", 5),
        "detectability": db_fm.get("detectability", 5),
        "rpn": db_fm.get("rpn", 125),
        "recommended_actions": db_fm.get("recommended_actions", []),
        "mechanism": db_fm.get("mechanism", ""),
        "effect": effects[0] if effects else db_fm.get("effect", ""),
        "cause": causes[0] if causes else db_fm.get("cause", ""),
    }


async def get_failure_mode_by_name_or_id(failure_mode_name: str = None, failure_mode_id: str = None):
    if failure_mode_id is not None:
        db_fm = await failure_modes_service.get_by_id(str(failure_mode_id))
        if db_fm:
            return _fm_serialized_to_threat_format(db_fm)
        try:
            int_id = int(failure_mode_id)
            if int_id in FAILURE_MODES_BY_ID:
                return FAILURE_MODES_BY_ID[int_id]
        except (TypeError, ValueError):
            pass
    if failure_mode_name:
        db_fm = await failure_modes_service.get_by_name(failure_mode_name)
        if db_fm:
            return _fm_serialized_to_threat_format(db_fm)
        if failure_mode_name.lower() in FAILURE_MODES_BY_NAME:
            return FAILURE_MODES_BY_NAME[failure_mode_name.lower()]
    return None


async def assert_threat_installation_scope(user: dict, threat: dict) -> None:
    eq_id = threat.get("linked_equipment_id")
    if eq_id:
        await installation_filter.assert_user_can_access_equipment(user, eq_id)
        return
    if installation_filter.is_owner(user):
        return
    if threat.get("created_by") == user.get("id"):
        return
    raise HTTPException(status_code=403, detail="Threat not in your assigned installations")


def normalize_threat_list_items(threats: List[dict]) -> List[dict]:
    total_count = len(threats)
    for idx, t in enumerate(threats):
        if isinstance(t.get("risk_score"), float):
            t["risk_score"] = int(t["risk_score"])
        for field, default in (
            ("equipment_type", "Equipment"),
            ("impact", "Unknown"),
            ("frequency", "Unknown"),
            ("likelihood", "Unknown"),
            ("detectability", "Unknown"),
        ):
            if not t.get(field):
                t[field] = default
        t.setdefault("rank", idx + 1)
        t.setdefault("total_threats", total_count)
        t.setdefault("recommended_actions", [])
        t.setdefault("action_plan_count", 0)
        t.setdefault("occurrence_count", 1)
        created_at = t.get("created_at")
        if created_at and not isinstance(created_at, str):
            t["created_at"] = (
                created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at)
            )
    return threats


async def _installation_scoped_threat_query(
    user: dict,
    additional_filters: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    installation_ids = await installation_filter.get_user_installation_ids(user)
    if not installation_ids:
        return None
    equipment_ids, equipment_names = await asyncio.gather(
        installation_filter.get_all_equipment_ids_for_installations(installation_ids, user["id"]),
        installation_filter.get_equipment_names_for_installations(installation_ids, user["id"]),
    )
    query = installation_filter.build_threat_filter(
        user["id"], equipment_ids, equipment_names, additional_filters or {}
    )
    if query.get("_impossible"):
        return None
    return merge_tenant_filter(query, user)


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


_MITIGATED_THREAT_STATUSES = ["Mitigated", "mitigated"]


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
        # Remove created_by filter - threats are shared tenant entities
        # Access is controlled by installation assignment, not ownership
        threat = await db.threats.find_one(
            {"id": threat_id},
            {"_id": 0}
        )
        if not threat:
            raise HTTPException(status_code=404, detail="Threat not found")
        
        # Auto-sync criticality from linked equipment if available
        linked_equipment_id = threat.get("linked_equipment_id")
        asset_name = threat.get("asset")
        
        # Try to find linked equipment node (shared entity - no created_by filter)
        equipment_node = None
        try:
            if linked_equipment_id:
                # Check cache first
                equipment_node = cache.get_equipment(linked_equipment_id)
                if not equipment_node:
                    equipment_node = await db.equipment_nodes.find_one(
                        {"id": linked_equipment_id},
                        {"_id": 0}
                    )
                    if equipment_node:
                        cache.set_equipment(linked_equipment_id, equipment_node)
            elif asset_name:
                # Fallback: try to find by asset name (cache by name)
                cache_key = f"name:{asset_name}"
                equipment_node = cache.get_equipment(cache_key)
                if not equipment_node:
                    equipment_node = await db.equipment_nodes.find_one(
                        {"name": asset_name},
                        {"_id": 0}
                    )
                    if equipment_node:
                        cache.set_equipment(cache_key, equipment_node)
        except Exception as e:
            logger.warning(f"Could not fetch equipment node for threat {threat_id}: {e}")
        
        # Auto-sync FMEA score from linked failure mode
        failure_mode_name = threat.get("failure_mode")
        failure_mode_id = threat.get("failure_mode_id")
        fmea_score = threat.get("fmea_score", threat.get("base_risk_score", 50))
        fmea_changed = False
        
        if failure_mode_name and failure_mode_name != "Unknown":
            # Check database first, then static library
            fm = await get_failure_mode_by_name_or_id(failure_mode_name, failure_mode_id)
            
            if fm:
                from services.threat_score_service import fmea_score_from_failure_mode

                current_fmea = fmea_score_from_failure_mode(fm)
                if current_fmea is None:
                    current_fmea = fmea_score
                if current_fmea != fmea_score:
                    fmea_score = current_fmea
                    fmea_changed = True
                    logger.info(f"Auto-synced FMEA score for threat {threat_id}: {fmea_score}")
        
        # Calculate criticality score from equipment
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
            
            # Determine criticality level
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
        
        # Reconcile stale risk_score with current criticality + FMEA (matches score modal).
        from services.threat_score_service import calculate_risk_score, get_risk_settings_for_installation

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
            # Calculate new risk score: (Criticality × 0.75) + (Likelihood Score × 0.25)
            # Update the threat in database
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
            
            await db.threats.update_one(
            merge_tenant_filter({"id": threat_id}, user),
            {"$set": update_data},
        )
            
            # Return updated values
            threat["risk_score"] = new_risk_score
            threat["fmea_score"] = fmea_score
            threat["criticality_score"] = new_criticality_score
            threat["risk_level"] = risk_level
            threat["equipment_criticality"] = criticality_level
            if criticality_data:
                threat["equipment_criticality_data"] = criticality_data
            if equipment_node:
                threat["linked_equipment_id"] = equipment_node["id"]
            
            logger.info(f"Auto-synced threat {threat_id}: risk={new_risk_score}, crit={new_criticality_score}, fmea={fmea_score}")
            
            # Propagate updated risk to linked actions and investigations
            await propagate_risk_to_linked_entities([threat_id], [threat], user=user)
            await _mirror_threat_observation(user, threat)
            await _sync_threat_graph(user, threat, label="threat_auto_sync")
        
        # Ensure risk_score is int
        if isinstance(threat.get("risk_score"), float):
            threat["risk_score"] = int(threat["risk_score"])
        
        # Add equipment tag from equipment node
        if equipment_node and equipment_node.get("tag"):
            threat["equipment_tag"] = equipment_node.get("tag")
        
        # Add required fields that may be missing
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
        # Ensure created_at is string
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
    
    # Recalculate risk if relevant fields changed
    risk_fields = ["likelihood", "detectability", "impact", "frequency"]
    if any(f in update_data for f in risk_fields):
        # Get current values and override with updates
        likelihood = update_data.get("likelihood", threat.get("likelihood", "Possible"))
        detectability = update_data.get("detectability", threat.get("detectability", "Moderate"))
        
        # Calculate new risk score
        likelihood_scores = {"Rare": 1, "Unlikely": 2, "Possible": 3, "Likely": 4, "Almost Certain": 5}
        detectability_scores = {"Easy": 1, "Moderate": 2, "Difficult": 3, "Very Difficult": 4, "Almost Impossible": 5}
        
        l_score = likelihood_scores.get(likelihood, 3)
        d_score = detectability_scores.get(detectability, 2)
        risk_score = l_score * d_score * 10  # Scale to 10-250
        
        # Determine risk level
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
        await db.threats.update_one(
            merge_tenant_filter({"id": threat_id}, user),
            {"$set": update_data},
        )
        
        # Recalculate ranks if status changed
        if "status" in update_data:
            await update_all_ranks(user["id"], user=user)
        
        # Propagate risk changes to linked actions and investigations
        if any(f in update_data for f in ["risk_score", "risk_level", "fmea_rpn"]):
            updated_threat = await _find_threat_scoped(user, threat_id)
            await propagate_risk_to_linked_entities([threat_id], [updated_threat], user=user)
        
        # Invalidate stats cache
        cache.invalidate_stats(f"stats:{user['id']}")
    
    updated = await _find_threat_scoped(user, threat_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Threat not found")
    # Ensure risk_score is int
    if isinstance(updated.get("risk_score"), float):
        updated["risk_score"] = int(updated["risk_score"])
    await _mirror_threat_observation(user, updated)
    await _sync_threat_graph(user, updated, label="threat_update")
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

    return {
        "message": "Threat deleted",
        "deleted_actions": result["deleted_actions"],
        "deleted_investigations": result["deleted_investigations"],
    }


# --- Wave 7: link, timeline, recalculate, investigate ---

async def recalculate_all_threat_scores(user: dict):
    """
    Recalculate risk scores for all threats based on current criticality and FMEA data.
    Uses NEW METHODOLOGY: Risk Score = (Criticality × 0.75) + (FMEA × 0.25)
    """
    # Get all threats for this user
    threats = await db.threats.find(
        merge_tenant_filter({"created_by": user["id"]}, user)
    ).to_list(1000)
    
    if not threats:
        return {"message": "No threats found", "updated_count": 0}
    
    # Get all equipment nodes (they're stored flat in MongoDB, not nested)
    equipment_nodes = await db.equipment_nodes.find(
        {"created_by": user["id"]},
        {"_id": 0, "id": 1, "name": 1, "criticality": 1}
    ).to_list(1000)
    
    # Build asset name -> (node_id, criticality) lookup
    # Use lowercase for case-insensitive matching
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
        # Get FMEA score from linked failure mode
        failure_mode_name = threat.get("failure_mode")
        failure_mode_id = threat.get("failure_mode_id")
        fmea_score = threat.get("fmea_score", threat.get("base_risk_score", 50))
        
        if failure_mode_name and failure_mode_name != "Unknown":
            # Check database first, then static library
            fm = await get_failure_mode_by_name_or_id(failure_mode_name, failure_mode_id)
            if fm:
                from_fm = fmea_score_from_failure_mode(fm)
                if from_fm is not None:
                    fmea_score = from_fm
        
        # Get criticality data from asset (case-insensitive match)
        asset_name = threat.get("asset", "")
        asset_name_lower = asset_name.lower() if asset_name else ""
        
        linked_equipment_id = threat.get("linked_equipment_id")  # Preserve existing link
        criticality_level = "low"
        criticality_score = 0
        criticality_data = None
        
        # Look up equipment by name
        if asset_name_lower and asset_name_lower in asset_data:
            node_info = asset_data[asset_name_lower]
            linked_equipment_id = node_info["id"]
            linked_count += 1
            crit = node_info.get("criticality")
            if crit:
                criticality_level = crit.get("level", "low")
                
                # Calculate 4-Dimension Criticality Score
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
        
        # Update threat with full criticality data
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
        
        await db.threats.update_one({"id": threat["id"]}, {"$set": update_fields})
        updated_count += 1
    
    logger.info(f"Updated {updated_count} threats, linked {linked_count} to equipment")
    
    # Update all ranks
    await update_all_ranks(user["id"], user=user)
    
    # Propagate updated risk scores to linked actions and investigations
    threat_ids = [t["id"] for t in threats]
    actions_updated, inv_updated = await propagate_risk_to_linked_entities(threat_ids, user=user)
    
    return {
        "message": f"Successfully recalculated {updated_count} threat scores",
        "updated_count": updated_count,
        "actions_propagated": actions_updated,
        "investigations_propagated": inv_updated
    }

async def link_threat_to_equipment(user: dict, threat_id: str, equipment_node_id: str):
    """
    Link a threat to an equipment node and apply its criticality to the threat score.
    This updates the threat's asset field and recalculates the risk score.
    """
    # Get the threat (shared entity - no created_by filter)
    threat = await _find_threat_scoped(user, threat_id)
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    await assert_threat_installation_scope(user, threat)
    await installation_filter.assert_user_can_access_equipment(user, equipment_node_id)
    
    # Get the equipment node (tenant-scoped)
    node = await db.equipment_nodes.find_one(
        merge_tenant_filter({"id": equipment_node_id}, user),
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    # Get criticality data from the node
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
    
    # Get FMEA score (from linked failure mode or stored score)
    fmea_score = threat.get("fmea_score", threat.get("base_risk_score", 50))
    
    # Check if threat has linked failure mode - recalculate FMEA score
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
    
    # Update threat with new asset link and recalculated score
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
    
    # Update ranks
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
    
    # Get the threat (shared entity - no created_by filter)
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
    
    # Create failure mode data snapshot
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
    
    from services.threat_score_service import fmea_score_from_failure_mode

    fmea_score = fmea_score_from_failure_mode(matched_fm) or 0
    
    # Get criticality score from stored dimension data (matches score modal)
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
    
    # Update threat with new failure mode link and recalculated score
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
    
    # Update ranks
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


from services.threat_service_investigation import create_investigation_from_threat, get_threat_timeline


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
    from services.ai_gateway import chat as ai_gateway_chat
    
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
        improved = await ai_gateway_chat(
            [
                {
                    "role": "system",
                    "content": f"""You are a reliability engineer improving observation descriptions for a maintenance management system.

Rewrite the description to be:
- Professional and technical
- 2-4 sentences maximum
- Clear and objective
- Using proper engineering terminology
- Suitable for a formal maintenance record
- Written entirely in {output_language}

If the original text is in another language, translate and improve it into {output_language}.
Keep the core meaning but improve clarity and professionalism.
Output only the improved description text, no labels or formatting.""",
                },
                {
                    "role": "user",
                    "content": f"Equipment: {equipment_name}\nFailure mode: {failure_mode}\n\nOriginal description: {current_desc[:1500]}",
                },
            ],
            endpoint="threats.improve_description",
            model="gpt-4o-mini",
            temperature=0.3,
            max_tokens=300,
        )
        
        improved = (improved or "").strip()
        if not improved:
            raise HTTPException(status_code=500, detail="AI returned empty response")
        
        # Update the threat with improved description
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
