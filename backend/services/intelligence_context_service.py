"""Intelligence Context Panel — aggregated upstream/downstream relationships."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from database import db
from services.cache_service import cache
from services.equipment_type_registry import list_equipment_types
from services.intelligence_map_routes_service import (
    _active_v2_program_match,
    _intelligence_map_schedule_query,
    _scope_query,
)
from services.tenant_schema import tenant_id_from_user

logger = logging.getLogger(__name__)

_FREQUENCY_DAYS = {
    "continuous": 1,
    "daily": 1,
    "weekly": 7,
    "bi_weekly": 14,
    "monthly": 30,
    "quarterly": 90,
    "semi_annual": 180,
    "annual": 365,
    "biennial": 730,
    "on_condition": 30,
}

_EQUIPMENT_LEVELS = [
    "equipment_unit",
    "equipment",
    "subunit",
    "maintainable_item",
    "unit",
]


def _annual_occurrences(frequency: Optional[str]) -> float:
    key = (frequency or "annual").strip().lower()
    days = _FREQUENCY_DAYS.get(key, 365)
    return 365.0 / max(float(days), 1.0)


def _format_date(value: Any) -> Optional[str]:
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value[:10] if len(value) >= 10 else value
    else:
        return str(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%d-%b-%Y")


def _risk_reduction_rating(
    failure_modes_count: int,
    high_criticality_count: int,
    assets_count: int,
) -> str:
    if failure_modes_count >= 20 or high_criticality_count >= 5 or assets_count >= 50:
        return "High"
    if failure_modes_count >= 5 or assets_count >= 10:
        return "Medium"
    return "Low"


async def _estimate_annual_planned_work_and_labor(
    equipment_type_id: str,
    *,
    scope,
    strategy: Optional[dict],
) -> tuple[int, int]:
    """Estimate annual planned work instances and labor hours from applied programs."""
    programs = await db.maintenance_programs_v2.find(
        scope(
            _active_v2_program_match(
                {
                    "equipment_type_id": equipment_type_id,
                    "strategy_tasks": {"$gt": 0},
                }
            )
        ),
        {"tasks": 1, "_id": 0},
    ).to_list(1000)

    annual_tasks = 0.0
    labor_hours = 0.0

    if programs:
        for program in programs:
            for task in program.get("tasks") or []:
                if task.get("is_active") is False:
                    continue
                occ = _annual_occurrences(task.get("frequency"))
                annual_tasks += occ
                labor_hours += occ * float(
                    task.get("estimated_duration_hours")
                    or task.get("duration_hours")
                    or 1.0
                )
        return int(round(annual_tasks)), int(round(labor_hours))

    if not strategy:
        return 0, 0

    equipment_count = await db.equipment_nodes.count_documents(
        scope(
            {
                "equipment_type_id": equipment_type_id,
                "level": {"$in": _EQUIPMENT_LEVELS},
            }
        )
    )
    if equipment_count <= 0:
        return 0, 0

    for template in strategy.get("task_templates") or []:
        freq_matrix = template.get("frequency_matrix") or {}
        freq = (
            freq_matrix.get("medium")
            or freq_matrix.get("high")
            or freq_matrix.get("low")
            or "annual"
        )
        occ = _annual_occurrences(freq) * equipment_count
        annual_tasks += occ
        labor_hours += occ * float(template.get("duration_hours") or 1.0)

    return int(round(annual_tasks)), int(round(labor_hours))


async def _resolve_equipment_type(
    equipment_type_id: str,
    *,
    strategy: Optional[dict] = None,
) -> Optional[dict]:
    """Resolve equipment type metadata from registry, ISO library, or strategy doc."""
    types = await list_equipment_types(db, {"id": equipment_type_id}, limit=1)
    if types:
        return types[0]

    try:
        from iso14224_models import EQUIPMENT_TYPES

        iso_type = next(
            (t for t in EQUIPMENT_TYPES if t.get("id") == equipment_type_id),
            None,
        )
        if iso_type:
            return iso_type
    except Exception as exc:
        logger.debug("ISO equipment type lookup failed for %s: %s", equipment_type_id, exc)

    if strategy:
        return {
            "id": equipment_type_id,
            "name": strategy.get("equipment_type_name") or equipment_type_id,
        }

    exists = await db.equipment_nodes.find_one(
        {"equipment_type_id": equipment_type_id},
        {"_id": 1},
    )
    if exists:
        return {
            "id": equipment_type_id,
            "name": equipment_type_id.replace("_", " ").title(),
        }

    return None


async def get_strategy_intelligence_context(
    equipment_type_id: str,
    *,
    current_user: dict,
) -> Dict[str, Any]:
    """Single-request context payload for the Strategy Detail Intelligence Context panel."""
    equipment_type_id = (equipment_type_id or "").strip()
    if not equipment_type_id:
        raise HTTPException(status_code=400, detail="equipment_type_id is required")

    tenant_key = tenant_id_from_user(current_user) or "legacy"
    cache_key = f"intelligence_context:strategy:{tenant_key}:{equipment_type_id}"
    cached = cache.get_stat_entry(cache_key)
    if cached:
        return cached

    scope = lambda q: _scope_query(q, current_user)

    strategy = await db.equipment_type_strategies.find_one(
        scope({"equipment_type_id": equipment_type_id}),
        {"_id": 0},
    )

    equipment_type = await _resolve_equipment_type(
        equipment_type_id,
        strategy=strategy,
    )
    if not equipment_type:
        raise HTTPException(status_code=404, detail="Equipment type not found")

    fm_strategies = (strategy or {}).get("failure_mode_strategies") or []
    fm_ids = [
        fm.get("failure_mode_id")
        for fm in fm_strategies
        if fm.get("failure_mode_id")
    ]

    fm_docs_by_id: Dict[str, dict] = {}
    if fm_ids:
        cursor = db.failure_modes.find(
            scope({"id": {"$in": fm_ids}}),
            {"_id": 0, "id": 1, "failure_mode": 1, "criticality": 1, "rpn": 1},
        )
        fm_docs_by_id = {doc["id"]: doc async for doc in cursor}

    failure_modes: List[Dict[str, Any]] = []
    criticality_distribution: Dict[str, int] = {"high": 0, "medium": 0, "low": 0, "unknown": 0}

    for row in fm_strategies:
        fm_id = row.get("failure_mode_id")
        doc = fm_docs_by_id.get(fm_id) or {}
        name = row.get("failure_mode_name") or doc.get("failure_mode") or "Unknown"
        crit_raw = (doc.get("criticality") or row.get("criticality") or "unknown").lower()
        if crit_raw not in criticality_distribution:
            crit_raw = "unknown"
        criticality_distribution[crit_raw] += 1
        failure_modes.append(
            {
                "id": fm_id,
                "name": name,
                "criticality": crit_raw,
                "enabled": row.get("enabled", True),
            }
        )

    equipment_query = {
        "equipment_type_id": equipment_type_id,
        "level": {"$in": _EQUIPMENT_LEVELS},
    }
    assets_count = await db.equipment_nodes.count_documents(scope(equipment_query))
    parent_ids = await db.equipment_nodes.distinct("parent_id", scope(equipment_query))
    systems_count = len({pid for pid in parent_ids if pid})

    program_query = {"equipment_type_id": equipment_type_id}
    programs_count = await db.maintenance_programs_v2.count_documents(
        scope(_active_v2_program_match(program_query))
    )

    schedule_query = _intelligence_map_schedule_query(equipment_type_id)
    schedules_count = await db.scheduled_tasks.count_documents(scope(schedule_query))

    planned_work_per_year, estimated_labor_hours = await _estimate_annual_planned_work_and_labor(
        equipment_type_id,
        scope=scope,
        strategy=strategy,
    )

    fm_count = len(failure_modes)
    high_crit = criticality_distribution.get("high", 0)
    risk_reduction = _risk_reduction_rating(fm_count, high_crit, assets_count)

    et_name = equipment_type.get("name") or equipment_type_id
    strategy_status = (strategy or {}).get("status") or ("none" if not strategy else "active")
    last_updated = _format_date(
        (strategy or {}).get("updated_at")
        or (strategy or {}).get("last_modified")
        or (strategy or {}).get("created_at")
    )

    flow_nodes = [
        {
            "key": "failure_modes",
            "label": "Failure Modes",
            "count": fm_count,
            "active": False,
        },
        {
            "key": "equipment_types",
            "label": "Equipment Types",
            "count": 1,
            "active": False,
        },
        {
            "key": "strategy",
            "label": "Strategy",
            "count": 1 if strategy else 0,
            "active": True,
        },
        {
            "key": "programs",
            "label": "Programs",
            "count": programs_count,
            "active": False,
        },
        {
            "key": "schedules",
            "label": "Schedules",
            "count": schedules_count,
            "active": False,
        },
        {
            "key": "planned_work",
            "label": "Planned Work",
            "count": planned_work_per_year,
            "active": False,
        },
    ]

    result = {
        "object_type": "strategy",
        "object_id": equipment_type_id,
        "summary": {
            "name": et_name,
            "strategy_type": "Equipment Type Strategy",
            "status": strategy_status,
            "last_updated": last_updated,
            "task_templates_count": len((strategy or {}).get("task_templates") or []),
        },
        "origin": {
            "heading": "Where Does This Strategy Come From?",
            "failure_modes": failure_modes,
            "total_failure_modes": fm_count,
            "criticality_distribution": criticality_distribution,
        },
        "equipment_coverage": {
            "heading": "What Does This Strategy Protect?",
            "equipment_types": [
                {
                    "id": equipment_type_id,
                    "name": et_name,
                }
            ],
            "equipment_types_count": 1,
            "assets_count": assets_count,
            "systems_count": systems_count,
        },
        "downstream": {
            "heading": "What Does This Strategy Create?",
            "programs_count": programs_count,
            "schedules_count": schedules_count,
            "planned_work_per_year": planned_work_per_year,
        },
        "intelligence_flow": {
            "heading": "Intelligence Thread",
            "nodes": flow_nodes,
        },
        "business_impact": {
            "heading": "Expected Outcome",
            "assets_covered": assets_count,
            "planned_work_per_year": planned_work_per_year,
            "estimated_labor_hours_per_year": estimated_labor_hours,
            "failure_modes_controlled": fm_count,
            "risk_reduction": risk_reduction,
        },
    }
    cache.set_stats(cache_key, result)
    return result
