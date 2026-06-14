"""Equipment criticality, discipline assignment, and hierarchy stats."""
import logging
from datetime import datetime, timezone

from fastapi import HTTPException

from database import db, installation_filter
from iso14224_models import Discipline, ISO_LEVEL_ORDER, CriticalityAssignment
from services.cache_service import invalidate_equipment_related
from services.criticality_score import compute_criticality_score
from services.tenant_schema import merge_tenant_filter
from services.threat_score_service import recalculate_threat_scores_for_asset

logger = logging.getLogger(__name__)


async def assign_criticality(
    user: dict,
    node_id: str,
    assignment: CriticalityAssignment,
) -> dict:
    node = await db.equipment_nodes.find_one(
        merge_tenant_filter({"id": node_id}, user),
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")

    has_any_dimension = (
        (assignment.safety_impact and assignment.safety_impact > 0)
        or (assignment.production_impact and assignment.production_impact > 0)
        or (assignment.environmental_impact and assignment.environmental_impact > 0)
        or (assignment.reputation_impact and assignment.reputation_impact > 0)
    )

    if not has_any_dimension:
        await db.equipment_nodes.update_one(
            merge_tenant_filter({"id": node_id}, user),
            {"$set": {
                "criticality": None,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        invalidate_equipment_related(
            equipment_id=node_id,
            equipment_name=node.get("name"),
            reason="criticality_cleared",
        )
        updated = await db.equipment_nodes.find_one(
            merge_tenant_filter({"id": node_id}, user),
            {"_id": 0},
        )
        return updated

    safety = assignment.safety_impact or 0
    production = assignment.production_impact or 0
    environmental = assignment.environmental_impact or 0
    reputation = assignment.reputation_impact or 0
    max_impact = max(safety, production, environmental, reputation)

    if safety >= 4 or max_impact == 5:
        level = "safety_critical"
        color = "#EF4444"
    elif production >= 4 or max_impact >= 4:
        level = "production_critical"
        color = "#F97316"
    elif max_impact >= 3:
        level = "medium"
        color = "#EAB308"
    else:
        level = "low"
        color = "#22C55E"

    criticality_data = {
        "safety_impact": safety,
        "production_impact": production,
        "environmental_impact": environmental,
        "reputation_impact": reputation,
        "level": level,
        "color": color,
        "max_impact": max_impact,
        "profile_id": assignment.profile_id,
        "fatality_risk": assignment.fatality_risk or 0,
        "production_loss_per_day": assignment.production_loss_per_day or 0,
        "failure_probability": assignment.failure_probability or 0,
        "downtime_days": assignment.downtime_days or 0,
    }
    criticality_data["risk_score"] = compute_criticality_score(
        safety, production, environmental, reputation,
    )

    await db.equipment_nodes.update_one(
        merge_tenant_filter({"id": node_id}, user),
        {"$set": {
            "criticality": criticality_data,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )

    invalidate_equipment_related(
        equipment_id=node_id,
        equipment_name=node.get("name"),
        reason="criticality_assigned",
    )

    asset_name = node.get("name")
    updated_threats = 0
    if asset_name:
        updated_threats = await recalculate_threat_scores_for_asset(
            asset_name,
            user["id"],
            criticality_data,
            node_id,
        )
        logger.info(
            "Updated %s threat scores after criticality change for %s",
            updated_threats,
            asset_name,
        )

    updated = await db.equipment_nodes.find_one(
        merge_tenant_filter({"id": node_id}, user),
        {"_id": 0},
    )
    updated["threats_updated"] = updated_threats if asset_name else 0
    return updated


async def assign_discipline(user: dict, node_id: str, discipline: str) -> dict:
    node = await db.equipment_nodes.find_one(
        merge_tenant_filter({"id": node_id}, user),
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")

    try:
        Discipline(discipline)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid discipline. Valid options: {[d.value for d in Discipline]}",
        )

    await db.equipment_nodes.update_one(
        merge_tenant_filter({"id": node_id}, user),
        {"$set": {
            "discipline": discipline,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )

    return await db.equipment_nodes.find_one(
        merge_tenant_filter({"id": node_id}, user),
        {"_id": 0},
    )


async def get_hierarchy_stats(user: dict) -> dict:
    empty = {
        "total_nodes": 0,
        "by_level": {level.value: 0 for level in ISO_LEVEL_ORDER},
        "by_criticality": {
            "safety_critical": 0,
            "production_critical": 0,
            "medium": 0,
            "low": 0,
            "unassigned": 0,
        },
    }

    installation_ids = await installation_filter.get_user_installation_ids(user)
    if not installation_ids:
        return empty

    equipment_ids = await installation_filter.get_all_equipment_ids_for_installations(
        installation_ids,
        user["id"],
    )
    if not equipment_ids:
        return empty

    base_query = merge_tenant_filter({"id": {"$in": list(equipment_ids)}}, user)

    total_nodes = await db.equipment_nodes.count_documents(base_query)

    level_counts = {}
    for level in ISO_LEVEL_ORDER:
        level_counts[level.value] = await db.equipment_nodes.count_documents(
            {**base_query, "level": level.value},
        )

    criticality_counts = {
        "safety_critical": await db.equipment_nodes.count_documents(
            {**base_query, "criticality.level": "safety_critical"},
        ),
        "production_critical": await db.equipment_nodes.count_documents(
            {**base_query, "criticality.level": "production_critical"},
        ),
        "medium": await db.equipment_nodes.count_documents(
            {**base_query, "criticality.level": "medium"},
        ),
        "low": await db.equipment_nodes.count_documents(
            {**base_query, "criticality.level": "low"},
        ),
        "unassigned": await db.equipment_nodes.count_documents(
            {**base_query, "criticality": None},
        ),
    }

    return {
        "total_nodes": total_nodes,
        "by_level": level_counts,
        "by_criticality": criticality_counts,
    }
