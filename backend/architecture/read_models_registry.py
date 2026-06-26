"""
Executive read models — Platform 1.0 WS6.

Derived MongoDB snapshot/projection collections for dashboard and analytics reads.
Operational collections remain authoritative for writes; read models are rebuilt
via materializers, scheduled jobs, or cache-aside refresh on miss.

Verification: scripts/verify_read_models_registry.py
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, FrozenSet, List, Optional, Tuple


@dataclass(frozen=True)
class ReadModelSpec:
    """One materialized read surface (collection + builder)."""

    id: str
    collection: str
    materializer: str
    dashboards: Tuple[str, ...]
    consumer_services: Tuple[str, ...]
    consumer_routes: Tuple[str, ...] = ()
    source_domains: Tuple[str, ...] = ()
    ttl_seconds: Optional[int] = None
    refresh_mode: str = "cache_aside"  # cache_aside | batch | on_demand
    invalidation: Optional[str] = None  # projection_dispatch fn or job handler id
    status: str = "active"  # active | partial | planned
    notes: str = ""


# Dashboard families required by WS6 (PLATFORM_1_0_EXECUTION.md).
WS6_DASHBOARD_FAMILIES: FrozenSet[str] = frozenset({
    "executive_dashboard",
    "lifecycle_exposure",
    "pm_compliance",
    "task_completion",
    "reliability_kpis",
    "active_threat_exposure",
    "critical_equipment",
    "visual_boards",
})


READ_MODELS: Dict[str, ReadModelSpec] = {
    "executive_dashboard": ReadModelSpec(
        id="executive_dashboard",
        collection="executive_dashboard_snapshots",
        materializer="services/executive_dashboard_materializer.py",
        dashboards=("executive_dashboard", "lifecycle_exposure", "pm_compliance", "visual_boards"),
        consumer_services=(
            "services/executive_dashboard_kpis.py",
            "services/visual_board_data_service.py",
        ),
        consumer_routes=("routes/executive_dashboard.py",),
        source_domains=("equipment", "observations", "actions", "maintenance_programs", "strategies"),
        ttl_seconds=300,
        refresh_mode="cache_aside",
        invalidation="invalidate_executive_dashboard",
        status="active",
        notes=(
            "Full dashboard payload cache. Cold miss computes once via "
            "executive_dashboard_exposure then persists; request paths read snapshot only."
        ),
    ),
    "executive_kpi": ReadModelSpec(
        id="executive_kpi",
        collection="executive_kpi_snapshots",
        materializer="services/executive_kpi_materializer.py",
        dashboards=("reliability_kpis", "active_threat_exposure"),
        consumer_services=(
            "services/executive_reliability_kpis.py",
            "services/ril_dashboard_materializer.py",
            "services/ril_dashboard_service.py",
        ),
        consumer_routes=("routes/executive_dashboard.py",),
        source_domains=("observations", "actions", "maintenance_programs", "equipment"),
        ttl_seconds=300,
        refresh_mode="cache_aside",
        invalidation="invalidate_executive_kpi",
        status="active",
        notes="Reliability KPI bundle; refreshed by executive_kpi_refresh job.",
    ),
    "work_execution_kpi": ReadModelSpec(
        id="work_execution_kpi",
        collection="work_execution_kpi_snapshots",
        materializer="services/work_execution_kpi_materializer.py",
        dashboards=("task_completion",),
        consumer_services=("services/my_tasks_service.py",),
        consumer_routes=("routes/my_tasks.py",),
        source_domains=("task_instances", "actions"),
        ttl_seconds=300,
        refresh_mode="cache_aside",
        invalidation="invalidate_work_execution_kpi",
        status="active",
    ),
    "asset_health": ReadModelSpec(
        id="asset_health",
        collection="asset_health_documents",
        materializer="services/asset_health_materializer.py",
        dashboards=("critical_equipment",),
        consumer_services=("services/asset_health_materializer.py",),
        source_domains=("equipment", "observations", "scheduled_tasks", "task_instances"),
        ttl_seconds=None,
        refresh_mode="batch",
        invalidation="invalidate_asset_health",
        status="active",
        notes="Per-equipment daily health docs; asset_health_daily_refresh job.",
    ),
    "ril_dashboard": ReadModelSpec(
        id="ril_dashboard",
        collection="ril_dashboard_snapshots",
        materializer="services/ril_dashboard_materializer.py",
        dashboards=("executive_dashboard", "reliability_kpis"),
        consumer_services=("services/ril_dashboard_service.py",),
        consumer_routes=("routes/ril/dashboard.py",),
        source_domains=("reliability_intelligence", "observations", "equipment"),
        ttl_seconds=300,
        refresh_mode="cache_aside",
        invalidation="invalidate_ril_dashboard",
        status="active",
        notes="RIL executive composite; routes read snapshot only.",
    ),
    "production_dashboard": ReadModelSpec(
        id="production_dashboard",
        collection="production_dashboard_snapshots",
        materializer="services/production_dashboard_materializer.py",
        dashboards=("executive_dashboard",),
        consumer_services=("services/production_dashboard_service.py",),
        consumer_routes=("routes/production/",),
        source_domains=("forms", "production"),
        ttl_seconds=300,
        refresh_mode="cache_aside",
        invalidation="invalidate_production_dashboard",
        status="active",
    ),
    "reliability_snapshots": ReadModelSpec(
        id="reliability_snapshots",
        collection="reliability_snapshots",
        materializer="services/reliability_snapshot_service.py",
        dashboards=("lifecycle_exposure",),
        consumer_services=("services/reliability_snapshot_service.py",),
        source_domains=("reliability_graph", "equipment"),
        ttl_seconds=None,
        refresh_mode="batch",
        status="active",
        notes="Digital twin time-travel snapshots; reliability_snapshots_daily_refresh job.",
    ),
    "work_item_projection": ReadModelSpec(
        id="work_item_projection",
        collection="work_item_projections",
        materializer="services/work_item_projection.py",
        dashboards=("task_completion",),
        consumer_services=("services/work_item_projection.py", "services/task_service.py"),
        consumer_routes=("routes/my_tasks.py", "routes/work_items.py"),
        source_domains=("task_instances", "observations", "actions"),
        ttl_seconds=30,
        refresh_mode="cache_aside",
        status="active",
        notes="Denormalized My Tasks list; short TTL per user/filter.",
    ),
    "reliability_context": ReadModelSpec(
        id="reliability_context",
        collection="reliability_context_snapshots",
        materializer="services/reliability_context_service.py",
        dashboards=("reliability_kpis",),
        consumer_services=("services/reliability_context_service.py", "services/ril_copilot_service.py"),
        source_domains=("equipment", "reliability_graph", "observations", "task_instances"),
        ttl_seconds=120,
        refresh_mode="cache_aside",
        status="active",
        notes="Equipment-centric bundle for RIL copilot / AI context.",
    ),
    "insights_summary": ReadModelSpec(
        id="insights_summary",
        collection="insights_summary_snapshots",
        materializer="services/insights_summary_materializer.py",
        dashboards=("executive_dashboard",),
        consumer_services=("services/insights_service.py",),
        consumer_routes=("routes/insights.py",),
        source_domains=("actions", "equipment", "observations", "failure_modes"),
        ttl_seconds=600,
        refresh_mode="cache_aside",
        invalidation="invalidate_insights_summary",
        status="active",
    ),
    "analytics_dashboard": ReadModelSpec(
        id="analytics_dashboard",
        collection="analytics_dashboard_snapshots",
        materializer="services/analytics_dashboard_materializer.py",
        dashboards=("executive_dashboard", "lifecycle_exposure"),
        consumer_services=("services/analytics_service.py",),
        consumer_routes=("routes/analytics.py",),
        source_domains=("equipment", "observations", "actions", "maintenance_programs"),
        ttl_seconds=600,
        refresh_mode="cache_aside",
        invalidation="invalidate_analytics_dashboard",
        status="active",
    ),
    "pm_compliance": ReadModelSpec(
        id="pm_compliance",
        collection="",
        materializer="",
        dashboards=("pm_compliance",),
        consumer_services=("services/executive_dashboard_exposure.py",),
        consumer_routes=("routes/executive_dashboard.py",),
        source_domains=("maintenance_programs", "scheduled_tasks", "task_instances"),
        refresh_mode="on_demand",
        status="planned",
        notes="Dedicated PM compliance read model not yet split from executive_dashboard_exposure.",
    ),
}


def list_read_models() -> List[str]:
    return sorted(READ_MODELS.keys())


def get_read_model(read_model_id: str) -> Optional[ReadModelSpec]:
    return READ_MODELS.get(read_model_id)


def read_models_for_dashboard(dashboard: str) -> List[ReadModelSpec]:
    return [
        spec
        for spec in READ_MODELS.values()
        if dashboard in spec.dashboards and spec.status != "planned"
    ]


def validate_ws6_dashboard_coverage() -> List[str]:
    """Each WS6 dashboard family must have at least one non-planned read model."""
    failures: List[str] = []
    for dashboard in sorted(WS6_DASHBOARD_FAMILIES):
        models = read_models_for_dashboard(dashboard)
        if not models:
            failures.append(f"no active/partial read model for dashboard: {dashboard}")
    return failures


def validate_materializer_files(backend_root) -> List[str]:
    failures: List[str] = []
    for spec in READ_MODELS.values():
        if spec.status == "planned" or not spec.materializer:
            continue
        path = backend_root / spec.materializer
        if not path.is_file():
            failures.append(f"{spec.id}: missing materializer {spec.materializer}")
    return failures


def validate_consumer_services(backend_root) -> List[str]:
    failures: List[str] = []
    for spec in READ_MODELS.values():
        if spec.status == "planned":
            continue
        for rel in spec.consumer_services:
            path = backend_root / rel
            if not path.is_file():
                failures.append(f"{spec.id}: missing consumer service {rel}")
    return failures


def validate_collections_unique() -> List[str]:
    seen: Dict[str, str] = {}
    failures: List[str] = []
    for spec in READ_MODELS.values():
        if not spec.collection:
            continue
        if spec.collection in seen:
            failures.append(
                f"duplicate collection {spec.collection}: {seen[spec.collection]} and {spec.id}"
            )
        else:
            seen[spec.collection] = spec.id
    return failures
