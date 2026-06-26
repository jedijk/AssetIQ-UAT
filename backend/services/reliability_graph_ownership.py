"""
Reliability graph ownership matrix — one canonical creator per edge relation.

Used by verify_reliability_graph_sync.py and documentation generation.
All write paths should route through dispatch_graph_sync or an approved submodule.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, FrozenSet, List, Optional, Tuple

# Modules allowed to call upsert_edge directly (must still use edge_document_id semantics).
APPROVED_UPSERT_MODULES: FrozenSet[str] = frozenset({
    "services/reliability_graph.py",
    "services/spare_parts_graph_sync.py",
})

# Workflow services must use dispatch_graph_sync, not sync_* or upsert_edge directly.
GRAPH_DISPATCH_CALLERS: FrozenSet[str] = frozenset({
    "services/observation_service.py",
    "services/threat_service.py",
    "services/threat_service_investigation.py",
    "services/investigation_service.py",
    "services/action_service.py",
    "services/chat_central_action_service.py",
    "services/apply_strategy_service.py",
    "services/pm_import_graph_sync.py",
    "services/maintenance_scheduling.py",
    "services/maintenance_scheduler_service.py",
    "services/task_service_completion.py",
    "services/work_signal_lifecycle.py",
    "services/form_service.py",
    "services/ril_predictions.py",
    "services/reliability_graph_query.py",
})


@dataclass(frozen=True)
class EdgeOwner:
    relation: str
    source_type: str
    target_type: str
    owner: str
    workflow: str
    dispatch: Optional[str] = None
    notes: str = ""


# Canonical owner per (relation, source_type, target_type).
EDGE_OWNERS: Tuple[EdgeOwner, ...] = (
    # Maintenance — apply strategy
    EdgeOwner("has_failure_mode", "equipment", "failure_mode", "sync_edges_for_apply_strategy", "apply_strategy", "sync_edges_for_apply_strategy", "annotate_equipment_failure_mode_risk may add twin metadata"),
    EdgeOwner("has_strategy_type", "equipment", "equipment_type_strategy", "sync_edges_for_apply_strategy", "apply_strategy", "sync_edges_for_apply_strategy"),
    EdgeOwner("has_program", "equipment", "maintenance_program_v2", "sync_edges_for_apply_strategy", "apply_strategy", "sync_edges_for_apply_strategy"),
    EdgeOwner("governed_by", "maintenance_program_v2", "equipment_type_strategy", "sync_edges_for_apply_strategy", "apply_strategy", "sync_edges_for_apply_strategy"),
    EdgeOwner("contains_task", "maintenance_program_v2", "program_task", "sync_edges_for_apply_strategy", "apply_strategy", "sync_edges_for_apply_strategy"),
    EdgeOwner("derived_from_template", "program_task", "strategy_task_template", "sync_edges_for_apply_strategy", "apply_strategy", "sync_edges_for_apply_strategy"),
    EdgeOwner("mitigates_failure_mode", "program_task", "failure_mode", "sync_edges_for_apply_strategy", "apply_strategy", "sync_edges_for_apply_strategy"),
    # PM import
    EdgeOwner("applied_to", "pm_import_task", "failure_mode", "sync_edge_for_pm_import_task", "pm_import", "sync_edge_for_pm_import_task"),
    EdgeOwner("imported_as", "pm_import_task", "program_task", "sync_pm_import_program_task_links", "pm_import / apply_strategy", "sync_edge_for_pm_import_task"),
    # Scheduled work
    EdgeOwner("derived_from", "scheduled_task", "program_task", "sync_edges_for_scheduled_task", "scheduled_task lifecycle", "sync_edges_for_scheduled_task"),
    EdgeOwner("scheduled_for", "scheduled_task", "equipment", "sync_edges_for_scheduled_task", "scheduled_task lifecycle", "sync_edges_for_scheduled_task"),
    EdgeOwner("mitigates_failure_mode", "scheduled_task", "failure_mode", "sync_edges_for_scheduled_task", "scheduled_task lifecycle", "sync_edges_for_scheduled_task"),
    EdgeOwner("completed_on", "scheduled_task", "equipment", "sync_edges_for_scheduled_task", "task_complete", "sync_edges_for_scheduled_task"),
    EdgeOwner("cancelled_for", "scheduled_task", "program_task", "sync_edges_for_scheduled_task", "task_cancel", "sync_edges_for_scheduled_task"),
    EdgeOwner("instantiated_as", "scheduled_task", "task_instance", "sync_instantiated_as_edge", "task_execution", "sync_task_instance_completion_edges"),
    # Task instance
    EdgeOwner("executed_on", "task_instance", "equipment", "sync_task_instance_completion_edges", "task_instance_complete", "sync_task_instance_completion_edges"),
    EdgeOwner("mitigates_failure_mode", "task_instance", "failure_mode", "sync_task_instance_completion_edges", "task_instance_complete", "sync_task_instance_completion_edges"),
    EdgeOwner("yielded_finding", "task_completion", "finding", "_sync_finding_from_completion", "task_instance_complete", "sync_task_instance_completion_edges"),
    EdgeOwner("found_on", "finding", "equipment", "_sync_finding_from_completion", "task_instance_complete", "sync_task_instance_completion_edges"),
    EdgeOwner("raised_observation", "finding", "observation", "sync_finding_to_observation_edge", "observation_triage", "sync_observation_edges"),
    # Reactive — observation / threat (threat is storage type; observation is UI canonical)
    EdgeOwner("observed_on", "observation", "equipment", "sync_observation_edges", "observation_create", "sync_observation_edges"),
    EdgeOwner("indicates_failure_mode", "observation", "failure_mode", "sync_observation_edges", "observation_create", "sync_observation_edges"),
    EdgeOwner("linked_to_threat", "observation", "threat", "sync_observation_edges", "observation_create", "sync_observation_edges", "Internal alias edge"),
    EdgeOwner("escalated_to", "observation", "threat", "sync_observation_edges", "observation_escalate", "sync_observation_edges", "Internal alias edge"),
    EdgeOwner("linked_to_equipment", "threat", "equipment", "sync_threat_edges", "threat_create", "sync_threat_edges"),
    EdgeOwner("indicates_failure_mode", "threat", "failure_mode", "sync_threat_edges", "threat_create", "sync_threat_edges"),
    EdgeOwner("triggered_investigation", "threat", "investigation", "sync_investigation_edges", "investigation_create", "sync_investigation_edges"),
    # RCA
    EdgeOwner("identified_cause", "investigation", "cause", "sync_cause_edge", "investigation_rca", "sync_cause_edge"),
    EdgeOwner("generated_action", "investigation", "action", "sync_action_edges", "action_create", "sync_action_edges", "source_type may be cause/threat"),
    EdgeOwner("assigned_to_equipment", "action", "equipment", "sync_action_edges", "action_create", "sync_action_edges"),
    EdgeOwner("resulted_in", "action", "outcome", "sync_outcome_edges", "action_verify", "sync_outcome_edges"),
    EdgeOwner("impacted_reliability", "outcome", "reliability_impact", "sync_outcome_edges", "action_verify", "sync_outcome_edges"),
    EdgeOwner("affects_equipment", "reliability_impact", "equipment", "sync_outcome_edges", "action_verify", "sync_outcome_edges"),
    # Spare parts (approved submodule)
    EdgeOwner("used_on", "spare_part", "equipment", "sync_spare_part_equipment_links", "spare_part_link", notes="spare_parts_graph_sync.py"),
    EdgeOwner("requires", "program_task", "spare_part", "sync_entity_requires_spare_parts", "program_task_requirements", notes="spare_parts_graph_sync.py"),
    EdgeOwner("requires", "action", "spare_part", "sync_entity_requires_spare_parts", "action_requirements", notes="spare_parts_graph_sync.py"),
    # RIL / predictions
    EdgeOwner("has_prediction", "equipment", "prediction", "sync_prediction_edges", "ril_prediction", "sync_prediction_edges"),
)


def ownership_by_relation() -> Dict[str, List[EdgeOwner]]:
    grouped: Dict[str, List[EdgeOwner]] = {}
    for row in EDGE_OWNERS:
        grouped.setdefault(row.relation, []).append(row)
    return grouped


def validate_ownership_covers_handlers(handler_names: FrozenSet[str]) -> List[str]:
    """Ensure every dispatch handler that creates edges is listed in EDGE_OWNERS."""
    failures: List[str] = []
    owners = {row.owner for row in EDGE_OWNERS}
    for name in sorted(handler_names):
        if name not in owners and not name.startswith("_"):
            failures.append(f"handler {name} missing from EDGE_OWNERS")
    return failures


def validate_ontology_relations(ontology_relations: List[dict]) -> List[str]:
    """Flag ontology relations with no registered owner."""
    failures: List[str] = []
    known = {(r.relation, r.source_type, r.target_type) for r in EDGE_OWNERS}
    for rel in ontology_relations:
        key = (rel["id"], rel["source"], rel["target"])
        if key not in known:
            failures.append(f"ontology relation {key} has no EDGE_OWNER")
    return failures


def scan_unapproved_upsert_callers(services_dir) -> List[str]:
    """Return paths that call upsert_edge outside approved modules."""
    import re

    upsert_re = re.compile(r"\bupsert_edge\s*\(")
    failures: List[str] = []
    for path in sorted(services_dir.rglob("*.py")):
        rel = path.relative_to(services_dir.parent).as_posix()
        if rel in APPROVED_UPSERT_MODULES:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if upsert_re.search(text):
            failures.append(rel)
    return failures
