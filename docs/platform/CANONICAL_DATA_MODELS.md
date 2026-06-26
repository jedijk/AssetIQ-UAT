# Canonical Data Models (Platform 1.0 WS3)

**Objective:** Exactly one authoritative data model per business object.

Machine-readable registry: `backend/architecture/canonical_models.py`  
Verification: `cd backend && python3 scripts/verify_canonical_models.py`

---

## Summary table

| Domain | Canonical collection(s) | Service | API | Legacy / notes |
|--------|-------------------------|---------|-----|----------------|
| Equipment | `equipment_nodes`, `equipment_types` | `equipment_search_service` | `routes/equipment/*` | `installations` (hierarchy helper) |
| Failure modes | `failure_modes` | `failure_modes_routes_service` | `failure_modes_routes`, `efms` | Static library fallback; `equipment_failure_modes` for EFM links |
| Observations | `threats`, `observations` | `observation_service` | `observations`, `threats`, `chat` | Unified read: `work_signal_projection` |
| Investigations | `investigations` + children | `investigation_service` | `investigations` | Child cols: timeline, causes, action_items, evidence |
| Actions | `central_actions` | `action_service` | `actions` | `actions` (KPI fallback only) |
| Strategies | `equipment_type_strategies` | `apply_strategy_service` | `maintenance_strategy_v2` | — |
| Maintenance programs | `maintenance_programs_v2` | `maintenance_program_service` | `maintenance_program`, `pm_import` | `maintenance_programs` (flag-gated) |
| Scheduled tasks | `scheduled_tasks` | `maintenance_scheduler_service` | `maintenance_scheduler/*` | — |
| Task instances | `task_instances` | `task_service` | `my_tasks`, `tasks`, `work_items` | `work_item_projections` (read model) |
| Forms | `form_templates`, `form_submissions` | `form_service` | `forms` | — |
| Spare parts | `spare_parts` | `spare_parts_service` | `spare_parts` | `spare_categories`, `spare_part_files` |
| Visual boards | `visual_boards` | `visual_board_service` | `visual_boards` | versions, tokens, screens, analytics |
| AI recommendations | *(embedded in v2 program)* | `maintenance_program_ai_recommendations` | `maintenance_program` | No standalone collection |

---

## Domain details

### Equipment

- **Authority:** `equipment_nodes` (hierarchy, tags, criticality, type linkage).
- **Type library:** `equipment_types` — canonical equipment type definitions.
- **Repository:** `EquipmentRepository` → `equipment_nodes`.

### Failure modes

- **Authority:** MongoDB `failure_modes` collection (seeded from static library, upsert-capable).
- **EFM:** `equipment_failure_modes` links equipment instances to failure mode definitions.
- **Legacy:** Integer `legacy_id` and `failure_modes.py` static file remain for backward-compatible lookups only.

### Observations (reactive signals)

Two write paths, one read projection:

| Collection | When used |
|------------|-----------|
| `threats` | Chat capture, risk scoring, primary reactive workflow |
| `observations` | Structured observation engine, workspace API |

**Do not** merge collections without a migration plan. Use `work_signal_projection.normalize_work_signal()` for KPIs, dashboards, and workspace lists.

### Investigations

- **Parent:** `investigations`
- **Children:** `timeline_events`, `failure_identifications`, `cause_nodes`, `action_items`, `evidence_items`
- **Actions bridge:** Investigation `action_items` sync to `central_actions` via `investigation_action_bridge` (not dual-write).

### Actions

- **Authority:** `central_actions` — all actionable work items across threats, investigations, and standalone creation.
- **Legacy:** `actions` collection retained for historical analytics comparison in `insights_service` only.

### Maintenance programs

- **Authority:** `maintenance_programs_v2` — embedded `tasks[]`, versioning, AI pending counters.
- **Legacy:** `maintenance_programs` flat rows
  - Write: `SYNC_LEGACY_MAINTENANCE_PROGRAMS=true` (default **off**)
  - Read fallback: `READ_LEGACY_MAINTENANCE_PROGRAMS=true` (default **off**)
  - See `services/scheduler_config.py`

### Task instances

- **Authority:** `task_instances` — executed / ad-hoc work.
- **Read model:** `work_item_projections` — denormalized for My Tasks and KPI materializers (not a second source of truth).

### AI recommendations

- **Not a collection.** `maintenance_program_ai_recommendations` generates proposed `MaintenanceProgramTask` objects.
- **Persistence:** Accepted recommendations append to `maintenance_programs_v2.tasks`; `ai_recommendations_pending` counter on program doc.
- **Distinct from** `insights_service.generate_ai_recommendations` (execution/reliability analytics recommendations).

---

## Architecture layers

```
API route  →  Domain service  →  Repository (optional)  →  Canonical collection
                    ↓
            Domain events / graph sync / read materializers
```

- **GREEN routes** (no direct `db` import): see `architecture/convergence_registry.py`
- **Repositories:** `architecture/convergence_registry.REPOSITORY_COLLECTIONS`
- **Bounded contexts:** `architecture/domain_registry.py`

---

## Legacy compatibility rules

1. Legacy collections are **read-only** unless an explicit env flag enables dual-write.
2. New features write only to canonical collections.
3. Read models (`work_item_projections`, executive snapshots, reliability_snapshots) are derived — never authoritative for mutations. See [`EXECUTIVE_READ_MODELS.md`](./EXECUTIVE_READ_MODELS.md) and `architecture/read_models_registry.py`.
4. Graph edges (`reliability_edges`) are derived from canonical entities — see `RELIABILITY_GRAPH_ARCHITECTURE.md`.

---

## WS3 completion checklist

- [x] Registry for all 13 WS3 domains (`canonical_models.py`)
- [x] Per-domain canonical collection, service, API, legacy notes
- [x] Verification gate (`verify_canonical_models.py`)
- [x] Documentation (this file)

---

## WS6 read models

Executive dashboard snapshots and materializers are registered separately from operational domains. Dashboard routes read only from snapshot collections on the request path; materializers aggregate operational data on cache miss or after invalidation.

- **Registry:** `backend/architecture/read_models_registry.py` (12 read models)
- **Invalidation:** `services/dashboard_read_model_hooks.py`
- **Verification:** `scripts/verify_read_models_registry.py`
- **Documentation:** [`EXECUTIVE_READ_MODELS.md`](./EXECUTIVE_READ_MODELS.md)
