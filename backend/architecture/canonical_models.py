"""
Canonical data models — Platform 1.0 WS3.

One authoritative MongoDB collection (or documented composite) per business object.
Legacy collections are read-only or gated behind explicit feature flags.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, FrozenSet, List, Optional, Tuple


@dataclass(frozen=True)
class CanonicalModel:
    """Single source of truth for a business domain."""

    domain: str
    canonical_collections: Tuple[str, ...]
    canonical_service: str
    api_routes: Tuple[str, ...]
    repository: Optional[str] = None
    legacy_collections: Tuple[str, ...] = ()
    legacy_read_flag: Optional[str] = None
    legacy_write_flag: Optional[str] = None
    notes: str = ""
    related_collections: Tuple[str, ...] = ()


# Domains required by Platform 1.0 WS3.
WS3_DOMAINS: FrozenSet[str] = frozenset({
    "equipment",
    "failure_modes",
    "observations",
    "investigations",
    "actions",
    "strategies",
    "maintenance_programs",
    "scheduled_tasks",
    "task_instances",
    "forms",
    "spare_parts",
    "visual_boards",
    "ai_recommendations",
})

CANONICAL_MODELS: Dict[str, CanonicalModel] = {
    "equipment": CanonicalModel(
        domain="equipment",
        canonical_collections=("equipment_nodes", "equipment_types"),
        canonical_service="services/equipment_search_service.py",
        api_routes=(
            "routes/equipment/equipment_nodes.py",
            "routes/equipment/equipment_types.py",
            "routes/assets.py",
        ),
        repository="repositories/equipment_repository.py",
        legacy_collections=("installations",),
        notes="Hierarchy lives in equipment_nodes; equipment_types is the type library.",
    ),
    "failure_modes": CanonicalModel(
        domain="failure_modes",
        canonical_collections=("failure_modes",),
        canonical_service="services/failure_modes_routes_service.py",
        api_routes=("routes/failure_modes_routes.py", "routes/efms.py"),
        legacy_collections=("equipment_failure_modes",),
        notes="Static failure_modes.py library is read fallback only; Mongo failure_modes is authoritative.",
        related_collections=("equipment_failure_modes",),
    ),
    "observations": CanonicalModel(
        domain="observations",
        canonical_collections=("threats", "observations"),
        canonical_service="services/observation_service.py",
        api_routes=("routes/observations.py", "routes/threats.py", "routes/chat.py"),
        repository="repositories/threat_repository.py",
        notes=(
            "threats = primary reactive signal (chat, risk scoring). "
            "observations = structured observation engine. "
            "Unified reads via work_signal_projection."
        ),
        related_collections=("observations",),
    ),
    "investigations": CanonicalModel(
        domain="investigations",
        canonical_collections=("investigations",),
        canonical_service="services/investigation_service.py",
        api_routes=("routes/investigations.py",),
        repository="repositories/investigation_repository.py",
        related_collections=(
            "timeline_events",
            "failure_identifications",
            "cause_nodes",
            "action_items",
            "evidence_items",
        ),
        notes="Investigation action_items mirror to central_actions via investigation_action_bridge.",
    ),
    "actions": CanonicalModel(
        domain="actions",
        canonical_collections=("central_actions",),
        canonical_service="services/action_service.py",
        api_routes=("routes/actions.py",),
        repository="repositories/action_repository.py",
        legacy_collections=("actions",),
        notes="Legacy actions collection used only for historical KPI fallback in insights_service.",
    ),
    "strategies": CanonicalModel(
        domain="strategies",
        canonical_collections=("equipment_type_strategies",),
        canonical_service="services/apply_strategy_service.py",
        api_routes=("routes/maintenance_strategy_v2/routes.py",),
        notes="Apply Strategy writes programs + graph edges from strategy templates.",
    ),
    "maintenance_programs": CanonicalModel(
        domain="maintenance_programs",
        canonical_collections=("maintenance_programs_v2",),
        canonical_service="services/maintenance_program_service.py",
        api_routes=("routes/maintenance_program.py", "routes/pm_import.py"),
        repository="repositories/maintenance_repository.py",
        legacy_collections=("maintenance_programs",),
        legacy_read_flag="READ_LEGACY_MAINTENANCE_PROGRAMS",
        legacy_write_flag="SYNC_LEGACY_MAINTENANCE_PROGRAMS",
        notes="v2 embeds tasks array; legacy flat rows gated off by default (scheduler_config).",
    ),
    "scheduled_tasks": CanonicalModel(
        domain="scheduled_tasks",
        canonical_collections=("scheduled_tasks",),
        canonical_service="services/maintenance_scheduler_service.py",
        api_routes=("routes/maintenance_scheduler/",),
        repository="repositories/maintenance_repository.py",
        notes="ScheduledTaskRepository shares maintenance_repository module with programs.",
    ),
    "task_instances": CanonicalModel(
        domain="task_instances",
        canonical_collections=("task_instances",),
        canonical_service="services/task_service.py",
        api_routes=("routes/my_tasks.py", "routes/tasks.py", "routes/work_items.py"),
        repository="repositories/work_item_repository.py",
        related_collections=("work_item_projections",),
        notes="work_item_projections is a denormalized read model for My Tasks / KPI materializers.",
    ),
    "forms": CanonicalModel(
        domain="forms",
        canonical_collections=("form_templates", "form_submissions"),
        canonical_service="services/form_service.py",
        api_routes=("routes/forms.py",),
        repository="repositories/form_repository.py",
        notes="Form completion may emit task_instance / graph sync via form_service.",
    ),
    "spare_parts": CanonicalModel(
        domain="spare_parts",
        canonical_collections=("spare_parts",),
        canonical_service="services/spare_parts_service.py",
        api_routes=("routes/spare_parts.py",),
        related_collections=("spare_categories", "spare_part_files"),
        notes="Graph edges via spare_parts_graph_sync (used_on, requires).",
    ),
    "visual_boards": CanonicalModel(
        domain="visual_boards",
        canonical_collections=("visual_boards",),
        canonical_service="services/visual_board_service.py",
        api_routes=("routes/visual_boards.py",),
        related_collections=(
            "visual_board_versions",
            "visual_board_tokens",
            "visual_board_screens",
            "visual_board_templates",
            "visual_board_analytics",
            "visual_display_devices",
            "visual_display_pairings",
            "visual_display_events",
        ),
        notes="Visual Management Studio; versions/tokens are lifecycle sub-documents.",
    ),
    "ai_recommendations": CanonicalModel(
        domain="ai_recommendations",
        canonical_collections=("maintenance_programs_v2",),
        canonical_service="services/maintenance_program_ai_recommendations.py",
        api_routes=("routes/maintenance_program.py",),
        notes=(
            "No standalone collection. AI proposals are ephemeral until accepted; "
            "accepted tasks persist in maintenance_programs_v2.tasks. "
            "Distinct from insights_service.generate_ai_recommendations (execution analytics)."
        ),
    ),
}


def list_canonical_domains() -> List[str]:
    return sorted(CANONICAL_MODELS.keys())


def get_canonical_model(domain: str) -> Optional[CanonicalModel]:
    return CANONICAL_MODELS.get(domain)


def validate_ws3_coverage() -> List[str]:
    """Return errors when WS3 required domains are missing from the registry."""
    failures: List[str] = []
    missing = WS3_DOMAINS - set(CANONICAL_MODELS.keys())
    for domain in sorted(missing):
        failures.append(f"missing canonical model: {domain}")
    extra = set(CANONICAL_MODELS.keys()) - WS3_DOMAINS
    for domain in sorted(extra):
        failures.append(f"unexpected domain not in WS3_DOMAINS: {domain}")
    return failures


def validate_model_files(backend_root) -> List[str]:
    """Verify declared service/route paths exist on disk."""
    failures: List[str] = []
    for model in CANONICAL_MODELS.values():
        for rel in (model.canonical_service,):
            path = backend_root / rel
            if not path.is_file():
                failures.append(f"{model.domain}: missing service {rel}")
        if model.repository:
            repo_path = backend_root / model.repository
            if not repo_path.is_file():
                failures.append(f"{model.domain}: missing repository {model.repository}")
        for route in model.api_routes:
            route_path = backend_root / route
            if route.endswith("/"):
                if not route_path.is_dir():
                    failures.append(f"{model.domain}: missing route dir {route}")
            elif not route_path.is_file():
                failures.append(f"{model.domain}: missing route {route}")
    return failures


def validate_repository_alignment() -> List[str]:
    """Canonical collections with repositories should appear in convergence_registry."""
    from architecture.convergence_registry import REPOSITORY_COLLECTIONS

    failures: List[str] = []
    repo_set = set(REPOSITORY_COLLECTIONS)
    for model in CANONICAL_MODELS.values():
        if not model.repository:
            continue
        for coll in model.canonical_collections:
            if coll not in repo_set and coll not in (
                "equipment_types",
                "threats",
                "observations",
                "spare_parts",
                "visual_boards",
                "equipment_type_strategies",
                "maintenance_programs_v2",
            ):
                failures.append(
                    f"{model.domain}: canonical collection {coll} not in REPOSITORY_COLLECTIONS"
                )
    return failures
