"""Executive dashboard models, constants, and formatting helpers."""
from typing import Optional, Dict, Any, List
from datetime import datetime
from pydantic import BaseModel

from services.production_exposure import production_exposure_monetary_value

HIGH_ACTIVE_RISK_THRESHOLD = 50
HIGH_EXPOSURE_RISK_LEVELS = {"high", "critical"}

TERMINAL_OBSERVATION_STATUSES = {
    "mitigated", "learning", "closed", "resolved", "completed",
    "done", "dismissed", "archived", "cancelled",
}


def is_active_observation_status(status: Optional[str]) -> bool:
    """Non-terminal observations — aligned with Observations page default status filter."""
    normalized = (status or "").lower().strip()
    if not normalized:
        return True
    return normalized not in TERMINAL_OBSERVATION_STATUSES


def is_mitigated_observation_status(status: Optional[str]) -> bool:
    """Observations that completed the mitigated journey stage."""
    return (status or "").lower().strip() == "mitigated"


def observation_risk_score_value(obs: dict) -> float:
    raw = obs.get("risk_score")
    if raw is None or raw == "":
        return 0.0
    try:
        return float(raw)
    except (TypeError, ValueError):
        return 0.0


def is_high_exposure_observation(obs: dict) -> bool:
    """High exposure = active observation with High/Critical risk (score or level)."""
    if observation_risk_score_value(obs) >= HIGH_ACTIVE_RISK_THRESHOLD:
        return True
    return (obs.get("risk_level") or "").lower().strip() in HIGH_EXPOSURE_RISK_LEVELS


class ExposureMetrics(BaseModel):
    """Exposure metrics for the executive dashboard"""
    total_lifecycle_exposure: float
    covered_by_controls: float
    uncovered_exposure: float
    active_threat_exposure: float
    critical_active_exposure: float
    resolved_exposure: float = 0.0
    currency: str = "EUR"
    currency_symbol: str = "€"


class KPICard(BaseModel):
    """KPI card with trend indicator"""
    value: float
    formatted_value: str
    previous_value: Optional[float] = None
    change_percent: Optional[float] = None
    trend: Optional[str] = None
    tooltip: str
    evidence_count: int = 0
    total_submitted_count: Optional[int] = None
    week_submitted_count: Optional[int] = None
    previous_formatted: Optional[str] = None
    report_period_label: Optional[str] = None
    previous_period_label: Optional[str] = None


class ExecutiveDashboardResponse(BaseModel):
    """Complete executive dashboard response"""
    exposure_metrics: ExposureMetrics
    kpi_cards: Dict[str, KPICard]
    waterfall_data: List[Dict[str, Any]]
    ai_summary: str
    evidence_drill_down: Dict[str, List[Dict[str, Any]]]
    last_updated: str
    report_period: Dict[str, Any]
    outcome_summary: Optional[Dict[str, Any]] = None


def severity_to_production_impact(severity: str) -> int:
    """Convert observation severity to production impact score (1-5)"""
    severity_map = {
        "critical": 5,
        "high": 4,
        "medium": 3,
        "low": 2,
        "minimal": 1,
        "none": 1
    }
    return severity_map.get((severity or "").lower(), 3)


def calculate_production_value(production_impact: int, hourly_cost: float) -> float:
    """Convert production impact score (1-5) to monetary value (workspace-aligned)."""
    return production_exposure_monetary_value(production_impact, hourly_cost)


def format_currency(value: float, symbol: str) -> str:
    """Format currency value for display"""
    if value >= 1_000_000_000:
        return f"{symbol}{value/1_000_000_000:.1f}B"
    elif value >= 1_000_000:
        return f"{symbol}{value/1_000_000:.1f}M"
    elif value >= 1_000:
        return f"{symbol}{value/1_000:.0f}K"
    else:
        return f"{symbol}{value:,.0f}"


def calculate_trend(current: float, previous: float, higher_is_better: bool = False) -> tuple:
    """Calculate trend and percentage change"""
    if previous == 0:
        if current == 0:
            return 0, "stable"
        return 100 if current > 0 else -100, "degrading" if not higher_is_better else "improving"

    change_percent = ((current - previous) / previous) * 100

    if abs(change_percent) < 2:
        return round(change_percent, 1), "stable"

    if higher_is_better:
        return round(change_percent, 1), "improving" if change_percent > 0 else "degrading"
    else:
        return round(change_percent, 1), "degrading" if change_percent > 0 else "improving"


def _datetime_range_query(field: str, start: datetime, end: datetime) -> dict:
    """Match a field stored as BSON datetime or ISO string."""
    start_iso = start.isoformat()
    end_iso = end.isoformat()
    return {
        "$or": [
            {field: {"$gte": start, "$lt": end}},
            {field: {"$gte": start_iso, "$lt": end_iso}},
        ]
    }
