"""Exposure data fetching and calculations for the executive dashboard."""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from database import db, installation_filter
from services.executive_dashboard_models import (
    calculate_production_value,
    format_currency,
    is_active_observation_status,
    is_mitigated_observation_status,
    observation_risk_score_value,
    severity_to_production_impact,
)
from services.pm_import_constants import PM_IMPORT_UNWOUND_ENABLED_TASK_MATCH
from services.production_exposure import (
    calculate_covered_assessed_exposure,
    calculate_total_equipment_lifecycle_exposure,
    calculate_uncovered_assessed_exposure,
    equipment_assessed_exposure_value,
    production_impact_from_criticality,
)
from services.tenant_schema import merge_tenant_filter, prepend_tenant_match
from services.work_signal_projection import project_list_item


async def _fetch_scoped_equipment_nodes(current_user: dict) -> List[dict]:
    installation_ids = await installation_filter.get_user_installation_ids(current_user)
    if not installation_ids:
        return []
    equipment_ids = await installation_filter.get_scoped_equipment_ids(current_user)
    if not equipment_ids:
        return []
    return await db.equipment_nodes.find(
        merge_tenant_filter({"id": {"$in": list(equipment_ids)}}, current_user),
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "tag": 1,
            "level": 1,
            "criticality": 1,
            "equipment_type_id": 1,
        },
    ).to_list(5000)


async def _fetch_scoped_observations(current_user: dict) -> List[dict]:
    """Observations live in the threats collection, scoped by installation access."""
    user_id = current_user["id"]
    installation_ids = await installation_filter.get_user_installation_ids(current_user)
    if not installation_ids:
        return []

    equipment_ids, equipment_names = await asyncio.gather(
        installation_filter.get_scoped_equipment_ids(current_user),
        installation_filter.get_scoped_equipment_names(current_user),
    )
    query = installation_filter.build_threat_filter(
        user_id, equipment_ids, equipment_names
    )
    if query.get("_impossible"):
        return []

    from services.discipline_filter import apply_discipline_filter_to_query

    query = apply_discipline_filter_to_query(query, current_user)

    return await db.threats.find(
        merge_tenant_filter(query, current_user),
        {
            "_id": 0,
            "id": 1,
            "title": 1,
            "linked_equipment_id": 1,
            "asset": 1,
            "failure_mode": 1,
            "failure_mode_id": 1,
            "description": 1,
            "user_context": 1,
            "risk_level": 1,
            "risk_score": 1,
            "status": 1,
            "created_at": 1,
        },
    ).to_list(10000)


async def _threat_ids_with_linked_actions(current_user: dict) -> Set[str]:
    rows = await db.central_actions.find(
        merge_tenant_filter(
            {"source_type": "threat", "source_id": {"$exists": True, "$ne": None}},
            current_user,
        ),
        {"_id": 0, "source_id": 1},
    ).to_list(10000)
    return {row["source_id"] for row in rows if row.get("source_id")}


# Equipment with accepted/imported PM Import tasks (Intelligence Map parity).
PM_IMPORT_EQUIPMENT_LINKED_TASK_MATCH = {
    "tasks_extracted.equipment_match.equipment_id": {"$ne": None},
    "tasks_extracted.review_status": {"$ne": "rejected"},
    "$or": [
        {"tasks_extracted.import_status": {"$in": ["applied", "merged", "implemented"]}},
        {"tasks_extracted.review_status": {"$in": ["accepted", "edited", "implemented"]}},
    ],
}

PM_IMPORT_ACTIVE_EQUIPMENT_LINKED_TASK_MATCH = {
    **PM_IMPORT_EQUIPMENT_LINKED_TASK_MATCH,
    **PM_IMPORT_UNWOUND_ENABLED_TASK_MATCH,
}


ASSESSMENT_COVERAGE_LEVELS = frozenset({"subunit", "maintainable_item"})


def _equipment_level_key(level: Optional[str]) -> str:
    return (level or "").lower().strip()


def _is_equipment_production_assessed(equipment: dict) -> bool:
    return production_impact_from_criticality(equipment.get("criticality")) > 0


def _assessment_level_display(level: str) -> str:
    labels = {
        "subunit": "Sub unit",
        "maintainable_item": "Maintainable item",
    }
    return labels.get(level, level.replace("_", " ").title())


