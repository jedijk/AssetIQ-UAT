# AssetIQ Platform 1.0 — Execution Plan (v1.0)

**Objective:** Build a robust, scalable, maintainable foundation so every future module shares one consistent architecture.

**Gate:** Phase 1 UAT convergence complete (verification gates passed; data backfills done on UAT).

**No major new product modules** until Platform 1.0 is complete.

**Explicitly deferred (not in scope):** Neo4j migration, Vite, Kubernetes, microservices, plugin marketplace, voice, multi-region, **production rollout**, **UAT 48h soak**, **production strict mode**, Redis clustering.

---

## Current baseline (post–Phase 1 UAT)

| Area | Status |
|------|--------|
| UAT verification gates | **Pass** — `verify_uat_gates.py`, `phase1_data_integrity_report.py` |
| Maintenance domain tenant scoping (B1) | **Done** — `maintenance_tenant_scope.py` cluster + `77d97602` |
| Broader tenant audit | **Done (WS1)** — `tenant_service_filter_audit.py` reports zero flagged services |
| Reliability graph sync (UAT) | **Pass** — `verify_reliability_graph_sync.py` |
| Graph ownership / dedup | **Done (WS2)** — `reliability_graph_ownership.py`, architecture doc |
| Canonical data models | **Done (WS3)** — `canonical_models.py`, `CANONICAL_DATA_MODELS.md` |
| AI gateway | **Partial** — `ai_gateway.py` in use; not full Platform 1.0 AI stack |
| Executive read models | **Partial** — some materializers exist; dashboards still mix operational reads |
| Large-file modularization | **In progress** — Waves 4–8 splits started |
| R2 on UAT (AI scan photos) | **Open** — ops, not blocking Platform 1.0 code track |

---

## Success criteria

Platform 1.0 is complete when:

- [ ] Every backend service is tenant safe
- [ ] Every domain has one canonical data model
- [ ] The reliability graph has one owner per relationship
- [ ] All major files have been modularized (~800 line target)
- [ ] Every AI feature uses the unified AI platform
- [ ] Executive dashboards use read models
- [ ] Graph performance benchmarks completed
- [ ] Engineering standards documented and CI-enforced

---

## Workstream 1 — Complete tenant convergence

**Objective:** Remove every remaining tenant isolation inconsistency.

| Task | Status |
|------|--------|
| Complete tenant scoping for all services flagged by `tenant_service_filter_audit.py` | **Done** |
| Every DB read/write uses canonical tenant scope helper | **Done** — `scoped` / `scoped_job` in `tenant_scope.py` |
| Remove direct MongoDB access without tenant filtering | **Done** (heuristic audit clean) |
| Background jobs tenant-aware | **Done** — `scoped_job`, `BACKFILL_TENANT_ID` |
| Graph operations tenant scoped | **Done** (reads/upserts) |
| Import/export tenant scoped | **Partial** — PM import cluster done; export paths not re-audited |

**Deliverables:** Zero audit findings · `docs/platform/TENANT_SCOPE.md` · run `phase2_tenancy_report.py` on UAT before prod

**Definition of done:** Zero unsafe services · zero unscoped DB access · 100% tenant isolation coverage

```bash
cd backend && python3 scripts/tenant_service_filter_audit.py
cd backend && MONGO_URL=... DB_NAME=assetiq-UAT python3 scripts/phase2_tenancy_report.py
```

**Priority flagged services:** `insights_service`, `investigation_service`, `equipment_nodes_service`, `production_logs_service`, `program_task_resolution` (done), `task_service`, `investigation_action_sync`, `strategy_propagation`

---

## Workstream 2 — Reliability graph foundation

**Objective:** Deterministic, maintainable graph before performance optimization.

| Task | Status |
|------|--------|
| Document every node type | **Done** — `reliability_ontology.py` + `RELIABILITY_GRAPH_ARCHITECTURE.md` |
| Document every edge type | **Done** — ontology aligned with storage types |
| Ownership matrix (one creator per relationship) | **Done** — `reliability_graph_ownership.py` |
| Remove duplicate graph creation logic | **Done** — upsert caller guard; AI twin via `annotate_equipment_failure_mode_risk` |
| Validate graph after every workflow | **Done** — extended `verify_reliability_graph_sync.py` + audit (0 UAT gaps) |

**Core lifecycle**

```
Observation → Investigation → Action → Failure Mode → Strategy
  → Maintenance Program → Scheduled Task → Task Instance
  → Execution → Evidence → Observation
```

**Deliverables:** `docs/platform/RELIABILITY_GRAPH_ARCHITECTURE.md` · ownership matrix · validation gate

**Definition of done:** One owner per node/edge · no duplicate relationships · graph validation passes

