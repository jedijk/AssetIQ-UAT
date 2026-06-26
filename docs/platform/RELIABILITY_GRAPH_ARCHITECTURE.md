# Reliability Graph Architecture (Platform 1.0 WS2)

The reliability graph is a **tenant-scoped edge store** (`reliability_edges` in MongoDB) linking equipment, maintenance programs, reactive workflows, and outcomes. It powers Intelligence Map topology, RIL context, graph traversal, and UAT sync gates.

## Storage model

| Collection | Role |
|------------|------|
| `reliability_edges` | Canonical edge documents (`id`, `source_*`, `target_*`, `relation`, `status`, `tenant_id`) |
| `findings` | Maintenance completion findings (optional text from task instances) |
| `outcomes` | Verified action outcomes |
| `reliability_impacts` | Post-outcome reliability deltas |

**Edge identity** (deterministic, idempotent upserts):

```
{source_type}:{source_id}:{relation}:{target_type}:{target_id}
```

**Status:** `active` | `retired` — deletes use soft retire via `retire_edges_for_entity`.

## Node types

Defined in `services/reliability_ontology.py` (`NODE_TYPES`). Reactive signals use storage types `threat`, `observation`, and `finding`; the ontology UI merges `threat`/`finding`/`observation` into a single **Observation** node for visualization.

| Domain | Node types |
|--------|------------|
| Maintenance | `equipment`, `failure_mode`, `equipment_type_strategy`, `maintenance_program_v2`, `program_task`, `strategy_task_template`, `scheduled_task`, `task_instance`, `pm_import_task`, `spare_part` |
| Reactive | `observation`, `threat`, `finding`, `investigation`, `cause`, `action`, `outcome`, `reliability_impact`, `task_completion` |
| RIL | `prediction` (via `has_prediction` edges) |

## Core lifecycle

```
Observation/Threat → Investigation → Action → Outcome → Reliability Impact
        ↓                                      ↑
   Failure Mode ← Strategy ← Program ← Scheduled Task ← Task Instance
```

## Write path rules (ownership)

1. **All workflow code** calls `dispatch_graph_sync(sync_name, label, **kwargs)` — never `sync_*` or `upsert_edge` directly.
2. **`upsert_edge`** lives only in approved graph modules (`reliability_graph_core.py`, `reliability_graph_entities.py`, `reliability_graph_strategy.py`, re-exported from `reliability_graph.py`) plus `spare_parts_graph_sync.py`. See `APPROVED_UPSERT_MODULES` in `reliability_graph_ownership.py`.
3. **Ownership matrix** in `services/reliability_graph_ownership.py` — one canonical `owner` function per `(relation, source_type, target_type)`.
4. **Metadata-only updates** (e.g. AI twin RUL on `has_failure_mode`) use `annotate_equipment_failure_mode_risk` — same edge id, enriched metadata.

### Dispatch handlers (`GRAPH_SYNC_HANDLERS`)

| Handler | Workflow trigger |
|---------|------------------|
| `sync_edges_for_apply_strategy` | Apply Strategy |
| `sync_edge_for_pm_import_task` | PM import apply |
| `sync_edges_for_scheduled_task` | Schedule create / complete / cancel |
| `sync_task_instance_completion_edges` | Task instance completion |
| `sync_observation_edges` | Observation create / link |
| `sync_threat_edges` | Threat create (delegates observation edges when linked) |
| `sync_investigation_edges` | Investigation open |
| `sync_cause_edge` | RCA cause node |
| `sync_action_edges` | Central / investigation action |
| `sync_outcome_edges` | Action verification / closure |
| `sync_prediction_edges` | RIL prediction materialization |

### Approved submodule

`spare_parts_graph_sync.py` owns `used_on` and `requires` edges for SpareIQ.

## Internal / alias edges

These exist in storage but are merged in ontology UI:

- `linked_to_threat`, `escalated_to` — observation ↔ threat linkage
- `raised_observation` — finding → observation triage

Do not create these outside `sync_observation_edges` / `sync_finding_to_observation_edge`.

## Read path

| Module | Purpose |
|--------|---------|
| `reliability_graph_query.py` | Topology stats, BFS traversal, risk explanation |
| `reliability_ontology.py` | Schema + live counts API |
| `reliability_snapshot_service.py` | Time-travel snapshots and edge fingerprints |
| `reliability_context_service.py` | AI evidence assembly |

## Validation

```bash
cd backend && python3 scripts/verify_reliability_graph_sync.py
```

Gate checks:

- Static hooks in workflow services
- Ownership matrix covers all dispatch handlers and ontology relations
- No unapproved `upsert_edge` callers in `services/`
- Optional DB sample via `reliability_graph_audit.sample_db_audit`

```bash
cd backend && MONGO_URL=... python3 scripts/backfill_reliability_graph_history.py --phase all
```

## Async mode

Set `GRAPH_SYNC_ASYNC=true` to enqueue graph sync via `event_outbox` instead of inline writes. Strict failure mode: `GRAPH_SYNC_STRICT=true`.

## WS2 completion checklist

- [x] Node and relation catalog aligned with code (`reliability_ontology.py`)
- [x] Ownership matrix (`reliability_graph_ownership.py`)
- [x] Architecture documentation (this file)
- [x] Verify gate extended with ownership + upsert caller checks
- [x] `ai_risk_engine` routed through `annotate_equipment_failure_mode_risk`
