"""
KPI ownership registry — Convergence Program Phase 1.

Single source of truth target: ``equipment_reliability_state`` (see
``equipment_reliability_state_service.build_equipment_reliability_state``).

Each KPI maps to one canonical field and lists deprecated calculation sites
to migrate in Convergence 1 / 4.
"""
from __future__ import annotations

from typing import Any, Dict, FrozenSet, List

CANONICAL_PROJECTION = "equipment_reliability_state"

KPI_REGISTRY: Dict[str, Dict[str, Any]] = {
    "health_score": {
        "canonical_field": "health.score",
        "owner_service": "equipment_reliability_state_service",
        "deprecated_sources": (
            "asset_health_materializer.compute_equipment_snapshot",
            "reliability_context_service",
            "ril_predictions.generate_equipment_prediction",
        ),
        "consumers": (
            "executive_dashboard_service",
            "ril_dashboard_service",
            "equipment_reliability_profile_service",
            "ril_copilot_service",
        ),
    },
    "open_signals_count": {
        "canonical_field": "open_observation_count",
        "owner_service": "equipment_reliability_state_service",
        "deprecated_sources": (
            "threat_observation_bridge.count_unified_open_signals",
            "db.threats.count_documents",
            "supervisor_dashboard_service._is_open_threat",
        ),
        "consumers": (
            "supervisor_dashboard_service",
            "executive_dashboard_service",
            "work_signal_projection",
        ),
    },
    "exposure": {
        "canonical_field": "exposure.score",
        "owner_service": "equipment_reliability_state_service",
        "deprecated_sources": (
            "supervisor_dashboard_service._threat_exposure",
            "production_exposure",
        ),
        "consumers": ("supervisor_dashboard_service", "executive_dashboard_service"),
    },
    "risk_level": {
        "canonical_field": "risk_level",
        "owner_service": "equipment_reliability_state_service",
        "deprecated_sources": ("reliability_context_service", "threat.risk_level"),
        "consumers": (
            "equipment_reliability_profile_service",
            "EquipmentReliabilityProfilePage",
            "EquipmentReliabilityTracePage",
        ),
    },
    "graph_fingerprint": {
        "canonical_field": "graph_fingerprint",
        "owner_service": "equipment_reliability_state_service",
        "deprecated_sources": (),
        "consumers": ("equipment_reliability_state_service",),
    },
    "pm_overdue": {
        "canonical_field": "maintenance.overdue_count",
        "owner_service": "equipment_reliability_state_service",
        "deprecated_sources": (
            "asset_health_materializer",
            "supervisor_dashboard_service",
        ),
        "consumers": ("supervisor_dashboard_service", "executive_dashboard_materializer"),
    },
    "strategy_coverage": {
        "canonical_field": "strategy.coverage_pct",
        "owner_service": "equipment_reliability_state_service",
        "deprecated_sources": ("executive_dashboard_materializer", "intelligence_map"),
        "consumers": ("executive_dashboard_service", "intelligence_map"),
    },
    "action_effectiveness_score": {
        "canonical_field": "action_effectiveness_score",
        "owner_service": "outcome_intelligence_service",
        "deprecated_sources": (),
        "consumers": ("executive_dashboard_service", "outcome_intelligence_service"),
    },
    "strategy_effectiveness_score": {
        "canonical_field": "strategy_effectiveness_score",
        "owner_service": "strategy_outcome_service",
        "deprecated_sources": (),
        "consumers": ("strategy_outcome_service", "outcome_intelligence_service"),
    },
    "reliability_roi": {
        "canonical_field": "total_exposure_reduction",
        "owner_service": "outcome_intelligence_service",
        "deprecated_sources": (),
        "consumers": ("executive_dashboard_service", "action_outcome_service"),
    },
}


def list_kpis() -> List[str]:
    return sorted(KPI_REGISTRY.keys())


def deprecated_sources_for_kpi(kpi: str) -> FrozenSet[str]:
    entry = KPI_REGISTRY.get(kpi) or {}
    return frozenset(entry.get("deprecated_sources") or ())


def canonical_field(kpi: str) -> str:
    entry = KPI_REGISTRY.get(kpi)
    if not entry:
        raise KeyError(f"Unknown KPI: {kpi}")
    return str(entry["canonical_field"])