```bash
cd backend && MONGO_URL=... python3 scripts/verify_reliability_graph_sync.py
cd backend && MONGO_URL=... python3 scripts/backfill_reliability_graph_history.py --phase all
```

---

## Workstream 3 — Canonical data models

**Objective:** One source of truth per business object.

**Domains to review:** Equipment · Failure Modes · Observations · Investigations · Actions · Strategies · Maintenance Programs · Scheduled Tasks · Task Instances · Forms · Spare Parts · Visual Boards · AI Recommendations

For each domain: canonical collection · API · service · ownership · legacy compatibility

**Status:** **Done** — registry + docs + verify gate for all 13 WS3 domains.

**Deliverable:** `docs/platform/CANONICAL_DATA_MODELS.md` · `architecture/canonical_models.py`

```bash
cd backend && python3 scripts/verify_canonical_models.py
```

**Definition of done:** Exactly one authoritative data model per domain (documented; legacy paths flag-gated)

---

## Workstream 4 — Break down large files

**Objective:** Maintainability without functional or UI changes.

**Status:** **In progress** — maintenance strategy, PM import, forms, causal engine, observation workspace splits started (Waves 4–8).

**Rules:** No functional changes · no UI redesign · identical behaviour

**Deliverables:** Files under ~800 lines · improved module separation

```bash
# Find large backend services
find backend/services -name '*.py' -exec wc -l {} + | sort -n | tail -20
# Find large frontend components
find frontend/src -name '*.js' -o -name '*.jsx' | xargs wc -l 2>/dev/null | sort -n | tail -20
```

---

## Workstream 5 — AI platform

**Objective:** Unified AI platform for every AI capability.

```
Provider Layer → Prompt Registry → Context Builder → Evidence Builder
  → Prompt Execution → Output Validation → Human Approval → Audit Trail
```

| Task | Status |
|------|--------|
| Centralize prompts | **Open** |
| Standardize context/evidence building | **Open** |
| Provider abstraction | **Partial** — `ai_gateway.py` |
| Prompt versioning | **Open** |
| Token efficiency / AI logging | **Partial** |

**Definition of done:** Every AI feature uses the same platform entry points

---

## Workstream 6 — Executive read models

**Objective:** Separate operational writes from analytical reads.

**Read models needed:** Executive Dashboard · Lifecycle Exposure · PM Compliance · Task Completion · Reliability KPIs · Active Threat Exposure · Critical Equipment · Visual Boards

**Status:** **Open** — operational collections still queried by some dashboard paths

**Definition of done:** Executive dashboards read only from optimized read models

---

## Workstream 7 — Graph performance

**Objective:** Optimize only where measurements show need.

**Benchmarks:** 100 · 1,000 · 10,000 · 100,000 assets

**Metrics:** BFS latency · query count · node/edge count · memory · AI traversal latency

**Status:** **Not started**

**Deliverables:** Performance benchmark report · optimization report

---

## Workstream 8 — Platform standards

**Objective:** Engineering standards enforced by CI.

**Covers:** Max service/component size · folder structure · naming · API/graph/event conventions · query keys · tenant helpers · AI entry points · error handling · logging · testing

**Status:** **Partial** — `tenant_service_filter_audit.py`, `route_auth_inventory.py`, architecture boundaries tests exist; no unified standards doc + CI gate

**Definition of done:** Standards documented · CI validates new code

---

## Recommended execution order

1. **WS1** — Clear remaining 26 tenant-audit services (highest risk)
2. **WS2** — Graph ownership matrix + dedup pass (builds on Phase 1 graph sync)
3. **WS3** — Canonical data model doc (unblocks WS4–6 naming)
4. **WS8** — Platform standards doc + first CI checks (file size, tenant ratio)
5. **WS4** — Continue large-file splits per domain
6. **WS5** — AI platform (prompt registry + context builder)
7. **WS6** — Executive read models
8. **WS7** — Graph performance benchmarks (after WS2 stable)

---

## References

- [`PHASE1_EXECUTION.md`](./PHASE1_EXECUTION.md) — Phase 1 UAT convergence (complete)
- [`PHASE_0_STABILIZATION_REPORT.md`](./PHASE_0_STABILIZATION_REPORT.md)
- [`RELIABILITY_GRAPH_SYNC.md`](./RELIABILITY_GRAPH_SYNC.md)
- [`TENANT_MIDDLEWARE.md`](./TENANT_MIDDLEWARE.md)
- [`../ASSETIQ_SYSTEM_ARCHITECTURE_AND_FUNCTIONAL_DESIGN.md`](../ASSETIQ_SYSTEM_ARCHITECTURE_AND_FUNCTIONAL_DESIGN.md)
