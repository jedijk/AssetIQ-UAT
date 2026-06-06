# Reliability Graph Sync

AssetIQ materializes **reliability edges** in MongoDB (`reliability_edges`) to connect equipment, strategies, program tasks, PM imports, scheduled work, and task instances. This document describes sync hooks and the UAT audit gate.

## Edge sources

| Event | Sync function | Key relations |
|-------|---------------|---------------|
| Apply Strategy | `sync_edges_for_apply_strategy` | `equipment → has_strategy_type`, `equipment → has_program`, `program_task → mitigates_failure_mode` |
| PM Import apply | `sync_edge_for_pm_import_task` | `pm_import_task → applied_to → failure_mode` |
| Scheduled task lifecycle | `sync_edges_for_scheduled_task` | base edges + `completed_on` / `cancelled_for` |
| Task instance complete | `TaskService._sync_reliability_graph_on_complete` | scheduled_task lifecycle + `task_instance → executed_on → equipment` |

## Audit helpers

`backend/services/reliability_graph_audit.py` provides:

- `missing_edge()` — check a single expected edge
- `audit_program_task_edges()` — apply-strategy coverage for a v2 program
- `audit_pm_import_task()` — PM import applied_to edge
- `audit_scheduled_task_completed()` — completed scheduled_task lifecycle edges
- `sample_db_audit()` — sample recent entities and report gaps

## UAT gate

```bash
cd backend && python scripts/verify_reliability_graph_sync.py
cd backend && MONGO_URL=... python scripts/verify_reliability_graph_sync.py
```

The script runs:

1. **Static path checks** — sync hooks wired in `task_service`, `programs`, `pm_import_service`
2. **Optional DB sampling** — when `MONGO_URL` is set, samples programs, PM import edges, and completed scheduled tasks

Registered in `backend/scripts/verify_uat_gates.py` as `reliability_graph_sync`.

## Audit mode

Set `RELIABILITY_GRAPH_AUDIT_MODE=true` to re-raise graph sync failures (PM import and task instance completion) instead of logging and continuing. Production defaults remain resilient (log + continue).

## Task instance completion gap (fixed)

`TaskService.complete_task()` now loads the linked `scheduled_task` when `scheduled_task_id` is present and calls `sync_edges_for_scheduled_task(..., event="completed")`. Task instances with equipment or failure-mode metadata also upsert `task_instance` edges.
