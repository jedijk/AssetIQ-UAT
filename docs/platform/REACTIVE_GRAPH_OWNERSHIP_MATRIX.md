# Reactive Graph Ownership Matrix

**Sprint 1 — Functional Spec §1.2**  
**Last updated:** 2026-06-28  
**Registry:** `backend/services/reliability_graph/graph_sync_registry.py`  
**Gate:** `backend/scripts/verify_reliability_graph_sync.py`

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
| `equipment_has_observation` | `observed_on` | observation → equipment | `sync_observation_edges` | observation create/update | `observations.tenant_id` / work signal | `backfill_reliability_graph_history.py --phase reactive` | `audit_observation_edges`, `test_reliability_graph_platform` |
| `observation_has_investigation` | `triggered_investigation` | threat → investigation | `sync_investigation_edges` | investigation open | `investigations.tenant_id` | reactive phase | `audit_investigation_chain` |
| `investigation_has_action` | `generated_action` | investigation/cause/threat → action | `sync_action_edges` | action create | `central_actions.tenant_id` | reactive phase | `action_service` graph dispatch tests |
| `observation_matches_failure_mode` | `indicates_failure_mode` | observation → failure_mode | `sync_observation_edges` | observation FM link | observation doc | reactive phase | `audit_observation_edges` |
| `action_addresses_failure_mode` | `mitigates_failure_mode` | program_task / scheduled_task / task_instance → failure_mode | `sync_edges_for_apply_strategy`, `sync_edges_for_scheduled_task`, `sync_task_instance_completion_edges` | strategy apply, schedule, complete | entity `tenant_id` | maintenance phase | **PARTIAL** — no direct action→FM edge |
| `failure_mode_has_strategy` | `has_failure_mode`, `has_strategy_type` | equipment → failure_mode / strategy | `sync_edges_for_apply_strategy` | apply strategy | equipment type tenant | maintenance phase | `audit_program_task_edges` |
| `strategy_applied_to_equipment` | `has_strategy_type`, `has_program` | equipment → strategy / program | `sync_edges_for_apply_strategy` | apply strategy | user `company_id` | maintenance phase | apply strategy tests |
| `strategy_generates_program` | `has_program`, `governed_by`, `contains_task` | equipment → program; program → strategy/task | `sync_edges_for_apply_strategy` | apply strategy | program tenant | maintenance phase | `audit_program_task_edges` |
| `program_generates_scheduled_task` | `derived_from`, `scheduled_for` | scheduled_task → program_task / equipment | `sync_edges_for_scheduled_task` | scheduled task create | `scheduled_tasks.tenant_id` | maintenance phase | `audit_scheduled_task_created` |
| `scheduled_task_creates_task_instance` | `instantiated_as` | scheduled_task → task_instance | `sync_task_instance_completion_edges` | task instance complete | task instance tenant | maintenance phase | scheduled task tests |
| `task_instance_generates_evidence` | `yielded_finding`, `found_on` | task_completion → finding → equipment | `_sync_finding_from_completion` | task complete w/ findings | completion tenant | maintenance phase | task completion graph tests |
| `evidence_supports_observation` | `raised_observation` | finding → observation | `sync_finding_to_observation_edge` | observation triage / FM link | observation tenant | reactive phase (via observation sync) | finding→observation unit tests |
| `action_reduces_risk` | `impacted_reliability`, `affects_equipment` | outcome → reliability_impact → equipment | `sync_outcome_edges` | action verify/close | action tenant | reactive phase (outcome) | **PARTIAL** — indirect via outcome chain |
| `outcome_validates_action` | `resulted_in` | action → outcome | `sync_outcome_edges` | action completed | action tenant | reactive phase | outcome sync tests |
| `equipment_has_spare_requirement` | `requires` | program_task / action → spare_part | `sync_entity_requires_spare_parts` | spare requirement save | entity tenant | **GAP** — not in history backfill | spare parts graph sync tests |
| `spare_part_used_by_task` | `requires`, `used_on` | program_task/action → spare_part; spare_part → equipment | `sync_entity_requires_spare_parts`, `sync_spare_part_equipment_links` | spare link / requirement | spare_parts tenant | **GAP** — not in history backfill | `spare_parts_graph_sync` |
| `form_submission_supports_task` | *(none)* | form_submission → task_instance | `after_form_submission_reliability_update` | form submit w/ task_instance_id | submission tenant | **GAP** | **GAP** — dispatches task completion sync only; no `form_submission` edge |
| `executive_kpi_derived_from_graph` | *(read model)* | graph → executive KPI snapshot | `graph_kpi_aggregator` / `executive_kpi_materializer` | projection job / invalidation | user `company_id` | N/A (not an edge) | **PARTIAL** — KPI materialization, not `reliability_edges` |

