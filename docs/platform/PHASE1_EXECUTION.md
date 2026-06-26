# Phase 1 — Platform Convergence & Enterprise Readiness (v1.0)

**Current source of truth:** [`PLATFORM_TRUTH_AUDIT_2026-06-26.md`](./PLATFORM_TRUTH_AUDIT_2026-06-26.md)

> This execution plan stays active until archived after the next live UAT gate run.

**Objective:** Complete convergence from fast-moving startup platform to enterprise-ready Industrial Reliability Intelligence Platform.

**Gate:** Phase 0 complete; no new product modules unless required for convergence.

**Current status:** See [`ASSETIQ_TECHNICAL_STATUS.md`](./ASSETIQ_TECHNICAL_STATUS.md) for operational gate commands; see [`PLATFORM_TRUTH_AUDIT_2026-06-26.md`](./PLATFORM_TRUTH_AUDIT_2026-06-26.md) for product/platform truth.

**No Phase 2 work** until every verification report in Workstream D passes on **live UAT** (exit 0).

---

## Success criteria (definition of done)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Every verification script passes (live UAT) | **Not verified** | Requires UAT Atlas run — see Workstream D; **not** assumed from code gates alone |
| No dual-write paths in active workflows | **Done (config)** | Legacy program flags off; legacy rows still exist (read-only) |
| All maintenance data tenant scoped | **Done (code gate)** | `tenant_service_filter_audit.py` → 0 flagged (WS1) |
| All scheduled work visible to users | **Not verified (UAT)** | Workstream A1 below — last documented count 248 unbridged; re-run `phase1_data_integrity_report.py` |
| Reliability graph sync (code gate) | **Done (code gate)** | `verify_reliability_graph_sync.py` static checks pass; DB sample needs UAT |
| Reliability graph fully synchronized (live UAT) | **Not verified** | DB sample section of graph sync gate not run on UAT in current cycle |
| UAT 48h soak without critical issues | **Deferred** | Explicitly out of scope for current track |
| Production ready for strict tenant mode | **Deferred** | Prod backfill + enablement not done |

---

## Workstream A — Data integrity

### A1. Scheduled task convergence

| Item | Status |
|------|--------|
| 248 open `scheduled_tasks` without `task_instance` | **Open** (UAT) |
| Root cause: bridge is week-windowed; backlog predates cron | Documented |
| Bridge logic repair | **Open** — need full-horizon backfill, not only 7-day window |
| Acceptance: 0 unbridged active scheduled tasks | **Not met** |

**Commands**

```bash
# Report unbridged count
cd backend && MONGO_URL=... DB_NAME=assetiq-UAT python3 scripts/phase1_data_integrity_report.py

# Manual week bridge (admin API — does not clear full backlog alone)
POST /api/admin/task-generation/run  { "look_ahead_days": 60 }

# Graph/history backfill includes scheduled_tasks + task_instances phases
cd backend && MONGO_URL=... python3 scripts/backfill_reliability_graph_history.py --phase maintenance
```

### A2. Action convergence

| Item | Status |
|------|--------|
| 8 `action_items` missing `central_actions` mirror | **Open** (UAT) |
| `migrate_investigation_action_items.py` | Ready, not run on UAT |
| Acceptance: 100% sync | **Not met** |

```bash
cd backend && MONGO_URL=... python3 scripts/migrate_investigation_action_items.py --dry-run
cd backend && MONGO_URL=... python3 scripts/migrate_investigation_action_items.py
```

### A3. Maintenance program convergence

| Item | Status |
|------|--------|
| 8 legacy active programs, 1 v2 doc, 3 equipment legacy-only | **Open** (UAT) |
| `READ_LEGACY` / `SYNC_LEGACY` flags | **Off** (config OK) |
| Acceptance: all equipment on v2 | **Not met** |

```bash
cd backend && MONGO_URL=... python3 scripts/verify_v2_program_coverage.py
cd backend && MONGO_URL=... python3 scripts/verify_schedule_drift.py
```

### A4. Failure mode library

| Item | Status |
|------|--------|
| Mongo 483 vs static library 627 (144 missing) | **Open** (UAT) |
| Acceptance: Mongo equals master library | **Not met** |

```bash
cd backend && MONGO_URL=... python3 scripts/seed_failure_modes.py
```

---

## Workstream B — Tenant isolation

### B1. Maintenance domain

| Service cluster | Status |
|-----------------|--------|
| `maintenance_scheduler_sync`, `maintenance_program_*`, `maintenance_strategy_v2_service`, `scheduler_program_source`, `maintenance_routes_service` | **Done** (`maintenance_tenant_scope.py`) |
| `maintenance_strategy_propagation` | **Done** |
| `maintenance_readiness` | **Done** |
| `maintenance_strategy_v2_task_templates` | **Done** |
| `maintenance_program_ai_recommendations` | **Done** |
| `maintenance_scheduler_disabled` | **Done** |
| `maintenance_strategy_helpers` | **Done** (v2 drift reads; FM library reads are global catalog) |
| `task_instance_bridge` | **Done** |
| `apply_strategy_service` | **Done** |
| `program_task_resolution` | **Done** |

### B2. Service layer audit

| Item | Status |
|------|--------|
| `tenant_service_filter_audit.py` | **Done (code gate)** — 0 flagged @ WS1 (`503a77e3`) |
| Flagged services (ratio &lt; 0.25) | **0** (was 35+; fixed WS1) |
| Graph tenant reads | **Done** (`reliability_graph`, `reliability_graph_query`) |
| `reliability_edges` tenant backfill | **Done** on UAT (14,350/14,350) — historical ops report |
| Acceptance: zero unsafe reads (live multi-tenant) | **Not met** — single pilot tenant; `phase2_tenancy_report.py` on UAT pending |

