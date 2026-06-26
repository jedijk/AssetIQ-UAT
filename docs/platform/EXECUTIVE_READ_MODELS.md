# Executive Read Models (Platform 1.0 WS6)

**Objective:** Executive and operational dashboards read from optimized, pre-aggregated snapshots — not live operational collections on every request.

Machine-readable registry: `backend/architecture/read_models_registry.py`  
Verification: `cd backend && python3 scripts/verify_read_models_registry.py`

**Status:** **Done (WS6)** — dashboard routes and visual boards read snapshots on the request path; materializers aggregate operational collections on cache miss or via outbox invalidation.

---

## Dashboard families

| Family | Read model(s) | Status |
|--------|---------------|--------|
| Executive Dashboard | `executive_dashboard`, `ril_dashboard`, `production_dashboard`, `insights_summary`, `analytics_dashboard` | Active |
| Lifecycle Exposure | `executive_dashboard`, `reliability_snapshots`, `analytics_dashboard` | Active |
| PM Compliance | `executive_dashboard` (embedded); dedicated `pm_compliance` | Embedded (split planned) |
| Task Completion | `work_execution_kpi`, `work_item_projection` | Active |
| Reliability KPIs | `executive_kpi`, `ril_dashboard`, `reliability_context` | Active |
| Active Threat Exposure | `executive_kpi`, `executive_dashboard` | Active |
| Critical Equipment | `asset_health` | Active (batch daily) |
| Visual Boards | `executive_dashboard` (via `visual_board_data_service`) | Active |

---

## Read model inventory

| ID | Collection | Materializer | TTL | Mode |
|----|------------|--------------|-----|------|
| `executive_dashboard` | `executive_dashboard_snapshots` | `executive_dashboard_materializer` | 300s | cache-aside |
| `executive_kpi` | `executive_kpi_snapshots` | `executive_kpi_materializer` | 300s | cache-aside |
| `work_execution_kpi` | `work_execution_kpi_snapshots` | `work_execution_kpi_materializer` | 300s | cache-aside |
| `asset_health` | `asset_health_documents` | `asset_health_materializer` | daily | batch |
| `ril_dashboard` | `ril_dashboard_snapshots` | `ril_dashboard_materializer` | 300s | cache-aside |
| `production_dashboard` | `production_dashboard_snapshots` | `production_dashboard_materializer` | 300s | cache-aside |
| `reliability_snapshots` | `reliability_snapshots` | `reliability_snapshot_service` | daily | batch |
| `work_item_projection` | `work_item_projections` | `work_item_projection` | 30s | cache-aside |
| `reliability_context` | `reliability_context_snapshots` | `reliability_context_service` | 120s | cache-aside |
| `insights_summary` | `insights_summary_snapshots` | `insights_summary_materializer` | 600s | cache-aside |
| `analytics_dashboard` | `analytics_dashboard_snapshots` | `analytics_dashboard_materializer` | 600s | cache-aside |
| `pm_compliance` | *(planned)* | — | — | planned |

---

## Architecture

```
Operational write  →  Domain service  →  Canonical collection
                              ↓
                    notify_dashboard_data_changed()
                              ↓
                    projection_dispatch → outbox → projection_handler
                              ↓
                    Materializer (refresh)
                              ↓
                    Read model collection  →  Dashboard route (read-only)
```

**Rules**

1. Read models are **derived** — never authoritative for mutations.
2. Dashboard routes read snapshots on the warm path; cold misses compute once then persist.
3. Invalidation uses `services/dashboard_read_model_hooks.py` → `projection_dispatch` → outbox → `workers/projection_handler.py`.
4. KPI ownership is documented in `services/kpi_ownership_registry.py` — avoid duplicate calculators.

---

## Mutation hooks

Operational mutations call `notify_dashboard_data_changed(user, reason=...)` from:

- `services/threat_crud.py` — threat update/delete
- `services/my_tasks_service.py` — action start/complete
- `services/task_service.py` — task instance complete

This enqueues refresh for all dashboard read models and invalidates per-user work item projections.

---

## Verification

```bash
cd backend && python3 scripts/verify_read_models_registry.py
cd backend && MONGO_URL=mongodb://localhost:27017 python3 -m pytest tests/test_read_models_registry.py -q
```

---

## References

- [`CANONICAL_DATA_MODELS.md`](./CANONICAL_DATA_MODELS.md) — operational authority vs derived reads
- [`PLATFORM_1_0_EXECUTION.md`](./PLATFORM_1_0_EXECUTION.md) — WS6 definition of done
- `backend/services/kpi_ownership_registry.py` — KPI canonical field mapping