**Status summary:** 13 implemented · 3 partial · 2 gap (form submission edge, spare backfill)

## Dispatch handler registry

| Handler | Domain event (`DomainEventType`) | Primary write-path callers |
|---------|----------------------------------|----------------------------|
| `sync_observation_edges` | `graph.sync_observation_edges` | `observation_service` |
| `sync_threat_edges` | `graph.sync_threat_edges` | `threat_helpers`, chat/task paths |
| `sync_investigation_edges` | `graph.sync_investigation_edges` | `investigation_crud` |
| `sync_cause_edge` | `graph.sync_cause_edge` | `investigation_subresources` |
| `sync_action_edges` | `graph.sync_action_edges` | `action_service`, `investigation_service` |
| `sync_outcome_edges` | `graph.sync_outcome_edges` | `action_service` |
| `sync_edges_for_scheduled_task` | `graph.sync_edges_for_scheduled_task` | `maintenance_scheduling`, `maintenance_scheduler_service` |
| `sync_task_instance_completion_edges` | `graph.sync_task_instance_completion_edges` | `task_service_completion`, `form_service_reliability` |
| `sync_edges_for_apply_strategy` | `graph.sync_edges_for_apply_strategy` | `apply_strategy_service` |
| `sync_edge_for_pm_import_task` | `graph.sync_edge_for_pm_import_task` | `pm_import_graph_sync`, `failure_mode_apply` |
| `sync_prediction_edges` | `graph.sync_prediction_edges` | `ril_predictions` |

## Direct upsert paths (approved submodules)

These bypass `dispatch_graph_sync` but are listed in `reliability_graph_ownership.EDGE_OWNERS`:

| Function | Module | Relations |
|----------|--------|-----------|
| `sync_spare_part_equipment_links` | `spare_parts_graph_sync.py` | `used_on` |
| `sync_entity_requires_spare_parts` | `spare_parts_graph_sync.py` | `requires` |
| `sync_finding_to_observation_edge` | `reliability_graph_entities.py` | `raised_observation` |
| `_sync_finding_from_completion` | `reliability_graph_strategy.py` | `yielded_finding`, `found_on` |
| `sync_instantiated_as_edge` | `reliability_graph_strategy.py` | `instantiated_as` |
| `sync_pm_import_program_task_links` | `reliability_graph_strategy.py` | `imported_as` |
| `annotate_equipment_failure_mode_risk` | `reliability_graph_core.py` | twin metadata on `has_failure_mode` |

Approved `upsert_edge` modules: `reliability_graph_core`, `reliability_graph_entities`, `reliability_graph_strategy`, `spare_parts_graph_sync` (see `APPROVED_UPSERT_MODULES`).

## Outbox / async wiring

| Component | Status |
|-----------|--------|
| `dispatch_graph_sync` → `publish_event` | **Implemented** when `GRAPH_SYNC_ASYNC=true` |
| `DomainEventType.GRAPH_SYNC_*` | **11 types** in `domain_events.py` |
| `workers/graph_projection_handler.py` | **Implemented** — resolves handler from `GRAPH_SYNC_HANDLERS` |
| Domain lifecycle events (`threat.created`, etc.) | **Registered** in enum; graph handlers not auto-chained yet |

## Backfill coverage

| Script | Handlers covered |
|--------|------------------|
| `backfill_reliability_graph_history.py` | apply_strategy, scheduled_task, task_instance, pm_import, observation, threat, investigation, cause, action, outcome |
| `backfill_reliability_edge_tenant.py` | tenant_id stamp on legacy edges |
| `backfill_graph_threat_to_observation_edges.py` | observation↔threat alias edges |

**Not in history backfill (Sprint 2):** `sync_prediction_edges`, spare parts `requires`/`used_on`, dedicated form_submission edges.

## Sprint 2 priorities

1. Add `form_submission → supports → task_instance` edge (or document as intentional omission).
2. Direct `action → mitigates_failure_mode` when action targets a failure mode.
3. Backfill spare-part and prediction graph edges.
4. Wire domain lifecycle events to graph dispatch (reduce inline-only paths).
5. Align edge document id with tenant-scoped idempotency key if multi-tenant edge collision observed.
