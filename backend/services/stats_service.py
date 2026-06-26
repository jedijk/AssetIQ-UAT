"""
Threat summary stats — Wave 4 projection convergence.

Dashboard threat counts via ThreatRepository (tenant-scoped).
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import HTTPException

from database import db, installation_filter
from repositories.action_repository import ActionRepository
from repositories.equipment_repository import EquipmentRepository
from repositories.investigation_repository import InvestigationRepository
from repositories.threat_repository import ThreatRepository
from services.cache_service import cache
from services.equipment_type_registry import equipment_type_id_set
from services.tenant_schema import merge_tenant_filter, tenant_id_from_user

_threat_repo = ThreatRepository(db)
_equipment_repo = EquipmentRepository(db)
_investigation_repo = InvestigationRepository(db)
_action_repo = ActionRepository(db)

_EMPTY = {
    "total_threats": 0,
    "open_threats": 0,
    "critical_count": 0,
    "high_count": 0,
}


async def get_threat_summary_stats(current_user: dict) -> Dict[str, Any]:
    user_id = current_user["id"]
    tenant_key = tenant_id_from_user(current_user) or "legacy"
    cache_key = f"stats:{tenant_key}:{user_id}"

    cached = cache.get_stat_entry(cache_key)
    if cached:
        return cached

    installation_ids = await installation_filter.get_user_installation_ids(current_user)
    if not installation_ids:
        cache.set_stats(cache_key, _EMPTY)
        return _EMPTY

    equipment_ids = await installation_filter.get_all_equipment_ids_for_installations(
        installation_ids, user_id
    )
    equipment_names = await installation_filter.get_equipment_names_for_installations(
        installation_ids, user_id
    )

    base_filter = installation_filter.build_threat_filter(
        user_id, equipment_ids, equipment_names
    )
    base_filter = merge_tenant_filter(base_filter, current_user)

    if base_filter.get("_impossible"):
        cache.set_stats(cache_key, _EMPTY)
        return _EMPTY

    total = await _threat_repo.count(base_filter, user=current_user)
    open_count = await _threat_repo.count({**base_filter, "status": "Open"}, user=current_user)
    critical = await _threat_repo.count(
        {**base_filter, "risk_level": "Critical", "status": {"$ne": "Closed"}},
        user=current_user,
    )
    high = await _threat_repo.count(
        {**base_filter, "risk_level": "High", "status": {"$ne": "Closed"}},
        user=current_user,
    )

    result = {
        "total_threats": total,
        "open_threats": open_count,
        "critical_count": critical,
        "high_count": high,
    }
    cache.set_stats(cache_key, result)
    return result


_NODE_PROJECTION = {
    "_id": 0,
    "id": 1,
    "name": 1,
    "level": 1,
    "equipment_type": 1,
    "equipment_type_id": 1,
    "criticality": 1,
    "description": 1,
    "parent_id": 1,
}


async def get_reliability_scores(
    current_user: dict,
    *,
    node_id: Optional[str] = None,
    level: Optional[str] = None,
) -> Dict[str, Any]:
    """Reliability performance scores across six dimensions (repository-backed reads)."""
    user_id = current_user["id"]
    node_filter = merge_tenant_filter({"created_by": user_id}, current_user)
    threat_filter = merge_tenant_filter({"created_by": user_id}, current_user)
    inv_filter = merge_tenant_filter({"created_by": user_id}, current_user)
    action_filter = merge_tenant_filter({"created_by": user_id}, current_user)
    strategy_filter = merge_tenant_filter({}, current_user)

    nodes = await _equipment_repo.find_many(
        node_filter,
        user=current_user,
        projection=_NODE_PROJECTION,
        limit=1000,
    )
    threats = await _threat_repo.find_many(
        threat_filter,
        user=current_user,
        projection={"_id": 0, "id": 1, "asset_name": 1, "status": 1, "risk_level": 1},
        limit=1000,
    )
    investigations = await _investigation_repo.find_many(
        inv_filter,
        user=current_user,
        projection={"_id": 0, "id": 1, "threat_id": 1, "asset_name": 1, "title": 1, "description": 1, "status": 1},
        limit=1000,
    )
    actions = await _action_repo.find_many(
        action_filter,
        user=current_user,
        projection={"_id": 0, "id": 1, "source_id": 1, "source_name": 1, "status": 1, "threat_id": 1, "description": 1, "source": 1, "title": 1},
        limit=1000,
    )
    strategies = await db.equipment_type_strategies.find(
        strategy_filter,
        {"_id": 0, "equipment_type_id": 1, "task_templates": 1, "status": 1},
    ).to_list(1000)

    eq_type_ids = await equipment_type_id_set(db, user=current_user)

    def calculate_node_scores(node):
        nid = node["id"]
        node_name = node.get("name", "")
        node_level = node.get("level", "")
        equipment_type = node.get("equipment_type_id") or node.get("equipment_type")
        criticality = node.get("criticality")

        criticality_score = 0
        if criticality:
            criticality_score += 50
        if equipment_type:
            criticality_score += 30
        if node.get("description"):
            criticality_score += 20

        node_threats = [t for t in threats if t.get("asset_name", "").lower() == node_name.lower()]
        closed_threats = [t for t in node_threats if t.get("status") == "Closed"]
        if node_threats:
            incidents_score = min(100, 50 + (len(closed_threats) / len(node_threats)) * 50)
        else:
            incidents_score = 60

        node_investigations = [
            inv for inv in investigations
            if node_name.lower() in (inv.get("description", "") + inv.get("title", "")).lower()
        ]
        completed_investigations = [inv for inv in node_investigations if inv.get("status") == "completed"]
        if node_investigations:
            investigations_score = min(100, 40 + (len(completed_investigations) / len(node_investigations)) * 60)
        else:
            investigations_score = 50

        maintenance_score = 0
        if equipment_type and equipment_type in eq_type_ids:
            type_strategies = [s for s in strategies if s.get("equipment_type_id") == equipment_type]
            if type_strategies:
                strategy = type_strategies[0]
                templates = strategy.get("task_templates") or []
                mandatory = [t for t in templates if t.get("is_mandatory", True) is not False]
                if mandatory:
                    maintenance_score = min(100, 60 + len(mandatory) * 8)
                elif templates:
                    maintenance_score = 45
                elif strategy.get("status") == "active":
                    maintenance_score = 40
                else:
                    maintenance_score = 35
            else:
                maintenance_score = 30
        else:
            maintenance_score = 20

        node_actions = [
            a for a in actions
            if node_name.lower() in (
                (a.get("description") or "")
                + (a.get("source") or "")
                + (a.get("source_name") or "")
                + (a.get("title") or "")
            ).lower()
        ]
        completed_actions = [a for a in node_actions if a.get("status") == "completed"]
        if node_actions:
            reactions_score = min(100, 40 + (len(completed_actions) / len(node_actions)) * 60)
        else:
            reactions_score = 50

        open_threats = [t for t in node_threats if t.get("status") == "Open"]
        critical_open = [t for t in open_threats if t.get("risk_level") in ["Critical", "High"]]
        threats_score = max(0, 100 - len(open_threats) * 10 - len(critical_open) * 15)

        return {
            "node_id": nid,
            "node_name": node_name,
            "node_level": node_level,
            "parent_id": node.get("parent_id"),
            "equipment_type": equipment_type,
            "criticality": criticality,
            "scores": {
                "criticality": criticality_score,
                "incidents": round(incidents_score),
                "investigations": round(investigations_score),
                "maintenance": round(maintenance_score),
                "reactions": round(reactions_score),
                "threats": round(threats_score),
            },
            "overall_score": round(
                (criticality_score + incidents_score + investigations_score
                 + maintenance_score + reactions_score + threats_score) / 6
            ),
        }

    all_scores = [calculate_node_scores(node) for node in nodes]

    children_map: Dict[str, list] = {}
    for score in all_scores:
        parent_id = score.get("parent_id")
        if parent_id:
            children_map.setdefault(parent_id, []).append(score)

    def aggregate_children_scores(node_score):
        nid = node_score["node_id"]
        children = children_map.get(nid, [])
        if not children:
            return node_score
        aggregated_children = [aggregate_children_scores(child) for child in children]
        all_entities = [node_score] + aggregated_children
        aggregated = {
            "criticality": sum(e["scores"]["criticality"] for e in all_entities) / len(all_entities),
            "incidents": sum(e["scores"]["incidents"] for e in all_entities) / len(all_entities),
            "investigations": sum(e["scores"]["investigations"] for e in all_entities) / len(all_entities),
            "maintenance": sum(e["scores"]["maintenance"] for e in all_entities) / len(all_entities),
            "reactions": sum(e["scores"]["reactions"] for e in all_entities) / len(all_entities),
            "threats": sum(e["scores"]["threats"] for e in all_entities) / len(all_entities),
        }
        node_score["aggregated_scores"] = {k: round(v) for k, v in aggregated.items()}
        node_score["aggregated_overall"] = round(sum(aggregated.values()) / 6)
        node_score["child_count"] = len(aggregated_children)
        return node_score

    for root in [s for s in all_scores if not s.get("parent_id")]:
        aggregate_children_scores(root)

    if all_scores:
        global_scores = {
            key: round(sum(s["scores"][key] for s in all_scores) / len(all_scores))
            for key in ("criticality", "incidents", "investigations", "maintenance", "reactions", "threats")
        }
        global_overall = round(sum(global_scores.values()) / 6)
    else:
        global_scores = {k: 0 for k in ("criticality", "incidents", "investigations", "maintenance", "reactions", "threats")}
        global_overall = 0

    if node_id:
        matching = [s for s in all_scores if s["node_id"] == node_id]
        if not matching:
            raise HTTPException(status_code=404, detail="Node not found")
        return {"node": matching[0], "global_scores": global_scores, "global_overall": global_overall}

    if level:
        level_nodes = [s for s in all_scores if s["node_level"] == level]
        level_avg = {}
        if level_nodes:
            level_avg = {
                key: round(sum(n["scores"][key] for n in level_nodes) / len(level_nodes))
                for key in ("criticality", "incidents", "investigations", "maintenance", "reactions", "threats")
            }
        return {
            "level": level,
            "nodes": level_nodes,
            "level_average_scores": level_avg,
            "level_count": len(level_nodes),
            "global_scores": global_scores,
            "global_overall": global_overall,
        }

    return {
        "nodes": all_scores,
        "global_scores": global_scores,
        "global_overall": global_overall,
        "total_equipment": len(nodes),
        "summary": {
            "with_criticality": len([n for n in nodes if n.get("criticality")]),
            "with_equipment_type": len([n for n in nodes if n.get("equipment_type")]),
            "total_threats": len(threats),
            "open_threats": len([t for t in threats if t.get("status") == "Open"]),
            "total_investigations": len(investigations),
            "total_actions": len(actions),
        },
    }