async def _equipment_ids_with_active_pm_import(
    current_user: dict,
    *,
    created_before: Optional[str] = None,
) -> set:
    """Equipment covered by an enabled imported PM task (even without a strategy-based v2 program)."""
    pre_stages: List[dict] = []
    if created_before:
        pre_stages.append({"$match": {"created_at": {"$lt": created_before}}})

    pipeline = prepend_tenant_match(
        [
            *pre_stages,
            {"$unwind": "$tasks_extracted"},
            {"$match": PM_IMPORT_ACTIVE_EQUIPMENT_LINKED_TASK_MATCH},
            {"$group": {"_id": "$tasks_extracted.equipment_match.equipment_id"}},
        ],
        current_user,
    )
    rows = await db.pm_import_sessions.aggregate(pipeline).to_list(5000)
    return {row["_id"] for row in rows if row.get("_id")}


async def compute_exposure_dashboard_section(
    *,
    current_user: dict,
    equipment_nodes: List[dict],
    all_observations: List[dict],
    threat_ids_with_actions: Set[str],
    current_period_start: datetime,
    hourly_cost: float,
    currency_symbol: str,
) -> Dict[str, Any]:
    """Compute exposure metrics/evidence needed to build executive dashboard KPIs."""

    def _program_has_tasks(program: dict) -> bool:
        if (program.get("active_tasks") or 0) > 0:
            return True
        if (program.get("total_tasks") or 0) > 0:
            return True
        if (program.get("imported_tasks") or 0) > 0:
            return True
        return len(program.get("tasks") or []) > 0

    def _program_is_active(program: dict) -> bool:
        status = (program.get("status") or "active").lower()
        return status not in ("archived", "superseded") and _program_has_tasks(program)

    def observation_risk_score(obs: dict) -> float:
        return observation_risk_score_value(obs)

    equipment_map = {eq.get("id"): eq for eq in equipment_nodes if eq.get("id")}

    program_filter = merge_tenant_filter({}, current_user)
    maintenance_programs = await db.maintenance_programs_v2.find(
        program_filter,
        {
            "_id": 0,
            "equipment_id": 1,
            "equipment_name": 1,
            "equipment_tag": 1,
            "active_tasks": 1,
            "total_tasks": 1,
            "imported_tasks": 1,
            "tasks": 1,
            "created_at": 1,
            "status": 1,
        },
    ).to_list(5000)

    covered_equipment_ids = {
        prog.get("equipment_id")
        for prog in maintenance_programs
        if prog.get("equipment_id") and _program_is_active(prog)
    }
    pm_import_equipment_ids = await _equipment_ids_with_active_pm_import(current_user)
    covered_equipment_ids |= pm_import_equipment_ids
    active_maintenance_program_count = len(covered_equipment_ids)

    previous_period_program_equipment_ids = {
        prog.get("equipment_id")
        for prog in maintenance_programs
        if prog.get("equipment_id")
        and _program_is_active(prog)
        and (prog.get("created_at") or "") < current_period_start.isoformat()
    }
    previous_period_pm_import_ids = await _equipment_ids_with_active_pm_import(
        current_user,
        created_before=current_period_start.isoformat(),
    )
    previous_period_program_equipment_ids |= previous_period_pm_import_ids

    strategy_filter = merge_tenant_filter({}, current_user)
    strategies = await db.equipment_type_strategies.find(
        strategy_filter,
        {"_id": 0, "equipment_type_id": 1, "status": 1, "failure_mode_strategies": 1},
    ).to_list(500)

    controlled_equipment_types = set()
    controlled_failure_modes = set()
    for strategy in strategies:
        if strategy.get("status") == "active":
            controlled_equipment_types.add(strategy.get("equipment_type_id"))
        fm_strategies = strategy.get("failure_mode_strategies") or []
        for fms in fm_strategies:
            if fms.get("tasks") or fms.get("pm_tasks") or fms.get("inspection_tasks"):
                controlled_failure_modes.add(fms.get("failure_mode_id"))

    efm_filter = merge_tenant_filter({}, current_user)
    efms = await db.equipment_failure_modes.find(
        efm_filter,
        {"_id": 0, "id": 1, "equipment_id": 1, "failure_mode_id": 1, "has_strategy": 1},
    ).to_list(5000)

    efm_with_strategy = set()
    for efm in efms:
        if efm.get("has_strategy"):
            efm_with_strategy.add(efm.get("id"))
            efm_with_strategy.add(f"{efm.get('equipment_id')}_{efm.get('failure_mode_id')}")

    total_lifecycle_exposure, assessed_equipment_count = (
        calculate_total_equipment_lifecycle_exposure(equipment_nodes, hourly_cost)
    )

    covered_by_controls, covered_equipment_count = calculate_covered_assessed_exposure(
        equipment_nodes,
        covered_equipment_ids,
        hourly_cost,
    )
    uncovered_exposure, uncovered_equipment_count = calculate_uncovered_assessed_exposure(
        equipment_nodes,
        covered_equipment_ids,
        hourly_cost,
    )
    prev_covered, _ = calculate_covered_assessed_exposure(
        equipment_nodes,
        previous_period_program_equipment_ids,
        hourly_cost,
    )
    prev_uncovered, _ = calculate_uncovered_assessed_exposure(
        equipment_nodes,
        previous_period_program_equipment_ids,
        hourly_cost,
    )

    active_threat_exposure = 0.0
    controlled_active_exposure = 0.0
    resolved_exposure = 0.0

    prev_active_threat = 0.0
    prev_controlled_active = 0.0
    prev_resolved_exposure = 0.0

    uncovered_evidence = []
    for equipment in equipment_nodes:
        equipment_id = equipment.get("id")
        if not equipment_id or equipment_id in covered_equipment_ids:
            continue
        exposure_value = equipment_assessed_exposure_value(equipment, hourly_cost)
        if exposure_value <= 0:
            continue
        production_impact = production_impact_from_criticality(equipment.get("criticality")) or 0
        uncovered_evidence.append(
            {
                "asset": equipment.get("name") or equipment_id,
                "failure_mode": "No Maintenance Program",
                "description": "Assessed equipment without an active maintenance program",
                "equipment_type": equipment.get("equipment_type_id"),
                "criticality": equipment.get("criticality"),
                "production_impact": production_impact,
                "exposure_value": exposure_value,
                "exposure_formatted": format_currency(exposure_value, currency_symbol),
                "control_status": "No Maintenance Program",
                "id": equipment_id,
            }
        )

    program_covered_equipment_ids = {
        prog.get("equipment_id")
        for prog in maintenance_programs
        if prog.get("equipment_id") and _program_is_active(prog)
    }
    covered_evidence = []
    for equipment in equipment_nodes:
        equipment_id = equipment.get("id")
        if not equipment_id or equipment_id not in covered_equipment_ids:
            continue
        exposure_value = equipment_assessed_exposure_value(equipment, hourly_cost)
        if exposure_value <= 0:
            continue
        production_impact = production_impact_from_criticality(equipment.get("criticality")) or 0
        if equipment_id in program_covered_equipment_ids:
            control_status = "Maintenance Program"
        elif equipment_id in pm_import_equipment_ids:
            control_status = "Imported PM Plan"
        else:
            control_status = "Covered"
        covered_evidence.append(
            {
                "asset": equipment.get("name") or equipment_id,
                "tag": equipment.get("tag"),
                "failure_mode": control_status,
                "description": "Assessed equipment with an active maintenance program or imported PM plan",
                "equipment_type": equipment.get("equipment_type_id"),
                "criticality": equipment.get("criticality"),
                "production_impact": production_impact,
                "exposure_value": exposure_value,
                "exposure_formatted": format_currency(exposure_value, currency_symbol),
                "control_status": control_status,
                "id": equipment_id,
            }
        )

    assessment_scope_equipment = [
        eq for eq in equipment_nodes if _equipment_level_key(eq.get("level")) in ASSESSMENT_COVERAGE_LEVELS
    ]
    assessed_in_scope_count = sum(
        1 for eq in assessment_scope_equipment if _is_equipment_production_assessed(eq)
    )
    assessment_scope_total = len(assessment_scope_equipment)
    assessment_coverage_pct = (
        (assessed_in_scope_count / assessment_scope_total * 100)
        if assessment_scope_total > 0
        else 0.0
    )
    unassessed_assessment_evidence: List[dict] = []
    for equipment in assessment_scope_equipment:
        if _is_equipment_production_assessed(equipment):
            continue
        equipment_id = equipment.get("id")
        level_key = _equipment_level_key(equipment.get("level"))
        unassessed_assessment_evidence.append(
            {
                "asset": equipment.get("name") or equipment_id,
                "tag": equipment.get("tag"),
                "level": level_key,
                "level_label": _assessment_level_display(level_key),
                "control_status": "Not assessed",
                "exposure_formatted": "—",
                "id": equipment_id,
            }
        )
    unassessed_assessment_count = len(unassessed_assessment_evidence)

    active_threat_evidence = []
    controlled_active_evidence = []
    resolved_exposure_evidence = []

    for obs in all_observations:
        equipment_id = obs.get("linked_equipment_id")
        equipment = equipment_map.get(equipment_id) if equipment_id else None

        production_impact = 3
        if equipment and equipment.get("criticality"):
            production_impact = production_impact_from_criticality(equipment.get("criticality")) or 3
        else:
            production_impact = severity_to_production_impact(obs.get("risk_level"))

        exposure_value = calculate_production_value(production_impact, hourly_cost)

        created_at = obs.get("created_at", "")
        if isinstance(created_at, datetime):
            created_at = created_at.isoformat()

        failure_mode_id = obs.get("failure_mode_id")
        equipment_type_id = equipment.get("equipment_type_id") if equipment else None
        obs_id = obs.get("id")

        has_control = (
            equipment_type_id in controlled_equipment_types
            or failure_mode_id in controlled_failure_modes
            or f"{equipment_id}_{failure_mode_id}" in efm_with_strategy
            or obs_id in threat_ids_with_actions
        )

        status = obs.get("status") or ""
        is_before_current_period = created_at and created_at < current_period_start.isoformat()

        description = obs.get("user_context") or obs.get("description") or ""
        title = (
            obs.get("title")
            or obs.get("failure_mode")
            or (description[:80] if description else "Untitled Observation")
        )
        observation_data = {
            "title": title,
            "asset": obs.get("asset") or equipment.get("name") if equipment else "Unassigned",
            "failure_mode": obs.get("failure_mode") or description[:50],
            "description": description[:100],
            "created_at": created_at,
            "equipment_type": equipment_type_id,
            "production_impact": production_impact,
            "severity": obs.get("risk_level"),
            "risk_score": observation_risk_score(obs),
            "risk_level": obs.get("risk_level"),
            "exposure_value": exposure_value,
            "exposure_formatted": format_currency(exposure_value, currency_symbol),
            "status": status,
            "source": "threat",
            "id": obs_id,
            "has_actions": obs_id in threat_ids_with_actions,
            "work_signal": project_list_item(obs),
        }

        if is_mitigated_observation_status(status):
            resolved_exposure += exposure_value
            if is_before_current_period:
                prev_resolved_exposure += exposure_value
            resolved_exposure_evidence.append(
                {
                    **observation_data,
                    "control_status": "Mitigated",
                }
            )
            continue

        is_active = is_active_observation_status(status)
        if not is_active:
            continue

        if not has_control:
            active_threat_exposure += exposure_value
            if is_before_current_period:
                prev_active_threat += exposure_value
            active_threat_evidence.append(
                {
                    **observation_data,
                    "control_status": "No Control",
                }
            )
        else:
            controlled_active_exposure += exposure_value
            if is_before_current_period:
                prev_controlled_active += exposure_value
            controlled_active_evidence.append(
                {
                    **observation_data,
                    "control_status": "Controlled",
                }
            )

    return {
        "total_lifecycle_exposure": total_lifecycle_exposure,
        "assessed_equipment_count": assessed_equipment_count,
        "covered_by_controls": covered_by_controls,
        "covered_equipment_count": covered_equipment_count,
        "uncovered_exposure": uncovered_exposure,
        "uncovered_equipment_count": uncovered_equipment_count,
        "prev_covered": prev_covered,
        "prev_uncovered": prev_uncovered,
        "active_threat_exposure": active_threat_exposure,
        "controlled_active_exposure": controlled_active_exposure,
        "resolved_exposure": resolved_exposure,
        "prev_active_threat": prev_active_threat,
        "prev_controlled_active": prev_controlled_active,
        "prev_resolved_exposure": prev_resolved_exposure,
        "active_maintenance_program_count": active_maintenance_program_count,
        "assessment_scope_total": assessment_scope_total,
        "assessed_in_scope_count": assessed_in_scope_count,
        "assessment_coverage_pct": assessment_coverage_pct,
        "unassessed_assessment_count": unassessed_assessment_count,
        "covered_evidence": covered_evidence,
        "uncovered_evidence": uncovered_evidence,
        "unassessed_assessment_evidence": unassessed_assessment_evidence,
        "active_threat_evidence": active_threat_evidence,
        "controlled_active_evidence": controlled_active_evidence,
        "resolved_exposure_evidence": resolved_exposure_evidence,
    }
