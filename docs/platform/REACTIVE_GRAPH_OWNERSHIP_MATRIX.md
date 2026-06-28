# Reactive Graph Ownership Matrix

**Sprint 2–6 — Functional Spec §1.2**  
**Last updated:** 2026-06-28 (@ `e5a828e7`, Sprint 6 verification)  
**Registry:** `backend/services/reliability_graph/graph_sync_registry.py`  
**Gate:** `backend/scripts/verify_reliability_graph_sync.py`, `backend/scripts/graph_coverage_report.py`

This matrix maps **functional-spec edge names** to **canonical Mongo `reliability_edges.relation` values** already used in `reliability_ontology.py`. Do not introduce duplicate relation names.

## Conventions

| Field | Rule |
|-------|------|
| **Idempotency key (logical)** | `tenant_id:relation:source_id:target_id` — see `graph_sync_registry.idempotency_key()` |
| **Edge document id (storage)** | `source_type:source_id:relation:target_type:target_id` — see `edge_document_id()` in `reliability_graph_core.py` |
| **tenant_id** | Required on all `upsert_edge` writes; sourced from entity doc or `tenant_id_from_user()` |
| **Dispatch** | Workflow code calls `dispatch_graph_sync(sync_name, label, **kwargs)` — not `upsert_edge` directly |
| **Async path** | When `GRAPH_SYNC_ASYNC=true`, outbox event type = `SYNC_NAME_TO_EVENT_TYPE[sync_name]`; worker = `graph_projection_handler` |

## Spec edge inventory (§1.2)

| Spec edge | Canonical relation(s) | Source → Target | Owner handler | Trigger | tenant_id source | Backfill script | Verification |
|-----------|----------------------|-----------------|---------------|---------|------------------|-----------------|--------------|
| `equipment_has_observation` | `observed_on` | observation → equipment | `sync_observation_edges` | observation create/update | `observations.tenant_id` | `backfill --phase reactive` | `audit_observation_edges` |
| `observation_has_investigation` | `triggered_investigation` | threat → investigation | `sync_investigation_edges` | investigation open | `investigations.tenant_id` | reactive phase | `audit_investigation_chain` |
| `investigation_has_action` | `generated_action` | investigation/cause/threat → action | `sync_action_edges` | action create | `central_actions.tenant_id` | reactive phase | action graph dispatch tests |
| `observation_matches_failure_mode` | `indicates_failure_mode` | observation → failure_mode | `sync_observation_edges` | observation FM link | observation doc | reactive phase | `audit_observation_edges` |
| `action_addresses_failure_mode` | `mitigates_failure_mode` | action → failure_mode (+ task paths) | `sync_action_edges`, strategy handlers | action create w/ FM, strategy apply | entity `tenant_id` | reactive + maintenance | action create + backfill FM resolution |
| `failure_mode_has_strategy` | `has_failure_mode`, `has_strategy_type` | equipment → failure_mode / strategy | `sync_edges_for_apply_strategy` | apply strategy | equipment type tenant | maintenance phase | `audit_program_task_edges` |
| `strategy_applied_to_equipment` | `has_strategy_type`, `has_program` | equipment → strategy / program | `sync_edges_for_apply_strategy` | apply strategy | user `company_id` | maintenance phase | apply strategy tests |
| `strategy_generates_program` | `has_program`, `governed_by`, `contains_task` | equipment → program | `sync_edges_for_apply_strategy` | apply strategy | program tenant | maintenance phase | `audit_program_task_edges` |
| `program_generates_scheduled_task` | `derived_from`, `scheduled_for` | scheduled_task → program_task | `sync_edges_for_scheduled_task` | scheduled task create | `scheduled_tasks.tenant_id` | maintenance phase | scheduled task tests |
| `scheduled_task_creates_task_instance` | `instantiated_as` | scheduled_task → task_instance | `sync_task_instance_completion_edges` | task instance complete | task instance tenant | maintenance phase | task completion tests |
| `task_instance_generates_evidence` | `yielded_finding`, `found_on` | task_completion → finding | `_sync_finding_from_completion` | task complete w/ findings | completion tenant | maintenance phase | task completion graph tests |
| `evidence_supports_observation` | `raised_observation` | finding → observation | `sync_finding_to_observation_edge` | observation triage | observation tenant | reactive phase | finding→observation tests |
| `action_reduces_risk` | `impacted_reliability`, `affects_equipment` | outcome → reliability_impact | `sync_outcome_edges` | action verify/close | action tenant | reactive phase | **PARTIAL** — indirect chain |
| `outcome_validates_action` | `resulted_in` | action → outcome | `sync_outcome_edges` | action completed | action tenant | reactive phase | outcome sync tests |
| `equipment_has_spare_requirement` | `requires` | program_task / action → spare_part | `sync_entity_requires_spare_parts` | spare requirement save | entity tenant | `--phase spare` | spare parts graph sync tests |
| `spare_part_used_by_task` | `requires`, `used_on` | spare_part → equipment | `sync_spare_part_equipment_links` | spare link | spare_parts tenant | `--phase spare` | `spare_parts_graph_sync` |
| `form_submission_supports_task` | `supports` | form_submission → task_instance | `sync_form_submission_edges` | form submit w/ task_instance_id | submission tenant | `--phase forms` | form submission reliability tests |
| `executive_kpi_derived_from_graph` | *(read model)* | graph → executive KPI | `graph_kpi_aggregator` | projection job | user `company_id` | N/A | **PARTIAL** — read model |

