"""KPI calculation engine for Success Readiness."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from database import db
from iso14224_models import ISOLevel
from services.success_readiness_kpi_actions import improvement_actions_for_kpi
from services.success_readiness_models import (
    KPI_CATALOG,
    KpiResult,
    PILLAR_WEIGHTS,
    status_from_score,
)
from services.onboarding_criticality_scope import _has_criticality_assessment
from services.success_readiness_register_scoring import score_register_kpi
from services.tenant_schema import merge_tenant_filter
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

CRITICALITY_SCOPE_LEVELS = (
    ISOLevel.SUBUNIT.value,
    ISOLevel.MAINTAINABLE_ITEM.value,
)

_REGISTER_BY_KPI = {
    "training_completion": "training",
    "champion_program": "champion",
    "procedure_coverage": "procedure",
    "governance_maturity": "governance",
}

_ASSESSMENT_BY_KPI = {
    "infrastructure_readiness": "infrastructure_review",
    "change_readiness": "change_readiness",
}


def _user_adoption_score(current_active: int, previous_active: int) -> int:
    """Score adoption by period-over-period active-user trend."""
    if current_active <= 0:
        return 0
    if current_active > previous_active:
        return 100
    if current_active == previous_active:
        return 90
    return 50


async def _calc_user_adoption(user: dict) -> tuple[Optional[int], Dict[str, Any]]:
    """Active users in the last 30 days vs the prior 30-day window."""
    end = datetime.now(timezone.utc)
    current_start = end - timedelta(days=30)
    previous_end = current_start
    previous_start = end - timedelta(days=60)

    current_match = _user_stats.build_event_match_stage(current_start, end)
    previous_match = _user_stats.build_event_match_stage(previous_start, previous_end)
    current_kpis, previous_kpis = await asyncio.gather(
        _user_stats._get_kpi_metrics(current_match),
        _user_stats._get_kpi_metrics(previous_match),
    )

    active_users = current_kpis.get("active_users", 0)
    previous_active_users = previous_kpis.get("active_users", 0)
    score = _user_adoption_score(active_users, previous_active_users)
    return score, {
        "active_users": active_users,
        "previous_active_users": previous_active_users,
        "period_days": 30,
        "comparison": (
            "growth" if active_users > previous_active_users
            else "same" if active_users == previous_active_users
            else "decline" if active_users > 0
            else "no_use"
        ),
        "total_sessions": current_kpis.get("total_sessions", 0),
    }


async def _calc_core_data_readiness(user: dict) -> tuple[Optional[int], Dict[str, Any]]:
    """Hierarchy depth, equipment typing, and criticality on sub-units / maintainable items."""
    site_query = scoped(user, {"level": ISOLevel.INSTALLATION.value})
    equipment_query = scoped(user, {"level": {"$in": list(OPERATIONAL_LEVELS)}})
    typed_query = scoped(user, {
        "level": {"$in": list(OPERATIONAL_LEVELS)},
        "equipment_type_id": {"$exists": True, "$nin": [None, ""]},
    })
    criticality_scope_query = scoped(user, {"level": {"$in": list(CRITICALITY_SCOPE_LEVELS)}})

    sites, equipment, typed, scope_nodes = await asyncio.gather(
        db.equipment_nodes.count_documents(site_query),
        db.equipment_nodes.count_documents(equipment_query),
        db.equipment_nodes.count_documents(typed_query),
        db.equipment_nodes.find(
            criticality_scope_query,
            {"_id": 0, "level": 1, "criticality": 1},
        ).to_list(length=10000),
    )

    criticality_total = len(scope_nodes)
    criticality_assessed = sum(
        1 for node in scope_nodes if _has_criticality_assessment(node.get("criticality"))
    )
    subunit_nodes = [n for n in scope_nodes if n.get("level") == ISOLevel.SUBUNIT.value]
    maintainable_nodes = [n for n in scope_nodes if n.get("level") == ISOLevel.MAINTAINABLE_ITEM.value]
    subunit_assessed = sum(1 for n in subunit_nodes if _has_criticality_assessment(n.get("criticality")))
    maintainable_assessed = sum(
        1 for n in maintainable_nodes if _has_criticality_assessment(n.get("criticality"))
    )

    components: List[int] = []
    if sites > 0:
        components.append(100)
    if equipment > 0:
        components.append(min(100, round((typed / equipment) * 100)))
    if criticality_total > 0:
        components.append(min(100, round((criticality_assessed / criticality_total) * 100)))
    else:
        components.append(0)

    score = round(sum(components) / len(components)) if components else 0
    return score, {
        "sites": sites,
        "equipment_count": equipment,
        "typed_equipment": typed,
        "criticality_scope_total": criticality_total,
        "criticality_assessed": criticality_assessed,
        "criticality_coverage_percent": round((criticality_assessed / criticality_total) * 100)
        if criticality_total
        else 0,
        "subunit_total": len(subunit_nodes),
        "subunit_assessed": subunit_assessed,
        "maintainable_total": len(maintainable_nodes),
        "maintainable_assessed": maintainable_assessed,
    }


async def _calc_role_coverage(user: dict) -> tuple[Optional[int], Dict[str, Any]]:
    query = merge_tenant_filter(_user_stats.stats_users_query(), user)
    total = await db.users.count_documents(query)
    if total <= 0:
        return None, {"total_users": 0, "assigned_roles": 0}
    assigned = await db.users.count_documents(
        merge_tenant_filter({**_user_stats.stats_users_query(), "role": {"$exists": True, "$nin": [None, ""]}}, user)
    )
    score = min(100, round((assigned / total) * 100))
    return score, {"total_users": total, "assigned_roles": assigned}


async def _calc_platform_utilization(user: dict) -> tuple[Optional[int], Dict[str, Any]]:
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=30)
    match_stage = _user_stats.build_event_match_stage(start, end)
    modules = await _user_stats._get_module_usage(match_stage)
    device_usage = await _user_stats._get_device_usage(match_stage)
    active_modules = len([m for m in modules if (m.get("views") or 0) > 0])
    target_modules = 8
    module_score = min(100, round((active_modules / target_modules) * 100)) if target_modules else 0
    mobile_pct = device_usage.get("breakdown", {}).get("mobile", {}).get("percentage", 0)
    score = round((module_score * 0.7) + (min(100, mobile_pct) * 0.3))
    return score, {
        "active_modules": active_modules,
        "module_views": modules[:5],
        "device_usage": device_usage,
        "period_days": 30,
    }


async def _calc_workflow_adoption(user: dict) -> tuple[Optional[int], Dict[str, Any]]:
    threat_query = merge_tenant_filter({}, user)
    total_threats = await db.threats.count_documents(threat_query)
    if total_threats <= 0:
        return None, {"observations": 0, "with_actions": 0}
    with_actions = await db.central_actions.count_documents(
        merge_tenant_filter({"source_type": "threat"}, user)
    )
    action_ratio = min(100, round((with_actions / max(total_threats, 1)) * 100))
    return action_ratio, {
        "observations": total_threats,
        "linked_actions": with_actions,
    }


async def _calc_reliability_process(user: dict) -> tuple[Optional[int], Dict[str, Any]]:
    fm_count = await db.failure_modes.count_documents(merge_tenant_filter({}, user))
    strategy_count = await db.maintenance_strategies.count_documents(merge_tenant_filter({}, user))
    equipment_count = await db.equipment_nodes.count_documents(
        scoped(user, {"level": {"$in": list(OPERATIONAL_LEVELS)}})
    )
    if equipment_count <= 0:
        return 0, {"failure_modes": fm_count, "strategies": strategy_count, "equipment": 0}
    fm_score = min(100, round((fm_count / max(equipment_count / 5, 1)) * 100))
    strategy_score = min(100, round((strategy_count / max(equipment_count / 10, 1)) * 100))
    score = round((fm_score + strategy_score) / 2)
    return score, {
        "failure_modes": fm_count,
        "strategies": strategy_count,
        "equipment": equipment_count,
    }


async def _calc_data_quality(user: dict) -> tuple[Optional[int], Dict[str, Any]]:
    equipment_query = scoped(user, {"level": {"$in": list(OPERATIONAL_LEVELS)}})
    total = await db.equipment_nodes.count_documents(equipment_query)
    if total <= 0:
        return 0, {"equipment": 0, "orphans": 0, "missing_type": 0}
    missing_type = await db.equipment_nodes.count_documents(
        scoped(user, {
            "level": {"$in": list(OPERATIONAL_LEVELS)},
            "$or": [
                {"equipment_type_id": {"$exists": False}},
                {"equipment_type_id": None},
                {"equipment_type_id": ""},
            ],
        })
    )
    orphans = await db.equipment_nodes.count_documents(
        scoped(user, {
            "level": {"$in": list(OPERATIONAL_LEVELS)},
            "$or": [{"parent_id": {"$exists": False}}, {"parent_id": None}, {"parent_id": ""}],
        })
    )
    issues = missing_type + orphans
    score = max(0, min(100, round(100 - (issues / total) * 100)))
    return score, {
        "equipment": total,
        "missing_type": missing_type,
        "orphans": orphans,
    }


async def _calc_ai_readiness(user: dict) -> tuple[Optional[int], Dict[str, Any]]:
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    query = merge_tenant_filter({"timestamp": {"$gte": since}}, user)
    usage_count = await db.ai_usage.count_documents(query)
    active_users = len(await db.ai_usage.distinct("user_id", query))
    score = min(100, usage_count * 5 + active_users * 10) if usage_count or active_users else 0
    return score, {"ai_events_30d": usage_count, "ai_users_30d": active_users}


async def _calc_integration_health(user: dict) -> tuple[Optional[int], Dict[str, Any]]:
    query = merge_tenant_filter({"revoked": {"$ne": True}}, user)
    active_keys = await db.external_api_keys.count_documents(query)
    if active_keys <= 0:
        return 0, {"active_api_keys": 0}
    return min(100, active_keys * 50), {"active_api_keys": active_keys}


async def _resolve_auto_score(kpi_id: str, user: dict) -> tuple[Optional[int], Optional[Dict[str, Any]]]:
    calculators = {
        "user_adoption": lambda: _calc_user_adoption(user),
        "core_data_readiness": lambda: _calc_core_data_readiness(user),
        "role_coverage": lambda: _calc_role_coverage(user),
        "platform_utilization": lambda: _calc_platform_utilization(user),
        "workflow_adoption": lambda: _calc_workflow_adoption(user),
        "reliability_process": lambda: _calc_reliability_process(user),
        "data_quality": lambda: _calc_data_quality(user),
        "ai_readiness": lambda: _calc_ai_readiness(user),
        "integration_health": lambda: _calc_integration_health(user),
    }
    calc = calculators.get(kpi_id)
    if calc:
        return await calc()
    return None, None


async def _manual_score_from_register(register_type: str, user: dict) -> tuple[Optional[int], Dict[str, Any]]:
    query = merge_tenant_filter({"register_type": register_type}, user)
    cursor = db.success_readiness_registers.find(query).limit(500)
    entries: List[Dict[str, Any]] = []
    async for doc in cursor:
        entries.append(doc)
    return score_register_kpi(register_type, entries)


async def _manual_score_from_assessment(kpi_id: str, user: dict) -> tuple[Optional[int], Dict[str, Any]]:
    template_id = _ASSESSMENT_BY_KPI.get(kpi_id)
    if not template_id:
        return None, {}
    query = merge_tenant_filter({"template_id": template_id, "status": "completed"}, user)
    doc = await db.success_readiness_assessments.find_one(query, sort=[("completed_at", -1)])
    if not doc or doc.get("score") is None:
        return None, {"assessment_status": doc.get("status") if doc else "not_started"}
    return int(doc["score"]), {
        "assessment_id": str(doc.get("_id")),
        "completed_at": doc.get("completed_at"),
        "reviewer": doc.get("reviewer"),
    }


async def _integrations_enabled(user: dict) -> bool:
    query = merge_tenant_filter({"type": "success_readiness_config"}, user)
    doc = await db.success_readiness_config.find_one(query)
    if not doc:
        return True
    return bool(doc.get("integrations_enabled", True))


async def build_kpi_results(user: dict, tenant_id: Optional[str]) -> List[KpiResult]:
    integrations_in_scope = await _integrations_enabled(user)
    results: List[KpiResult] = []
    for spec in KPI_CATALOG:
        kpi_id = spec["id"]
        source = spec["source"]
        score: Optional[int] = None
        auto_detail: Optional[Dict[str, Any]] = None
        todo: Optional[str] = None
        excluded = False

        if kpi_id == "integration_health" and not integrations_in_scope:
            excluded = True
            auto_detail = {"reason": "Integrations turned off in configuration"}
        elif source == "automatic":
            score, auto_detail = await _resolve_auto_score(kpi_id, user)
        elif source == "manual":
            reg = _REGISTER_BY_KPI.get(kpi_id)
            if reg:
                score, auto_detail = await _manual_score_from_register(reg, user)
            elif kpi_id in _ASSESSMENT_BY_KPI:
                score, auto_detail = await _manual_score_from_assessment(kpi_id, user)
        else:
            todo = f"TODO: implement automatic calculation for {kpi_id}"

        evidence_query = merge_tenant_filter({"kpi_id": kpi_id}, user)
        evidence_count = await db.success_readiness_evidence.count_documents(evidence_query)

        target = spec["target"]
        status = "excluded" if excluded else status_from_score(score, target)
        results.append(
            KpiResult(
                id=kpi_id,
                pillar=spec["pillar"],
                name=spec["name"],
                weight=spec["weight"],
                target=target,
                score=score,
                trend=None,
                status=status,
                source=source,
                description=spec["description"],
                evidence_count=evidence_count,
                auto_detail=auto_detail,
                todo=todo,
                improvement_actions=[] if excluded else improvement_actions_for_kpi(kpi_id),
                excluded=excluded,
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
