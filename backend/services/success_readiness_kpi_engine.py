"""KPI calculation engine for Success Readiness."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from database import db
from iso14224_models import ISOLevel
from services.success_readiness_models import (
    KPI_CATALOG,
    KpiResult,
    PILLAR_WEIGHTS,
    status_from_score,
)
from services.tenant_scope import scoped
from services.user_stats_service import UserStatsService

_user_stats = UserStatsService(db)

OPERATIONAL_LEVELS = (
    ISOLevel.PLANT_UNIT.value,
    ISOLevel.SECTION_SYSTEM.value,
    ISOLevel.EQUIPMENT_UNIT.value,
    ISOLevel.SUBUNIT.value,
    ISOLevel.MAINTAINABLE_ITEM.value,
)


async def _calc_user_adoption() -> tuple[Optional[int], Dict[str, Any]]:
    """Active users / total users in the last 30 days."""
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=30)
    match_stage = _user_stats.build_event_match_stage(start, end)
    kpis = await _user_stats._get_kpi_metrics(match_stage)
    total_users = await _user_stats.users.count_documents(_user_stats.stats_users_query())
    active_users = kpis.get("active_users", 0)
    if total_users <= 0:
        return 0, {"active_users": active_users, "total_users": 0, "period_days": 30}
    score = min(100, round((active_users / total_users) * 100))
    return score, {
        "active_users": active_users,
        "total_users": total_users,
        "period_days": 30,
    }


async def _calc_core_data_readiness(user: dict) -> tuple[Optional[int], Dict[str, Any]]:
    """Hierarchy depth, equipment typing, and criticality assignment."""
    site_query = scoped(user, {"level": ISOLevel.INSTALLATION.value})
    equipment_query = scoped(user, {"level": {"$in": list(OPERATIONAL_LEVELS)}})
    typed_query = scoped(user, {
        "level": {"$in": list(OPERATIONAL_LEVELS)},
        "equipment_type_id": {"$exists": True, "$nin": [None, ""]},
    })
    criticality_query = scoped(user, {
        "level": {"$in": list(OPERATIONAL_LEVELS)},
        "criticality_level": {"$exists": True, "$nin": [None, ""]},
    })

    sites, equipment, typed, with_criticality = await asyncio.gather(
        db.equipment_nodes.count_documents(site_query),
        db.equipment_nodes.count_documents(equipment_query),
        db.equipment_nodes.count_documents(typed_query),
        db.equipment_nodes.count_documents(criticality_query),
    )

    components: List[int] = []
    if sites > 0:
        components.append(100)
    if equipment > 0:
        components.append(min(100, round((typed / equipment) * 100)))
        components.append(min(100, round((with_criticality / equipment) * 100)))
    else:
        components.extend([0, 0])

    score = round(sum(components) / len(components)) if components else 0
    return score, {
        "sites": sites,
        "equipment_count": equipment,
        "typed_equipment": typed,
        "criticality_assigned": with_criticality,
    }


async def _resolve_auto_score(kpi_id: str, user: dict) -> tuple[Optional[int], Optional[Dict[str, Any]]]:
    if kpi_id == "user_adoption":
        return await _calc_user_adoption()
    if kpi_id == "core_data_readiness":
        return await _calc_core_data_readiness(user)
    return None, None


async def _manual_score_from_register(register_type: str, tenant_id: Optional[str]) -> Optional[int]:
    """Placeholder: average completion from register entries when present."""
    query: Dict[str, Any] = {"register_type": register_type}
    if tenant_id:
        query["tenant_id"] = tenant_id
    count = await db.success_readiness_registers.count_documents(query)
    if count == 0:
        return None
    pipeline = [
        {"$match": query},
        {"$group": {"_id": None, "avg": {"$avg": "$completion_pct"}}},
    ]
    rows = await db.success_readiness_registers.aggregate(pipeline).to_list(1)
    if not rows:
        return None
    return min(100, round(rows[0].get("avg") or 0))


_REGISTER_BY_KPI = {
    "training_completion": "training",
    "champion_program": "champion",
    "procedure_coverage": "procedure",
    "governance_maturity": "governance",
}


async def build_kpi_results(user: dict, tenant_id: Optional[str]) -> List[KpiResult]:
    results: List[KpiResult] = []
    for spec in KPI_CATALOG:
        kpi_id = spec["id"]
        source = spec["source"]
        score: Optional[int] = None
        auto_detail: Optional[Dict[str, Any]] = None
        todo: Optional[str] = None

        if source == "automatic":
            score, auto_detail = await _resolve_auto_score(kpi_id, user)
        elif source == "manual":
            reg = _REGISTER_BY_KPI.get(kpi_id)
            if reg:
                score = await _manual_score_from_register(reg, tenant_id)
        else:
            todo = f"TODO: implement automatic calculation for {kpi_id}"

        evidence_count = await db.success_readiness_evidence.count_documents(
            {"kpi_id": kpi_id, **({"tenant_id": tenant_id} if tenant_id else {})}
        )

        target = spec["target"]
        results.append(
            KpiResult(
                id=kpi_id,
                pillar=spec["pillar"],
                name=spec["name"],
                weight=spec["weight"],
                target=target,
                score=score,
                trend=None,
                status=status_from_score(score, target),
                source=source,
                description=spec["description"],
                evidence_count=evidence_count,
                auto_detail=auto_detail,
                todo=todo,
            )
        )
    return results


def pillar_score(kpis: List[KpiResult], pillar: str) -> Optional[int]:
    pillar_kpis = [k for k in kpis if k.get("pillar") == pillar and k.get("score") is not None]
    if not pillar_kpis:
        return None
    total_weight = sum(k.get("weight", 0) for k in pillar_kpis)
    if total_weight <= 0:
        return None
    weighted = sum((k["score"] or 0) * k.get("weight", 0) for k in pillar_kpis)
    return round(weighted / total_weight)


def overall_score(kpis: List[KpiResult]) -> Optional[int]:
    parts: List[float] = []
    for pillar, weight in PILLAR_WEIGHTS.items():
        ps = pillar_score(kpis, pillar)
        if ps is not None:
            parts.append(ps * weight)
    if not parts:
        return None
    return round(sum(parts))