```bash
cd backend && python3 scripts/tenant_service_filter_audit.py
cd backend && MONGO_URL=... DB_NAME=assetiq-UAT python3 scripts/phase2_tenancy_report.py
```

### B3. Production readiness

| Item | Status |
|------|--------|
| UAT `TENANT_STRICT_MODE=true` | **On** |
| UAT 48h soak | **Pending** |
| Prod backfill waves 1–11 | **Pending ops** |
| Prod strict mode | **Pending** |

---

## Workstream C — Graph integrity

### C1. Graph synchronization

| Item | Status |
|------|--------|
| `verify_reliability_graph_sync.py` | **Code gate PASS** (static @ uncommitted fix); **UAT DB sample NOT TESTED** this cycle |
| Edge upsert tenant scoping | **Done** |
| `GRAPH_SYNC_ASYNC` / outbox monitoring | **Pending ops** |

### C2. Scheduler integrity lifecycle

Scheduled Task → Task Instance → Execution → Evidence → Graph → Strategy

| Link | Status |
|------|--------|
| Scheduled → Instance | **Broken** (248 unbridged) |
| Instance → Execution | OK when instance exists |
| Evidence → Graph | Partial (code gate passes; UAT DB sample pending) |
| Graph → Strategy | Code paths exist; validation open |

### C3. Graph data validation

| Item | Status |
|------|--------|
| Dedicated graph integrity report | **Partial** — covered by `verify_reliability_graph_sync` + `backfill_reliability_edge_tenant` |
| Orphan nodes/edges, duplicate edges | **Open** — run sync verify after A1/A2 |

```bash
cd backend && MONGO_URL=... python3 scripts/backfill_reliability_edge_tenant.py
cd backend && MONGO_URL=... python3 scripts/verify_reliability_graph_sync.py
```

---

## Workstream D — Verification

All must return exit 0 on **live UAT Atlas** (`DB_NAME=assetiq-UAT`). **Current cycle: not re-run** — treat table below as last documented state until refreshed.

| Report | Last documented UAT state |
|--------|---------------------------|
| `verify_schedule_drift.py` | **FAIL** — 10 equipment missing v2 |
| `verify_v2_program_coverage.py` | **FAIL** — 3 legacy-only equipment |
| `verify_reliability_graph_sync.py` | **Code gate PASS** (static); **DB sample NOT TESTED** on UAT this cycle |
| `phase1_data_integrity_report.py` | **FAIL** (exit 2) when last run on UAT |
| `verify_uat_gates.py` (wrapper) | **FAIL** when last run on UAT (data + schedule gates) |

```bash
cd backend && MONGO_URL=... DB_NAME=assetiq-UAT ENVIRONMENT=uat \
  TENANT_STRICT_MODE=true WORK_ITEMS_SOURCE=v2_instances \
  JWT_SECRET_KEY=... python3 scripts/verify_uat_gates.py

cd backend && MONGO_URL=... DB_NAME=assetiq-UAT ENVIRONMENT=uat \
  python3 scripts/phase1_data_integrity_report.py
```

---

## Workstream E — Enterprise hardening

| Task | Status |
|------|--------|
| Production tenant backfill | Pending |
| Strict mode enablement (prod) | Pending |
| Production smoke tests | Pending |
| Permission audit (`route_auth_inventory.py`) | Script exists; UAT review open |
| API security audit | Phase 0 inventory done |
| Background job audit | Open |
| Scheduler audit | Open |
| R2 object storage on UAT (AI scan photos) | **Open** — 230/231 ai-scans are R2-only metadata |

---

## Code complete (this phase, in repo)

- `services/maintenance_tenant_scope.py` — request, job, and equipment-derived scoping
- Graph tenant reads on edges and context assembly
- AI gateway migration (`ai_helpers`, `feedback` transcribe)
- `tenant_service_filter_audit.py` — includes maintenance scope helpers
- Storage 503 when R2 metadata exists but R2 not configured (`f5b733ad`)

---

## Recommended execution order (UAT)

1. **A4** — `seed_failure_modes.py` (low risk, unblocks FMEA/graph)
2. **A2** — `migrate_investigation_action_items.py`
3. **A1** — Full-horizon task instance backfill (new script or extended bridge), then re-run integrity report
4. **A3** — V2 program migration for 3 legacy-only equipment
5. **B1** — Remaining maintenance support services tenant scope
6. **C1/C3** — `backfill_reliability_graph_history.py` + `verify_reliability_graph_sync`
7. **D** — Re-run all gates until exit 0
8. **48h UAT soak** → **B3/E** prod backfill + strict mode

---

## Deliverables checklist

- [ ] Updated platform documentation (this file + `ASSETIQ_TECHNICAL_STATUS.md`)
- [ ] Tenant audit report (run `phase2_tenancy_report.py` on UAT)
- [ ] Data integrity report (run `phase1_data_integrity_report.py` on UAT — exit 0)
- [ ] Graph integrity report (`verify_reliability_graph_sync.py` on UAT — static + DB sample exit 0)
- [ ] Production readiness report
- [ ] Updated architecture documentation

---

## References

- [`PHASE_0_STABILIZATION_REPORT.md`](./PHASE_0_STABILIZATION_REPORT.md)
- [`RELIABILITY_GRAPH_SYNC.md`](./RELIABILITY_GRAPH_SYNC.md)
- [`TENANT_MIDDLEWARE.md`](./TENANT_MIDDLEWARE.md)
- [`PHASE0_EXECUTION.md`](./PHASE0_EXECUTION.md)
