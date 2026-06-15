"""
Shared outcome metric helpers — Convergence Phase 5.

Extracted from action_outcome_service for fleet and strategy aggregation.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

OUTCOME_WINDOWS: Tuple[int, ...] = (30, 60, 90)
PRIMARY_WINDOW_DAYS = 90
FLEET_OUTCOME_WINDOW_DAYS = 90
COMPLETED_STATUSES = frozenset({"completed", "closed"})
ASSESSED_OUTCOME_STATUSES = frozenset({"successful", "unsuccessful", "neutral"})


def parse_dt(value: Any) -> Optional[datetime]:
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


def closure_date(action: dict) -> Optional[datetime]:
    return parse_dt(action.get("completed_at")) or parse_dt(action.get("updated_at"))


def datetime_range_query(field: str, start: datetime, end: datetime) -> dict:
    """Match a field stored as BSON datetime or ISO string."""
    start_iso = start.isoformat()
    end_iso = end.isoformat()
    return {
        "$or": [
            {field: {"$gte": start, "$lt": end}},
            {field: {"$gte": start_iso, "$lt": end_iso}},
        ]
    }


def compute_outcome_status(
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


def exposure_label(currency: str) -> str:
    symbols = {"EUR": "€", "USD": "$", "GBP": "£"}
    symbol = symbols.get(currency)
    if symbol:
        return f"Exposure reduction ({symbol}, proxy)"
    return f"Exposure reduction ({currency}, proxy)"


def action_effectiveness_score(
    *,
    assessed_count: int,
    successful_count: int,
    avg_risk_reduction_pct: Optional[float],
) -> Optional[float]:
    """Composite 0–100 score from assessed action outcomes."""
    if assessed_count <= 0:
        return None
    success_rate = successful_count / assessed_count
    risk_component = min(50.0, max(0.0, (avg_risk_reduction_pct or 0.0) * 0.5))
    return round(min(100.0, success_rate * 50.0 + risk_component), 1)


def strategy_coverage_effectiveness_score(
    *,
    strategy_coverage_pct: Optional[float],
    action_effectiveness: Optional[float],
    repeat_failure_rate: Optional[float],
) -> Optional[float]:
    """Simple composite of strategy coverage and action outcomes."""
    if strategy_coverage_pct is None and action_effectiveness is None:
        return None
    coverage_component = (strategy_coverage_pct or 0.0) * 0.35
    action_component = (action_effectiveness or 0.0) * 0.5
    repeat_penalty = min(15.0, (repeat_failure_rate or 0.0) * 100.0 * 0.15)
    return round(max(0.0, min(100.0, coverage_component + action_component - repeat_penalty)), 1)
