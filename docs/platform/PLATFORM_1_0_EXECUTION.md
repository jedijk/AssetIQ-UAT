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
| AI gateway | **Done (WS5)** — unified `ai_platform` API; all vision/multimodal paths migrated |
| Executive read models | **Done (WS6)** — dashboard routes read snapshots; materializers refresh on miss/invalidation |
| Graph performance benchmarks | **Done (WS7)** — harness, verify gate, optimization report |
| Platform standards | **Done (WS8)** — standards doc + unified CI gate |
| Large-file modularization | **Done (WS4)** — zero service modules over 800 LOC |
| R2 on UAT (AI scan photos) | **Open** — ops, not blocking Platform 1.0 code track |

---

## Success criteria

Platform 1.0 is complete when:

- [ ] Every backend service is tenant safe
- [ ] Every domain has one canonical data model
- [ ] The reliability graph has one owner per relationship
- [x] All major files have been modularized (~800 line target)
- [x] Every AI feature uses the unified AI platform
- [x] Executive dashboards use read models
- [x] Graph performance benchmarks completed
- [x] Engineering standards documented and CI-enforced

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

**Status:** **Done** — all `backend/services/**/*.py` modules are at or below 800 LOC (architecture gate enforced).

**Rules:** No functional changes · no UI redesign · identical behaviour

**Deliverables:** Files under ~800 lines · improved module separation

```bash
find backend/services -name '*.py' -exec wc -l {} + | sort -n | tail -20
cd backend && python3 -m pytest tests/test_architecture_convergence.py::test_service_modules_respect_loc_limit_or_allowlist -q
```

**WS4 splits (this batch):**

| Module | Extracted from | Purpose |
|--------|----------------|---------|
| `task_service_helpers.py` | `task_service.py` | Serializers + date math |
| `task_service_scheduling.py` | `task_service.py` | Plan instance generation |
| `chat_routes_state.py` | `chat_routes_service.py` | Conversation state + FM loader |
| `chat_routes_media.py` | `chat_routes_service.py` | Image compression |
| `chat_routes_observation.py` | `chat_routes_service.py` | Work-signal creation from chat |
| `maintenance_program_helpers.py` | `maintenance_program_service.py` | Equipment lookup + criticality |
| `maintenance_program_session_import.py` | `maintenance_program_service.py` | PM Import session → program tasks |
| `maintenance_program_enrichment.py` | `maintenance_program_service.py` | Strategy merge + criticality context |
| `form_service_thresholds.py` | `form_service.py` | Threshold evaluation + breach observations |
| `form_service_serializers.py` | `form_service.py` | Template/submission serialization |
| `form_service_analytics.py` | `form_service.py` | Form analytics aggregation |
| `form_service_submissions_list.py` | `form_service.py` | Lightweight submission list query |
| `chat_routes_confirm.py` | `chat_routes_service.py` | Issue-confirm helpers |
| `chat_routes_finalize.py` | `chat_routes_service.py` | Post-state-machine persistence |
| `maintenance_strategy_v2_sync.py` | `maintenance_strategy_v2_service.py` | Library sync + schedule refresh |
| `form_service_reliability.py` | `form_service.py` | Graph/score loop after submit |
| `form_service_submissions_query.py` | `form_service.py` | Filtered submission list query |
| `chat_routes_processor.py` | `chat_routes_service.py` | Core chat state machine |
| `production_logs_templates.py` | `production_logs_service.py` | Template CRUD + batch ingest |
| `form_service_submit.py` | `form_service.py` | Submit validation + persistence |
| `form_service_submission_detail.py` | `form_service.py` | Attachment-safe submission fetch |
| `production_logs_ingest.py` | `production_logs_service.py` | Upload/preview/ingest jobs |
| `maintenance_program_scheduler_sync.py` | `maintenance_program_service.py` | PM-import → scheduler sync |
| `maintenance_program_task_crud.py` | `maintenance_program_service.py` | Task add/update/delete |
| `maintenance_program_regeneration.py` | `maintenance_program_service.py` | Strategy-based program regeneration |
| `form_service_templates.py` | `form_service.py` | Template CRUD, fields, documents |
| `maintenance_strategy_v2_instances.py` | `maintenance_strategy_v2_service.py` | Per-equipment task generation and customization |
| `maintenance_strategy_v2_fm_strategy.py` | `maintenance_strategy_v2_service.py` | Failure-mode strategy endpoints |
| `decision_engine_evaluators.py` | `decision_engine.py` | Rule evaluators |
| `decision_engine_suggestions.py` | `decision_engine.py` | Suggestion workflow |
| `ai_risk_dashboard.py` | `ai_risk_service.py` | Dashboard intent + injection guard |
| `ai_risk_analysis.py` | `ai_risk_service.py` | Threat risk, causes, diagrams |
| `task_service_templates.py` | `task_service.py` | Template CRUD |
| `task_service_plans.py` | `task_service.py` | Plan CRUD |
| `threat_helpers.py` / `threat_crud.py` / `threat_links.py` | `threat_service.py` | Threat domain split |
| `work_item_filters.py` / `work_item_serializers.py` | `work_item_query.py` | Work item query split |
| `maintenance_program_routes_*.py` (4 modules) | `maintenance_program_routes_service.py` | Program route sections |
| `intelligence_map_helpers.py` / `intelligence_map_stats.py` | `intelligence_map_routes_service.py` | Map stats split |
| `investigation_*.py` (4 modules) | `investigation_service.py` | Investigation domain |
| `executive_dashboard_*.py` (3 modules) | `executive_dashboard_service.py` | Dashboard read models |
| `failure_modes_*.py` (4 modules) | `failure_modes_routes_service.py` | FM routes split |
| `observation_workspace_*.py` (3 modules) | `observation_workspace_service.py` | Workspace split |
| `equipment_import_*.py` (3 modules) | `equipment_import_service.py` | Import formats |
| `process_import_*.py` (2 modules) | `process_import_service.py` | Vision + constants |
| `maintenance_scheduler_*.py` (5 modules) | `maintenance_scheduler_sync.py` | Scheduler sync split |
| `reliability_graph_*.py` (3 modules) | `reliability_graph.py` | Graph ownership split |
| `production_dashboard_*.py` (3 modules) | `production_dashboard_service.py` | Production dashboard |
| `ril_*.py` (5 modules) | `ril_service.py` | RIL domain sections |
| `pm_import/pm_import_*.py` (3 modules) | `pm_import/ai_review.py` | PM import AI review |