**Status summary:** 16 implemented · 2 partial · 0 gap

**Sprint 6 verification (@ `e5a828e7`):**

| Gate | Result |
|------|--------|
| `graph_coverage_report.py` | **PASS** — 19 handlers registered, 11/11 entities (100%) |
| `verify_reliability_graph_sync.py` | **PASS** — static OK; 2 advisory partial edges only |
| Sprint 6 pytest | **PASS** — `test_graph_sync_registry`, `test_lifecycle_graph_handler`, `test_reliability_graph_platform` |
| UAT `--phase all` backfill | **PASS** @ 2026-06-28 — 2968 synced, 0 errors; live graph verify 0 gaps |

## Dispatch handler registry

| Handler | Domain event (`DomainEventType`) | Primary write-path callers |
|---------|----------------------------------|----------------------------|
| `sync_observation_edges` | `graph.sync_observation_edges` | `observation_service`, `lifecycle_graph_handler` |
| `sync_threat_edges` | `graph.sync_threat_edges` | `threat_helpers`, `lifecycle_graph_handler` |
| `sync_investigation_edges` | `graph.sync_investigation_edges` | `investigation_crud` |
| `sync_cause_edge` | `graph.sync_cause_edge` | `investigation_subresources` |
| `sync_action_edges` | `graph.sync_action_edges` | `action_service`, `investigation_service` |
| `sync_outcome_edges` | `graph.sync_outcome_edges` | `action_service`, `lifecycle_graph_handler` |
| `sync_edges_for_scheduled_task` | `graph.sync_edges_for_scheduled_task` | `maintenance_scheduling` |
| `sync_task_instance_completion_edges` | `graph.sync_task_instance_completion_edges` | `task_service_completion`, `form_service_reliability` |
| `sync_edges_for_apply_strategy` | `graph.sync_edges_for_apply_strategy` | `apply_strategy_service` |
| `sync_edge_for_pm_import_task` | `graph.sync_edge_for_pm_import_task` | `pm_import_graph_sync` |
| `sync_prediction_edges` | `graph.sync_prediction_edges` | `ril_predictions` |

## Direct upsert paths (approved submodules)

| Function | Module | Relations |
|----------|--------|-----------|
| `sync_spare_part_equipment_links` | `spare_parts_graph_sync.py` | `used_on` |
| `sync_entity_requires_spare_parts` | `spare_parts_graph_sync.py` | `requires` |
| `sync_finding_to_observation_edge` | `reliability_graph_entities.py` | `raised_observation` |
| `sync_form_submission_edges` | `reliability_graph_entities.py` | `supports` |
| `_sync_finding_from_completion` | `reliability_graph_strategy.py` | `yielded_finding`, `found_on` |
| `sync_instantiated_as_edge` | `reliability_graph_strategy.py` | `instantiated_as` |
| `sync_pm_import_program_task_links` | `reliability_graph_strategy.py` | `imported_as` |
| `annotate_equipment_failure_mode_risk` | `reliability_graph_core.py` | twin metadata |

## Lifecycle event wiring (Sprint 2)

| Domain event | Handler | Graph action |
|--------------|---------|--------------|
| `threat.created` | `lifecycle_graph_handler.handle_threat_created` | `sync_threat_edges` |
| `observation.created` | `lifecycle_graph_handler.handle_observation_created` | `sync_observation_edges` |
| `action.completed` | `lifecycle_graph_handler.handle_action_completed` | `sync_outcome_edges` |
| `form_submission.created` | `lifecycle_graph_handler.handle_form_submission_created` | `sync_form_submission_edges` |

Wired via `workers/event_outbox_processor.py` → `lifecycle_graph_event_handlers()`.

## Backfill coverage

| Phase | Collections / handlers |
|-------|------------------------|
| `maintenance` | apply_strategy, scheduled_task, task_instance, pm_import |
| `reactive` | observation, threat, investigation, cause, action (+ outcomes) |
| `forms` | `form_submissions` → `sync_form_submission_edges` |
| `spare` | `spare_parts`, program_task/action `requires`, `used_on` |
| `predictions` | `ril_predictions` → `sync_prediction_edges` |

Script: `backend/scripts/backfill_reliability_graph_history.py --phase all`
