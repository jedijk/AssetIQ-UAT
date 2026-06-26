"""
Domain registry — canonical bounded contexts for AssetIQ Wave 3.

Each domain declares its public surface (routes, services, repositories).
Cross-domain calls must go through service APIs or domain events, not route imports.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, FrozenSet, List, Optional, Tuple


@dataclass(frozen=True)
class DomainDefinition:
    name: str
    routes: Tuple[str, ...] = ()
    services: Tuple[str, ...] = ()
    repositories: Tuple[str, ...] = ()
    collections: Tuple[str, ...] = ()
    background_jobs: Tuple[str, ...] = ()
    public_api: Tuple[str, ...] = ()
    may_import_domains: FrozenSet[str] = frozenset()


DOMAINS: Dict[str, DomainDefinition] = {
    "equipment": DomainDefinition(
        name="equipment",
        routes=(
            "routes/equipment/",
            "routes/assets.py",
        ),
        services=(
            "services/equipment_search_service.py",
            "services/equipment_hierarchy_filters.py",
            "services/equipment_type_registry.py",
        ),
        collections=("equipment_nodes", "equipment_types", "installations"),
        public_api=("equipment_search_service", "equipment_hierarchy_filters"),
        may_import_domains=frozenset({"user_management", "failure_modes"}),
    ),
    "failure_modes": DomainDefinition(
        name="failure_modes",
        routes=("routes/failure_modes_routes.py", "routes/efms.py"),
        services=("services/failure_modes/", "services/efm_service.py"),
        collections=("failure_modes", "equipment_failure_modes"),
        public_api=("failure_modes_service", "efm_service"),
        may_import_domains=frozenset({"equipment"}),
    ),
    "strategies": DomainDefinition(
        name="strategies",
        routes=("routes/maintenance_strategy_v2/",),
        services=(
            "services/apply_strategy_service.py",
            "services/strategy_propagation.py",
            "services/strategy_apply_state.py",
        ),
        collections=("equipment_type_strategies",),
        background_jobs=("apply_strategy",),
        public_api=("apply_strategy_service", "strategy_propagation"),
        may_import_domains=frozenset({"equipment", "failure_modes", "maintenance_programs"}),
    ),
    "maintenance_programs": DomainDefinition(
        name="maintenance_programs",
        routes=(
            "routes/maintenance_program.py",
            "routes/maintenance_scheduler/",
            "routes/pm_import.py",
        ),
        services=(
            "services/maintenance_program_service.py",
            "services/maintenance_program_ai_recommendations.py",
            "services/maintenance_scheduling.py",
            "services/maintenance_scheduler_sync.py",
            "services/pm_import/",
        ),
        collections=("maintenance_programs_v2", "scheduled_tasks", "pm_import_sessions"),
        background_jobs=("pm_import_ai_review",),
        public_api=("maintenance_program_service", "maintenance_scheduling"),
        may_import_domains=frozenset({"equipment", "strategies", "failure_modes", "work_execution"}),
    ),
    "work_execution": DomainDefinition(
        name="work_execution",
        routes=("routes/my_tasks.py", "routes/tasks.py", "routes/work_items.py"),
        services=(
            "services/task_service.py",
            "services/work_item_query.py",
            "services/work_item_projection.py",
            "services/work_execution_kpi_materializer.py",
        ),
        repositories=(),
        collections=("task_instances", "task_templates", "work_item_projections"),
        public_api=("task_service", "work_item_query", "work_item_projection"),
        may_import_domains=frozenset({"maintenance_programs", "forms", "observations"}),
    ),
    "observations": DomainDefinition(
        name="observations",
        routes=("routes/observations.py", "routes/observation_workspace.py"),
        services=("services/observation_service.py",),
        repositories=("repositories/observation_repository.py",),
        collections=("observations",),
        public_api=("observation_service", "observation_repository"),
        may_import_domains=frozenset({"equipment", "failure_modes", "reliability_graph", "threats"}),
    ),
    "threats": DomainDefinition(
        name="threats",
        routes=("routes/threats.py", "routes/chat.py"),
        services=(
            "services/threat_score_service.py",
            "services/threat_enrichment.py",
            "services/chat_central_action_service.py",
        ),
        collections=("threats",),
        public_api=("threat_score_service", "threat_enrichment"),
        may_import_domains=frozenset({"observations", "actions", "investigations", "reliability_graph", "equipment"}),
    ),
    "investigations": DomainDefinition(
        name="investigations",
        routes=("routes/investigations.py",),
        services=(
            "services/investigation_service.py",
            "services/investigation_action_sync.py",
            "services/investigation_action_bridge.py",
        ),
        collections=(
            "investigations",
            "timeline_events",
            "failure_identifications",
            "cause_nodes",
            "action_items",
            "evidence_items",
        ),
        public_api=("investigation_action_sync", "investigation_action_bridge"),
        may_import_domains=frozenset({"threats", "actions", "reliability_graph"}),
    ),
    "actions": DomainDefinition(
        name="actions",
        routes=("routes/actions.py",),
        services=("services/action_number_service.py",),
        collections=("central_actions",),
        public_api=("action_number_service",),
        may_import_domains=frozenset({"threats", "investigations", "reliability_graph"}),
    ),
    "reliability_graph": DomainDefinition(
        name="reliability_graph",
        routes=(),
        services=(
            "services/reliability_graph.py",
            "services/reliability_graph_query.py",
            "services/reliability_graph_audit.py",
            "services/reliability_ontology.py",
            "services/pm_import_graph_sync.py",
        ),
        collections=("reliability_edges", "reliability_impacts", "findings", "outcomes"),
        background_jobs=("graph_projection",),
        public_api=("reliability_graph", "reliability_graph_query"),
        may_import_domains=frozenset({"equipment", "maintenance_programs"}),
    ),
    "reliability_intelligence": DomainDefinition(
        name="reliability_intelligence",
        routes=("routes/ril/", "routes/intelligence_map.py"),
        services=(
            "services/ril_service.py",
            "services/ril_copilot_service.py",
            "services/reliability_context_service.py",
            "services/graph_kpi_aggregator.py",
        ),
        collections=("ril_observations", "ril_alerts", "reliability_context_snapshots"),
        public_api=("ril_service", "reliability_context_service"),
        may_import_domains=frozenset({"reliability_graph", "equipment", "observations", "threats"}),
    ),
    "production": DomainDefinition(
        name="production",
        routes=("routes/production/", "routes/production_logs.py"),
        services=(
            "services/production_exposure.py",
            "services/production_logs_aggregation.py",
        ),
        collections=("production_logs", "log_ingestion_jobs", "granulometry_records"),
        public_api=("production_exposure", "production_logs_aggregation"),
        may_import_domains=frozenset({"equipment"}),
    ),
    "forms": DomainDefinition(
        name="forms",
        routes=("routes/forms.py",),
        services=("services/form_service.py",),
        collections=("form_templates", "form_submissions"),
        public_api=("form_service",),
        may_import_domains=frozenset({"work_execution", "equipment", "reliability_graph"}),
    ),
    "user_management": DomainDefinition(
        name="user_management",
        routes=("routes/users.py", "routes/auth.py", "routes/permissions.py"),
        services=(
            "services/rbac_service.py",
            "services/permission_resolver.py",
            "services/permissions_defaults.py",
            "services/installation_filter_service.py",
        ),
        collections=("users", "disciplines"),
        public_api=("rbac_service", "permission_resolver", "installation_filter"),
        may_import_domains=frozenset(),
    ),
    "analytics": DomainDefinition(
        name="analytics",
        routes=(
            "routes/executive_dashboard.py",
            "routes/analytics.py",
            "routes/insights.py",
            "routes/reports.py",
            "routes/stats.py",
        ),
        services=(
            "services/executive_reliability_kpis.py",
            "services/executive_kpi_materializer.py",
            "services/executive_dashboard_materializer.py",
            "services/asset_health_materializer.py",
            "services/ril_dashboard_materializer.py",
            "services/production_dashboard_materializer.py",
            "services/analytics_service.py",
        ),
        collections=(
            "executive_kpi_snapshots",
            "executive_dashboard_snapshots",
            "work_execution_kpi_snapshots",
            "ril_dashboard_snapshots",
            "production_dashboard_snapshots",
            "asset_health_documents",
            "reliability_snapshots",
        ),
        background_jobs=(
            "executive_kpi_refresh",
            "asset_health_daily_refresh",
            "reliability_snapshots_daily_refresh",
        ),
        public_api=(
            "executive_kpi_materializer",
            "executive_dashboard_materializer",
            "work_execution_kpi_materializer",
            "ril_dashboard_materializer",
            "production_dashboard_materializer",
        ),
        may_import_domains=frozenset({
            "threats", "observations", "work_execution", "production",
            "reliability_graph", "reliability_intelligence", "equipment",
        }),
    ),
    "spare_parts": DomainDefinition(
        name="spare_parts",
        routes=("routes/spare_parts.py",),
        services=(
            "services/spare_parts_service.py",
            "services/spare_parts_graph_sync.py",
            "services/spare_part_requirements_service.py",
        ),
        collections=("spare_parts", "spare_categories", "spare_part_files"),
        public_api=("spare_parts_service", "spare_parts_graph_sync"),
        may_import_domains=frozenset({"equipment", "maintenance_programs", "actions", "reliability_graph"}),
    ),
    "visual_boards": DomainDefinition(
        name="visual_boards",
        routes=("routes/visual_boards.py",),
        services=(
            "services/visual_board_service.py",
            "services/visual_board_data_service.py",
            "services/visual_board_snapshot_service.py",
        ),
        collections=(
            "visual_boards",
            "visual_board_versions",
            "visual_board_tokens",
            "visual_board_screens",
            "visual_board_templates",
            "visual_board_analytics",
            "visual_display_devices",
            "visual_display_pairings",
            "visual_display_events",
        ),
        public_api=("visual_board_service",),
        may_import_domains=frozenset({"equipment", "analytics"}),
    ),
    "platform": DomainDefinition(
        name="platform",
        routes=("routes/system.py", "routes/admin.py"),
        services=(
            "services/background_jobs.py",
            "services/event_outbox.py",
            "services/domain_events.py",
            "services/startup_lifecycle.py",
            "services/unified_cache.py",
        ),
        collections=("background_jobs", "domain_event_outbox", "audit_log"),
        background_jobs=("process_domain_event_outbox",),
        public_api=("background_jobs", "event_outbox", "domain_events"),
        may_import_domains=frozenset(),
    ),
}


def list_domains() -> List[str]:
    return sorted(DOMAINS.keys())


def get_domain(name: str) -> Optional[DomainDefinition]:
    return DOMAINS.get(name)


def domain_for_service_path(path: str) -> Optional[str]:
    normalized = path.replace("\\", "/")
    for name, domain in DOMAINS.items():
        for svc in domain.services:
            if normalized.endswith(svc.rstrip("/")) or svc.rstrip("/") in normalized:
                return name
    return None
