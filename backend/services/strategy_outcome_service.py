"""
Strategy outcome effectiveness — Convergence Phase 5.

Measures maintenance strategy/program impact via completed action outcomes.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from database import db, installation_filter
from services.action_outcome_service import assess_closed_action_outcome
from services.outcome_intelligence_service import _aggregate_assessments, _fetch_completed_actions
from services.outcome_metrics import FLEET_OUTCOME_WINDOW_DAYS, strategy_coverage_effectiveness_score
from services.tenant_schema import merge_tenant_filter

logger = logging.getLogger(__name__)

MAX_STRATEGY_ACTIONS_TO_ASSESS = 50


async def _covered_equipment_ids(strategy_id: str, user: dict) -> List[str]:
    """Equipment covered by an equipment-type strategy (v2 model)."""
    installation_ids = await installation_filter.get_user_installation_ids(user)
    if not installation_ids:
        return []

    scoped_ids = await installation_filter.get_all_equipment_ids_for_installations(
        installation_ids, user.get("id")
    )
    if not scoped_ids:
        return []

    scoped_set = set(scoped_ids)
    by_type = await db.equipment_nodes.find(
        merge_tenant_filter(
            {"equipment_type_id": strategy_id, "id": {"$in": list(scoped_set)}},
            user,
        ),
        {"_id": 0, "id": 1},
    ).to_list(5000)

    program_ids = await db.maintenance_programs_v2.distinct(
        "equipment_id",
        merge_tenant_filter(
            {
                "equipment_id": {"$in": list(scoped_set)},
                "status": {"$nin": ["archived", "superseded"]},
            },
            user,
        ),
    )

    covered = {row["id"] for row in by_type if row.get("id")}
    for eq_id in program_ids:
        if eq_id in scoped_set:
            doc = await db.equipment_nodes.find_one(
                merge_tenant_filter({"id": eq_id, "equipment_type_id": strategy_id}, user),
                {"_id": 0, "id": 1},
            )
            if doc:
                covered.add(eq_id)
    return sorted(covered)


async def compute_strategy_outcome(strategy_id: str, user: dict) -> Dict[str, Any]:
    """
    Assess strategy effectiveness for an equipment-type strategy (v2 id = equipment_type_id).
    """
    strategy = await db.equipment_type_strategies.find_one(
        merge_tenant_filter({"equipment_type_id": strategy_id}, user),
        {"_id": 0},
    )
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    now = datetime.now(timezone.utc)
    since = now - timedelta(days=FLEET_OUTCOME_WINDOW_DAYS)
    covered_equipment_ids = await _covered_equipment_ids(strategy_id, user)

    actions = await _fetch_completed_actions(
        user,
        since=since,
        equipment_ids=covered_equipment_ids,
        limit=MAX_STRATEGY_ACTIONS_TO_ASSESS,
    )

    assessments = await asyncio.gather(
        *[assess_closed_action_outcome(action, user) for action in actions],
        return_exceptions=True,
    )

    parsed: List[dict] = []
    for action, result in zip(actions, assessments):
        if isinstance(result, Exception):
            logger.warning(
                "strategy outcome assessment failed for action %s: %s",
                action.get("id"),
                result,
            )
            parsed.append({
                "action_id": action.get("id"),
                "status": "error",
                "message": str(result),
            })
        else:
            parsed.append(result)

    aggregates = _aggregate_assessments(parsed)
    coverage_pct = None
    if covered_equipment_ids:
        with_outcomes = {
            a.get("equipment_id")
            for a in parsed
            if a.get("status") == "assessed" and a.get("equipment_id")
        }
        coverage_pct = round(len(with_outcomes) / len(covered_equipment_ids) * 100, 1)

    effectiveness = strategy_coverage_effectiveness_score(
        strategy_coverage_pct=coverage_pct,
        action_effectiveness=aggregates.get("action_effectiveness_score"),
        repeat_failure_rate=aggregates.get("repeat_failure_rate"),
    )

    apply_records = await db.strategy_version_history.find(
        merge_tenant_filter({"entity_id": strategy_id}, user),
        {"_id": 0, "version": 1, "applied_at": 1, "created_at": 1},
    ).sort("created_at", -1).limit(5).to_list(5)

    return {
        "strategy_id": strategy_id,
        "equipment_type_id": strategy_id,
        "strategy_name": strategy.get("name") or strategy.get("equipment_type_name"),
        "strategy_status": strategy.get("status"),
        "strategy_version": strategy.get("version"),
        "window_days": FLEET_OUTCOME_WINDOW_DAYS,
        "generated_at": now.isoformat(),
        "covered_equipment_count": len(covered_equipment_ids),
        "covered_equipment_ids": covered_equipment_ids[:25],
        "actions_completed_count": aggregates["completed_actions_count"],
        "actions_assessed_count": aggregates["assessed_actions_count"],
        "avg_risk_reduction_pct": aggregates["avg_risk_reduction_pct"],
        "total_exposure_reduction": aggregates["total_exposure_reduction"],
        "exposure_delta": aggregates["total_exposure_reduction"],
        "repeat_failure_count": aggregates["repeat_failure_count"],
        "repeat_failure_rate": aggregates["repeat_failure_rate"],
        "successful_count": aggregates["successful_count"],
        "unsuccessful_count": aggregates["unsuccessful_count"],
        "strategy_effectiveness_score": effectiveness,
        "action_effectiveness_score": aggregates.get("action_effectiveness_score"),
        "reliability_roi": aggregates.get("reliability_roi"),
        "recent_apply_records": apply_records,
        "action_outcomes": [
            {
                "action_id": a.get("action_id"),
                "equipment_id": a.get("equipment_id"),
                "outcome_status": a.get("outcome_status"),
                "risk_reduction_pct": a.get("risk_reduction_pct"),
                "exposure_reduction": a.get("exposure_reduction"),
                "repeat_failure_count": a.get("repeat_failure_count"),
            }
            for a in parsed
            if a.get("status") == "assessed"
        ],
    }