---

## Workstream 5 — AI platform

**Objective:** Unified AI platform for every AI capability.

```
Provider Layer → Prompt Registry → Context Builder → Evidence Builder
  → Prompt Execution → Output Validation → Human Approval → Audit Trail
```

| Task | Status |
|------|--------|
| Centralize prompts | **Done** — `ai_prompt_registry.py` (56 prompts) |
| Standardize context/evidence building | **Started** — `ai_context_builder.py` + `ai_evidence_pack.py` |
| Provider abstraction | **Done** — `ai_gateway.py` (transport) |
| Unified execution entry point | **Done** — `execute_prompt`, `execute_json_prompt`, `execute_vision_json_prompt`, `execute_multimodal_json_prompt`, `execute_grounded_prompt` |
| Output validation | **Done** — `ai_output_validation.py` |
| Prompt versioning | **Open** — registry versions only (no DB yet) |
| Token efficiency / AI logging | **Partial** — `ai_cost_guard` |
| Migrate application callers | **Done** — routes, FM, risk, vision, import, chat |

**Docs:** [`AI_PLATFORM.md`](./AI_PLATFORM.md)

**Definition of done:** Every AI feature uses the same platform entry points — **met** (Whisper remains on gateway transport by design).

---

## Workstream 6 — Executive read models

**Objective:** Separate operational writes from analytical reads.

**Read models needed:** Executive Dashboard · Lifecycle Exposure · PM Compliance · Task Completion · Reliability KPIs · Active Threat Exposure · Critical Equipment · Visual Boards

**Status:** **Done** — registry, materializers, mutation hooks, and route-through reads complete

**Docs:** [`EXECUTIVE_READ_MODELS.md`](./EXECUTIVE_READ_MODELS.md)

| Task | Status |
|------|--------|
| Read model registry | **Done** — `architecture/read_models_registry.py` (12 entries) |
| Verification gate | **Done** — `scripts/verify_read_models_registry.py` |
| Executive KPI invalidation wiring | **Done** — `notify_dashboard_data_changed` on threat/task/action mutations |
| Executive dashboard request-path reads | **Done** — routes + visual boards read snapshots |
| Insights / analytics route-through | **Done** — `insights_summary_materializer`, `analytics_dashboard_materializer` |
| RIL executive snapshot-only warm path | **Done** — `ril_dashboard_service` reads materializer only |
| Dedicated PM compliance read model | **Planned** — embedded in executive dashboard exposure |

**Definition of done:** Executive dashboards read only from optimized read models ✓

---

## Workstream 7 — Graph performance

**Objective:** Optimize only where measurements show need.

**Benchmarks:** 100 · 1,000 · 10,000 · 100,000 assets

**Metrics:** BFS latency · query count · node/edge count · memory · AI traversal latency

**Status:** **Done** — benchmark harness, query instrumentation, verify gate, optimization report

**Docs:** [`GRAPH_PERFORMANCE_BENCHMARKS.md`](./GRAPH_PERFORMANCE_BENCHMARKS.md)

| Task | Status |
|------|--------|
| Benchmark harness | **Done** — `services/reliability_graph_benchmark.py` |
| CLI runner | **Done** — `scripts/benchmark_reliability_graph.py` |
| Query instrumentation | **Done** — context-scoped counter in `reliability_graph_core.py` |
| Verify gate | **Done** — `scripts/verify_graph_performance_benchmarks.py` |
| Optimization report | **Done** — documented in `GRAPH_PERFORMANCE_BENCHMARKS.md` |

**Definition of done:** Performance benchmark report · optimization report ✓

---

## Workstream 8 — Platform standards

**Objective:** Engineering standards enforced by CI.

**Covers:** Max service/component size · folder structure · naming · API/graph/event conventions · query keys · tenant helpers · AI entry points · error handling · logging · testing

**Status:** **Done** — unified standards doc + `verify_platform_standards.py` CI gate

**Docs:** [`PLATFORM_STANDARDS.md`](./PLATFORM_STANDARDS.md)

| Task | Status |
|------|--------|
| Standards documentation | **Done** — `docs/platform/PLATFORM_STANDARDS.md` |
| Shared check module | **Done** — `architecture/platform_standards.py` |
| Service LOC gate | **Done** — 800 LOC + allowlist (WS4 baseline) |
| Tenant ratio gate | **Done** — baseline grandfathering, fail on new risks |
| AI entry point gate | **Done** — wraps `ai_entry_point_report.py` |
| Layer boundary gate | **Done** — services must not import routes |
| CI integration | **Done** — `.github/workflows/backend-tests.yml` |

**Definition of done:** Standards documented · CI validates new code ✓

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
