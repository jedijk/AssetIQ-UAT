# Reliability Graph Sync

AssetIQ materializes **reliability edges** in MongoDB (`reliability_edges`) to connect equipment, strategies, program tasks, PM imports, scheduled work, task instances, findings, observations, threats, investigations, causes, actions, outcomes, and reliability impacts. This document describes sync hooks and the UAT audit gate.

## Edge schema (v2)

Edges carry `tenant_id`, `status` (`active` | `retired`), and optional `retired_at`. Reads default to active edges only. Upserts reactivate retired edges.

## Edge sources

| Event | Sync function | Key relations |
|-------|---------------|---------------|
| Apply Strategy | `sync_edges_for_apply_strategy` | `has_failure_mode`, `has_strategy_type`, `has_program`, `governed_by`, `contains_task`, `derived_from_template`, `mitigates_failure_mode`; retires stale `program_task` edges |
| PM Import apply | `sync_edge_for_pm_import_task` | `pm_import_task → applied_to → failure_mode` |
| Scheduled task create | `sync_edges_for_scheduled_task(event="created")` | `derived_from`, `scheduled_for`, `mitigates_failure_mode` |
| Scheduled task complete/cancel | `sync_edges_for_scheduled_task` | base edges + `completed_on` / `cancelled_for` |
| Scheduled task complete (findings) | `_sync_finding_from_completion` | `task_completion → yielded_finding → finding`, `finding → found_on → equipment` |
| Task instance complete | `TaskService._sync_reliability_graph_on_complete` | scheduled_task lifecycle + `instantiated_as`, `executed_on`, `mitigates_failure_mode`, optional finding edges |
| Observation create/update | `sync_observation_edges` | `observed_on`, `indicates_failure_mode`, `linked_to_threat`, `escalated_to` |
| Threat create (chat/task) | `sync_threat_edges` | threat → equipment / failure_mode |
| Threat → observation convert | `sync_observation_edges` + `sync_threat_edges` | bidirectional observation/threat linkage |
| Investigation create | `sync_investigation_edges` | `triggered_investigation` |
| Cause create | `sync_cause_edge` | `identified_cause` |
| Action create | `sync_action_edges` | `generated_action`, `assigned_to_equipment` |
| Action close (completed) | `sync_outcome_edges` | `resulted_in`, `impacted_reliability`, `affects_equipment` |

## Read layer

| Service | Role |
|---------|------|
| `GraphTraversalService` | `get_chain`, `get_upstream`, `get_downstream`, `explain_risk` |
| `ReliabilityContextService` | Graph-first context bundle with chain paths |
| `GraphKpiAggregator` | Executive KPI alignment with graph counts |
| `GET /ril/equipment/{id}/reliability-chain` | Equipment chain API |

## Audit helpers

`backend/services/reliability_graph_audit.py` provides:

- `missing_edge()` — check a single expected edge
- `audit_program_task_edges()` — apply-strategy coverage for a v2 program
- `audit_pm_import_task()` — PM import applied_to edge
- `audit_scheduled_task_completed()` — completed scheduled_task lifecycle edges
- `audit_scheduled_task_created()` — schedule-time base edges
- `audit_observation_edges()` — observation reactive chain
- `audit_investigation_chain()` — threat → investigation
- `sample_db_audit()` — sample recent entities and report gaps (tenant-aware)

## UAT gate

```bash
cd backend && python scripts/verify_reliability_graph_sync.py
cd backend && MONGO_URL=... python scripts/verify_reliability_graph_sync.py
```

The script runs:

1. **Static path checks** — sync hooks wired in `task_service`, `programs`, `pm_import_service`, `observation_service`, `scheduler`, `investigations`, `actions`, `chat`
2. **Optional DB sampling** — when `MONGO_URL` is set, samples programs, PM import edges, scheduled tasks, observations, and investigations

Registered in `backend/scripts/verify_uat_gates.py` as `reliability_graph_sync`.

## Backfill

```bash
cd backend && MONGO_URL=... python scripts/backfill_reliability_edge_tenant.py
```

Backfills `tenant_id` from `equipment_nodes` and defaults `status=active` on legacy edges.

## Audit mode

Set `RELIABILITY_GRAPH_AUDIT_MODE=true` to re-raise graph sync failures (PM import and task instance completion) instead of logging and continuing. Production defaults remain resilient (log + continue).

## Collections

| Collection | Purpose |
|------------|---------|
| `reliability_edges` | Edge-only graph store |
| `findings` | Structured findings from task completion |
| `outcomes` | Action verification outcomes |
| `reliability_impacts` | Measurable reliability impact per outcome |
