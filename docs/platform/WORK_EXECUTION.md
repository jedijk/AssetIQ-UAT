# Work Execution — Hybrid Reads & Bridge Retirement

## Overview

My Tasks and scheduler views read from `task_instances` (canonical execution store).
During bridge sync gaps, unbridged `scheduled_tasks` may be merged for a short window.

## Environment Flags

| Variable | Default | Description |
|----------|---------|-------------|
| `WORK_ITEMS_SOURCE` | `hybrid` | `hybrid` merges unbridged scheduled_tasks; `v2_instances` uses task_instances only |
| `WORK_ITEMS_INCLUDE_UNBRIDGED` | `auto` | `true` / `false` / `auto` — in `auto`, include unbridged only when bridge has not synced recently |
| `WORK_ITEMS_BRIDGE_RECENT_HOURS` | `24` | Lookback window for `auto` unbridged inclusion |
| `TASK_INSTANCE_BRIDGE_ENABLED` | `true` | When false, hybrid mode always includes unbridged items |

## Dedupe Rules

When merging hybrid lists:

1. Match by `scheduled_task_id`
2. Fingerprint: `(equipment_id, v2_task_id or maintenance_program_id, due_date)`
3. Prefer `task_instance` over unbridged duplicate

## Scheduler Traceability

`ScheduledTask` rows created by `schedule_program` persist:

- `v2_task_id`
- `v2_program_id`
- `program_source`

These feed reliability graph `resolve_program_task_id()` for correct `program_task` edges.

## UAT Rollout

```bash
# Prefer v2 instances only (post-bridge validation)
WORK_ITEMS_SOURCE=v2_instances

# Re-enable hybrid with auto gap-fill during bridge cutover
WORK_ITEMS_SOURCE=hybrid
WORK_ITEMS_INCLUDE_UNBRIDGED=auto
```
