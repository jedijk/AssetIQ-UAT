"""
Fleet outcome intelligence — Convergence Phase 5.

Aggregates closed-loop reliability outcomes across completed actions.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from database import db, installation_filter
from services.action_outcome_service import assess_closed_action_outcome
from services.equipment_reliability_state_service import compute_fleet_reliability_summary
from services.outcome_metrics import (
    COMPLETED_STATUSES,
    FLEET_OUTCOME_WINDOW_DAYS,
    action_effectiveness_score,
    closure_date,
    datetime_range_query,
    strategy_coverage_effectiveness_score,
)
from services.tenant_schema import merge_tenant_filter

logger = logging.getLogger(__name__)

MAX_ACTIONS_TO_ASSESS = 75


async def _scoped_equipment_ids(user: dict) -> List[str]:
    installation_ids = await installation_filter.get_user_installation_ids(user)
    if not installation_ids:
        return []
    equipment_ids = await installation_filter.get_all_equipment_ids_for_installations(
        installation_ids, user.get("id")
    )
    return list(equipment_ids or [])


async def _fetch_completed_actions(
    user: dict,
    *,
    since: datetime,
    equipment_ids: Optional[List[str]] = None,
    limit: int = MAX_ACTIONS_TO_ASSESS,
) -> List[dict]:
    now = datetime.now(timezone.utc)
    query: Dict[str, Any] = {
        "status": {"$in": list(COMPLETED_STATUSES)},
        **datetime_range_query("completed_at", since, now),
    }
    if equipment_ids is not None:
        if not equipment_ids:
            return []
        query["linked_equipment_id"] = {"$in": equipment_ids}

    cursor = db.central_actions.find(
        merge_tenant_filter(query, user),
        {
            "_id": 0,
            "id": 1,
            "status": 1,
            "completed_at": 1,
            "updated_at": 1,
            "linked_equipment_id": 1,
            "threat_id": 1,
            "source_type": 1,
            "source_id": 1,
        },
    ).sort("completed_at", -1).limit(limit)
    return await cursor.to_list(limit)


def _aggregate_assessments(assessments: List[dict]) -> Dict[str, Any]:
    assessed = [a for a in assessments if a.get("status") == "assessed"]
    risk_values = [a["risk_reduction_pct"] for a in assessed if a.get("risk_reduction_pct") is not None]
    exposure_values = [a["exposure_reduction"] for a in assessed if a.get("exposure_reduction") is not None]
    repeat_total = sum(int(a.get("repeat_failure_count") or 0) for a in assessed)
    successful = sum(1 for a in assessed if a.get("outcome_status") == "successful")
    unsuccessful = sum(1 for a in assessed if a.get("outcome_status") == "unsuccessful")

    avg_risk = round(sum(risk_values) / len(risk_values), 1) if risk_values else None
    total_exposure = round(sum(exposure_values), 2) if exposure_values else 0.0
    repeat_rate = round(repeat_total / len(assessed), 3) if assessed else None
    effectiveness = action_effectiveness_score(
        assessed_count=len(assessed),
        successful_count=successful,
        avg_risk_reduction_pct=avg_risk,
    )

    return {
        "completed_actions_count": len(assessments),
        "assessed_actions_count": len(assessed),
        "pending_or_insufficient_count": len(assessments) - len(assessed),
        "successful_count": successful,
        "unsuccessful_count": unsuccessful,
        "avg_risk_reduction_pct": avg_risk,
        "total_exposure_reduction": total_exposure,
        "repeat_failure_count": repeat_total,
        "repeat_failure_rate": repeat_rate,
        "action_effectiveness_score": effectiveness,
        "reliability_roi": total_exposure,
    }


async def compute_fleet_outcome_summary(user: dict) -> Dict[str, Any]:
    """Aggregate fleet-wide closed-loop outcome metrics for the last 90 days."""
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=FLEET_OUTCOME_WINDOW_DAYS)

    fleet_state, equipment_ids = await asyncio.gather(
        compute_fleet_reliability_summary(user=user),
        _scoped_equipment_ids(user),
    )

    actions = await _fetch_completed_actions(user, since=since, equipment_ids=equipment_ids)
    assessments = await asyncio.gather(
        *[assess_closed_action_outcome(action, user) for action in actions],
        return_exceptions=True,
    )

    parsed: List[dict] = []
    for action, result in zip(actions, assessments):
        if isinstance(result, Exception):
            logger.warning(
                "outcome assessment failed for action %s: %s",
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

    strategy_coverage_pct = None
    active_programs = await db.maintenance_programs_v2.count_documents(
        merge_tenant_filter({"status": {"$nin": ["archived", "superseded"]}}, user)
    )
    if equipment_ids and active_programs:
        covered = await db.maintenance_programs_v2.distinct(
            "equipment_id",
            merge_tenant_filter(
                {
                    "equipment_id": {"$in": equipment_ids},
                    "status": {"$nin": ["archived", "superseded"]},
                },
                user,
            ),
        )
        strategy_coverage_pct = round(len(covered) / len(equipment_ids) * 100, 1)

    coverage_effectiveness = strategy_coverage_effectiveness_score(
        strategy_coverage_pct=strategy_coverage_pct,
        action_effectiveness=aggregates.get("action_effectiveness_score"),
        repeat_failure_rate=aggregates.get("repeat_failure_rate"),
    )

    currency = "EUR"
    for item in parsed:
        if item.get("currency"):
            currency = item["currency"]
            break

    return {
        "window_days": FLEET_OUTCOME_WINDOW_DAYS,
        "generated_at": now.isoformat(),
        "canonical_fleet_state": fleet_state,
        "strategy_coverage_pct": strategy_coverage_pct,
        "strategy_coverage_effectiveness_score": coverage_effectiveness,
        "currency": currency,
        **aggregates,
    }
