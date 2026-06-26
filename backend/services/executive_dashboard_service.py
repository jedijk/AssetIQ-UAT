"""
Executive dashboard service — Wave 5 convergence (thin facade).

Builds dashboard payloads; routes delegate here. Snapshots via executive_dashboard_materializer.
"""
from services.executive_dashboard_kpis import (
    build_executive_dashboard,
    get_or_compute_executive_dashboard,
)
from services.executive_dashboard_models import (
    TERMINAL_OBSERVATION_STATUSES,
    ExecutiveDashboardResponse,
    ExposureMetrics,
    KPICard,
    calculate_production_value,
    calculate_trend,
    format_currency,
    is_active_observation_status,
    is_high_exposure_observation,
    is_mitigated_observation_status,
    observation_risk_score_value,
    severity_to_production_impact,
)

__all__ = [
    "TERMINAL_OBSERVATION_STATUSES",
    "ExecutiveDashboardResponse",
    "ExposureMetrics",
    "KPICard",
    "is_active_observation_status",
    "is_mitigated_observation_status",
    "observation_risk_score_value",
    "is_high_exposure_observation",
    "severity_to_production_impact",
    "calculate_production_value",
    "format_currency",
    "calculate_trend",
    "build_executive_dashboard",
    "get_or_compute_executive_dashboard",
]
