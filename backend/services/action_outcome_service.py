"""
Action outcome intelligence — composition service (Phase 3).

Compares before/after equipment threat, exposure, and risk metrics for closed actions.
Reuses production exposure helpers, threat history, and stored outcomes/reliability_impacts.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from database import db
from repositories.threat_repository import ThreatRepository
from services.action_service import assert_action_installation_scope, find_central_action
from services.production_exposure import equipment_assessed_exposure_value
from services.tenant_schema import merge_tenant_filter

_threat_repo = ThreatRepository(db)

OUTCOME_WINDOWS: Tuple[int, ...] = (30, 60, 90)
PRIMARY_WINDOW_DAYS = 90
COMPLETED_STATUSES = frozenset({"completed", "closed"})


def _parse_dt(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _closure_date(action: dict) -> Optional[datetime]:
    return _parse_dt(action.get("completed_at")) or _parse_dt(action.get("updated_at"))


async def _resolve_equipment_id(action: dict, user: dict) -> Optional[str]:
    eq_id = action.get("linked_equipment_id")
    if eq_id:
        return eq_id

    threat_id = action.get("threat_id") or (
        action.get("source_id") if action.get("source_type") == "threat" else None
    )
    if threat_id:
        threat = await _threat_repo.find_one(
            {"id": threat_id},
            user=user,
            projection={"_id": 0, "linked_equipment_id": 1},
        )
        return (threat or {}).get("linked_equipment_id")

    if action.get("source_type") == "investigation" and action.get("source_id"):
        from repositories.investigation_repository import InvestigationRepository

        inv = await InvestigationRepository(db).find_one(
            {"id": action["source_id"]},
            user=user,
            projection={"_id": 0, "asset_id": 1},
        )
        return (inv or {}).get("asset_id")
    return None


async def _get_production_cost(user_id: str) -> Tuple[float, str]:
    doc = await db.production_loss_config.find_one(
        {"created_by": user_id},
        {"_id": 0, "hourly_cost": 1, "currency": 1},
    ) or {}
    return float(doc.get("hourly_cost") or 500.0), str(doc.get("currency") or "EUR")


def _is_repeat_failure(
    threat: dict,
    *,
    failure_mode: Optional[str],
    failure_mode_id: Optional[str],
) -> bool:
    if failure_mode_id and threat.get("failure_mode_id") == failure_mode_id:
        return True
    if failure_mode and threat.get("failure_mode") == failure_mode:
        return True
    return False


async def _period_metrics(
    equipment_id: str,
    start: datetime,
    end: datetime,
    user: dict,
    equipment: Optional[dict],
    hourly_cost: float,
    *,
    failure_mode: Optional[str] = None,
    failure_mode_id: Optional[str] = None,
    count_repeats: bool = False,
) -> Dict[str, Any]:
    query = merge_tenant_filter(
        {
            "linked_equipment_id": equipment_id,
            "created_at": {"$gte": start.isoformat(), "$lt": end.isoformat()},
        },
        user,
    )
    threats = await db.threats.find(
        query,
        {"_id": 0, "risk_score": 1, "failure_mode": 1, "failure_mode_id": 1},
    ).to_list(500)

    threat_count = len(threats)
    risk_score_total = sum(int(t.get("risk_score") or 0) for t in threats)
    eq_exposure = equipment_assessed_exposure_value(equipment or {}, hourly_cost)

    if risk_score_total > 0:
        exposure_proxy = round(eq_exposure * (risk_score_total / 100.0), 2)
    else:
        exposure_proxy = round(eq_exposure * threat_count, 2) if threat_count else 0.0

    repeat_failure_count = 0
    if count_repeats:
        repeat_failure_count = sum(
            1
            for t in threats
            if _is_repeat_failure(
                t,
                failure_mode=failure_mode,
                failure_mode_id=failure_mode_id,
            )
        )

    return {
        "threat_count": threat_count,
        "risk_score_total": risk_score_total,
        "exposure_proxy": exposure_proxy,
        "exposure_is_proxy": True,
        "repeat_failure_count": repeat_failure_count,
    }


def _compute_outcome_status(
    before: Dict[str, Any],
    after: Dict[str, Any],
    repeat_count: int,
) -> Tuple[str, float, float]:
    before_risk = before["risk_score_total"]
    after_risk = after["risk_score_total"]
    before_threats = before["threat_count"]
    after_threats = after["threat_count"]

    if before_risk > 0:
        risk_reduction_pct = ((before_risk - after_risk) / before_risk) * 100
    elif before_threats > 0:
        risk_reduction_pct = ((before_threats - after_threats) / before_threats) * 100
    elif after_threats == 0:
        risk_reduction_pct = 0.0
    else:
        risk_reduction_pct = -100.0

    exposure_reduction = before["exposure_proxy"] - after["exposure_proxy"]

    if risk_reduction_pct >= 10 and repeat_count == 0 and after_threats <= before_threats:
        status = "successful"
    elif risk_reduction_pct <= -5 or repeat_count >= 2 or after_threats > before_threats:
        status = "unsuccessful"
    else:
        status = "neutral"

    return status, risk_reduction_pct, exposure_reduction


def _exposure_label(currency: str) -> str:
    symbols = {"EUR": "€", "USD": "$", "GBP": "£"}
    symbol = symbols.get(currency)
    if symbol:
        return f"Exposure reduction ({symbol}, proxy)"
    return f"Exposure reduction ({currency}, proxy)"


async def get_action_outcome(action_id: str, user: dict) -> Dict[str, Any]:
    """Assess whether a closed action improved equipment reliability outcomes."""
    action = await find_central_action(action_id, user)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    await assert_action_installation_scope(user, action)

    action_status = (action.get("status") or "").lower()
    if action_status not in COMPLETED_STATUSES:
        return {
            "action_id": action_id,
            "status": "pending",
            "action_status": action.get("status"),
            "message": "Outcome assessment is available after the action is completed.",
        }

    closure = _closure_date(action)
    if not closure:
        return {
            "action_id": action_id,
            "status": "pending",
            "action_status": action.get("status"),
            "message": "Completion date unavailable; outcome cannot be assessed yet.",
        }

    equipment_id = await _resolve_equipment_id(action, user)
    if not equipment_id:
        return {
            "action_id": action_id,
            "status": "insufficient_data",
            "message": "No linked equipment found for this action.",
        }

    equipment = await db.equipment_nodes.find_one(
        {"id": equipment_id},
        {"_id": 0, "criticality": 1, "name": 1, "tag": 1},
    )
    hourly_cost, currency = await _get_production_cost(user["id"])

    failure_mode: Optional[str] = None
    failure_mode_id: Optional[str] = None
    threat_id = action.get("threat_id") or (
        action.get("source_id") if action.get("source_type") == "threat" else None
    )
    if threat_id:
        source_threat = await _threat_repo.find_one(
            {"id": threat_id},
            user=user,
            projection={"_id": 0, "failure_mode": 1, "failure_mode_id": 1},
        )
        if source_threat:
            failure_mode = source_threat.get("failure_mode")
            failure_mode_id = source_threat.get("failure_mode_id")

    stored_outcome = await db.outcomes.find_one(
        merge_tenant_filter({"action_id": action_id}, user),
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    stored_impacts: List[dict] = []
    if stored_outcome and stored_outcome.get("id"):
        stored_impacts = await db.reliability_impacts.find(
            merge_tenant_filter({"outcome_id": stored_outcome["id"]}, user),
            {"_id": 0},
        ).to_list(20)

    now = datetime.now(timezone.utc)
    windows: Dict[str, Dict[str, Any]] = {}
    for days in OUTCOME_WINDOWS:
        before_start = closure - timedelta(days=days)
        after_end = min(now, closure + timedelta(days=days))
        after_elapsed_days = max(0, (after_end - closure).days)

        before = await _period_metrics(
            equipment_id,
            before_start,
            closure,
            user,
            equipment,
            hourly_cost,
        )
        after = await _period_metrics(
            equipment_id,
            closure,
            after_end,
            user,
            equipment,
            hourly_cost,
            failure_mode=failure_mode,
            failure_mode_id=failure_mode_id,
            count_repeats=True,
        )
        repeat_count = after["repeat_failure_count"]
        outcome_status, risk_reduction_pct, exposure_reduction = _compute_outcome_status(
            before, after, repeat_count
        )
        windows[str(days)] = {
            "window_days": days,
            "before": before,
            "after": after,
            "after_elapsed_days": after_elapsed_days,
            "risk_reduction_pct": round(risk_reduction_pct, 1),
            "exposure_reduction": round(exposure_reduction, 2),
            "repeat_failure_count": repeat_count,
            "outcome_status": outcome_status,
        }

    primary = windows[str(PRIMARY_WINDOW_DAYS)]
    return {
        "action_id": action_id,
        "status": "assessed",
        "equipment_id": equipment_id,
        "equipment_name": (equipment or {}).get("name") or (equipment or {}).get("tag"),
        "closure_date": closure.isoformat(),
        "currency": currency,
        "exposure_label": _exposure_label(currency),
        "risk_reduction_pct": primary["risk_reduction_pct"],
        "exposure_reduction": primary["exposure_reduction"],
        "repeat_failure_count": primary["repeat_failure_count"],
        "outcome_status": primary["outcome_status"],
        "windows": windows,
        "stored_outcome": stored_outcome,
        "stored_reliability_impacts": stored_impacts,
    }
