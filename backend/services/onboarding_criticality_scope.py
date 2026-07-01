"""Installation scope resolution for onboarding criticality checks."""
from __future__ import annotations

from typing import Any, List

from database import db
from iso14224_models import ISOLevel
from services.executive_dashboard_exposure import ASSESSMENT_COVERAGE_LEVELS
from services.onboarding_tenant import _tenant_membership_filter, _tenant_query, _tenant_user
from services.production_exposure import production_impact_from_criticality
from services.tenant_schema import merge_tenant_filter


def _has_criticality_assessment(criticality: Any) -> bool:
    if not criticality or not isinstance(criticality, dict):
        return False
    if criticality.get("level"):
        return True
    for field in (
        "safety_impact",
        "production_impact",
        "environmental_impact",
        "reputation_impact",
        "safety",
        "production",
        "environmental",
        "reputation",
    ):
        if (criticality.get(field) or 0) > 0:
            return True
    return False


async def criticality_assessment_counts(tenant_id: str) -> dict:
    levels = list(ASSESSMENT_COVERAGE_LEVELS)
    in_scope_nodes = await db.equipment_nodes.find(
        _tenant_query(tenant_id, {"level": {"$in": levels}}),
        {"_id": 0, "level": 1, "criticality": 1},
    ).to_list(length=10000)

    by_level = {level: {"total": 0, "assessed": 0} for level in levels}
    assessed = 0
    for node in in_scope_nodes:
        level = node.get("level")
        if level in by_level:
            by_level[level]["total"] += 1
        if _has_criticality_assessment(node.get("criticality")):
            assessed += 1
            if level in by_level:
                by_level[level]["assessed"] += 1

    total = len(in_scope_nodes)
    coverage = round((assessed / total) * 100) if total else 0
    return {
        "in_scope_total": total,
        "assessed_count": assessed,
        "coverage_percent": coverage,
        "subunit_total": by_level.get(ISOLevel.SUBUNIT.value, {}).get("total", 0),
        "subunit_assessed": by_level.get(ISOLevel.SUBUNIT.value, {}).get("assessed", 0),
        "maintainable_total": by_level.get(ISOLevel.MAINTAINABLE_ITEM.value, {}).get("total", 0),
        "maintainable_assessed": by_level.get(ISOLevel.MAINTAINABLE_ITEM.value, {}).get("assessed", 0),
        "production_assessed_count": sum(
            1 for n in in_scope_nodes if production_impact_from_criticality(n.get("criticality")) > 0
        ),
    }


async def tenant_installation_scope(tenant_id: str) -> dict:
    """Resolve installation ids/names used by risk_settings and definitions."""
    installations = await db.equipment_nodes.find(
        merge_tenant_filter({"level": ISOLevel.INSTALLATION.value}, _tenant_user(tenant_id)),
        {"_id": 0, "id": 1, "name": 1},
    ).to_list(length=100)

    scope_ids = {row["id"] for row in installations if row.get("id")}
    scope_names = {row["name"] for row in installations if row.get("name")}

    referenced_ids = await db.equipment_nodes.distinct(
        "installation_id",
        _tenant_query(
            tenant_id,
            {"installation_id": {"$exists": True, "$nin": [None, ""]}},
        ),
    )
    scope_ids.update(ref_id for ref_id in referenced_ids if ref_id)

    tenant_node_ids = await db.equipment_nodes.distinct("id", _tenant_query(tenant_id, {}))
    scope_ids.update(node_id for node_id in tenant_node_ids if node_id)

    return {
        "installation_ids": [row["id"] for row in installations if row.get("id")],
        "scope_ids": list(scope_ids),
        "scope_names": list(scope_names),
        "installations_total": len(installations),
    }


async def count_risk_settings_for_scope(scope_ids: List[str], scope_names: List[str]) -> int:
    if not scope_ids and not scope_names:
        return 0
    clauses: List[dict] = []
    if scope_ids:
        clauses.append({"installation_id": {"$in": scope_ids}})
    if scope_names:
        clauses.append({"installation_id": {"$in": scope_names}})
    query = clauses[0] if len(clauses) == 1 else {"$or": clauses}
    return await db.risk_settings.count_documents(query)


async def count_criticality_definitions_for_scope(scope_ids: List[str], scope_names: List[str]) -> int:
    if not scope_ids and not scope_names:
        return 0
    clauses: List[dict] = []
    if scope_ids:
        clauses.append({"equipment_id": {"$in": scope_ids}})
    if scope_names:
        clauses.append({"equipment_id": {"$in": scope_names}})
    equipment_clause = clauses[0] if len(clauses) == 1 else {"$or": clauses}
    return await db.definitions.count_documents(
        {
            "$and": [
                equipment_clause,
                {
                    "$or": [
                        {"criticality.0": {"$exists": True}},
                        {"severity.0": {"$exists": True}},
                    ]
                },
            ]
        }
    )
