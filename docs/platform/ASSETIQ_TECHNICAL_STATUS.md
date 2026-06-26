# ASSETIQ TECHNICAL STATUS

**Version:** 2026-06-26  
**Repository:** AssetIQ-Dev  
**Branch / commit assessed:** `deploy-uat` @ `a8c4d432`  
**Environment assessed:** Local verification on current branch; live UAT Atlas **not connected** in this run (no `MONGO_URL` to `assetiq-UAT` available in assessment environment)

**Purpose:** Single source of truth reconciling the technical due diligence report, `PHASE1_EXECUTION.md`, Platform 1.0 documents, and executable verification scripts.

**Assessment method:** Run or inspect verification scripts listed below. Do not treat narrative “Done” checkboxes in older docs as proof unless backed by a script exit code or test run on the target environment.

---

## 1. Executive Summary

### What is verified as passing (code / CI gates, this commit)

- **Tenant service filter heuristic audit** — 0 flagged services (151 scanned)
- **Platform standards gate (WS8)** — 4/4 gates pass (service LOC, tenant filters, AI entry points, service→route boundary)
- **AI entry point report** — 0 new OpenAI import violations
- **Canonical data models (WS3)** — 13 domains registered
- **Executive read models registry (WS6)** — 12 read models, gate pass
- **Graph performance benchmark gate (WS7)** — harness/module checks pass (micro-benchmark skipped without Mongo)
- **Architecture convergence tests** — 74/74 pass when `MONGO_URL` is set (`tests/test_architecture_convergence.py`)
- **Platform standards tests** — 5/5 pass (`tests/test_platform_standards.py`)
- **Frontend import lint** — pass (`scripts/check_frontend_imports.sh`)
- **Frontend production build** — pass (`npm run build`, CI=true)
- **Route auth inventory** — 741 handlers inventoried (514 permission, 196 authenticated, 26 public)
- **Server import / startup** — pass after `a8c4d432` (AI circular import fix)

### What is still open or failing

- **Live UAT database integrity** — **NOT TESTED** in this assessment (requires UAT Mongo credentials). Last detailed written state in `PHASE1_EXECUTION.md` Workstreams A–D still lists open items (unbridged scheduled tasks, action mirror gaps, FM library gap, gate failures). The **success criteria table at the top of the same file contradicts those workstreams** — treat Workstreams A–D as the operational checklist until a fresh UAT run proves otherwise.
- **`verify_reliability_graph_sync.py`** — **FAIL** (exit 2) on static checks at `a8c4d432` — ownership/upsert allowlist not updated after graph module splits; reactive sync hooks flagged missing in `threat_service` / `investigation_service`.
- **Phase 1 full report on UAT data** — **NOT TESTED** live; cannot confirm or deny 248 unbridged tasks / 144 missing FMs without UAT DB access.
- **Production strict mode / prod tenant backfill** — **Not done** (explicitly deferred in Platform 1.0).
- **48h UAT soak** — **Not done** (deferred).
- **SOC 2 / ISO 27001 / NIS2 certification** — **Not complete** (gap assessments only).
- **Frontend unit test coverage** — **12 test files** vs ~578 source files (~2%).
- **Auth matrix tests** — **7 failures** on current branch (test assertions lag WS5 AI platform migration — e.g. copilot uses `ai_platform`, tests still expect `ai_gateway` strings).

### Readiness statements (honest)

| Question | Answer |
|----------|--------|
| **Safe for UAT pilot use (single tenant, Tyromer)?** | **Yes, with caveats** — pilot has been running; code gates pass; data-integrity and graph-sync gates on **live UAT** must be re-run after any scheduler/graph change. Do not assume Phase 1 DB checks pass without a fresh report. |
| **Production-ready?** | **No** — production tenant backfill, strict mode, soak, and prod ops checklist are explicitly deferred. JWT must not use default secret in any deployed environment. |
| **Enterprise-ready?** | **No** — SOC2/NIS2 not certified; multi-tenant proven only for one pilot tenant; horizontal scale requires Redis + external workers. |

---

## 2. Verified Current Status

Legend: **PASS** / **FAIL** / **PARTIAL** / **NOT TESTED**

| Item | Status | Evidence | Notes |
|------|--------|----------|-------|
| Tenant service filter audit | **PASS** | `python3 scripts/tenant_service_filter_audit.py` → 0 flagged, 151 clean; commit `503a77e3` | Heuristic (≥3 reads, tenant-helper ratio). Not a substitute for live cross-tenant penetration test. |
| Platform standards (WS8) | **PASS** | `python3 scripts/verify_platform_standards.py` → 4/4 OK | CI step in `.github/workflows/backend-tests.yml` |
| AI entry point report | **PASS** | `python3 scripts/ai_entry_point_report.py` → 0 new violations, 21 gateway users | |
| Canonical data models (WS3) | **PASS** | `python3 scripts/verify_canonical_models.py` → 13 domains | |
| Read models registry (WS6) | **PASS** | `python3 scripts/verify_read_models_registry.py` → 12 models | `pm_compliance` still planned |
| Graph performance gate (WS7) | **PARTIAL** | `python3 scripts/verify_graph_performance_benchmarks.py` → OK; SKIP micro benchmark without Mongo | Full benchmark needs Mongo + synthetic data |
| Architecture convergence tests | **PASS** | `MONGO_URL=... pytest tests/test_architecture_convergence.py` → 74 passed @ `a8c4d432` | Requires `MONGO_URL` set (import-time); does not require live Mongo for these tests |
| Platform standards tests | **PASS** | `pytest tests/test_platform_standards.py` → 5 passed | |
| Route auth inventory | **PASS** | `python3 scripts/route_auth_inventory.py` → 741 handlers, 26 public | Public routes include auth, GDPR ToS, VMB/display tokens — review list in script output |
| Frontend import lint | **PASS** | `bash scripts/check_frontend_imports.sh` | CI gate |
| Frontend production build | **PASS** | `cd frontend && CI=true npm run build` → exit 0 @ local run 2026-06-26 | |
| Server startup / route load | **PASS** | `MONGO_URL=... python3 -c "from server import app"` → OK @ `a8c4d432` | Fixed circular import in `a8c4d432` |
| UAT data integrity (full) | **NOT TESTED** | `scripts/phase1_data_integrity_report.py` | Requires live Mongo (`assetiq-UAT`). Local run without Mongo: connection refused. |
| Scheduled Task → Task Instance bridge (live data) | **NOT TESTED** | Section 1A in `phase1_data_integrity_report.py` | Last **documented** UAT state in `PHASE1_EXECUTION.md` A1: **Open** (248 unbridged). Success criteria in same file claims **Done** — contradiction. |
| Action convergence (live data) | **NOT TESTED** | Section 1C in phase1 report | Last documented UAT: **Open** (8 unmigrated `action_items`) |
| Maintenance Program V2 coverage (live data) | **NOT TESTED** | `verify_v2_program_coverage.py` via `verify_uat_gates.py` | Last documented UAT: **FAIL** (3 legacy-only equipment) |
| Failure Mode library sync (live data) | **NOT TESTED** | Section 1D in phase1 report | Last documented UAT: **Open** (144 static IDs missing in Mongo) |
| Reliability graph sync gate | **FAIL** | `MONGO_URL=... python3 scripts/verify_reliability_graph_sync.py` → exit **2** @ `a8c4d432` | Static failures: unapproved `upsert_edge` in `reliability_graph_core.py`, `_entities.py`, `_strategy.py`; missing `sync_threat_edges` / investigation sync hooks per script expectations |
| verify_uat_gates wrapper | **NOT TESTED** (live) | `scripts/verify_uat_gates.py` | Bundles schedule drift + v2 coverage + graph sync. CI runs against ephemeral Mongo after bootstrap — not UAT Atlas. |
| Backend full test suite | **NOT TESTED** (local full run) | CI: `pytest tests/` with Mongo service | Not re-run locally (no Mongo daemon). CI workflow expects green on push. |
| Auth matrix tests | **PARTIAL** | `pytest tests/test_auth_matrix.py` → 54 passed, **7 failed** @ `a8c4d432` | Failures are stale test expectations (AI gateway strings), not necessarily runtime auth bugs |
| Frontend unit tests | **PARTIAL** | 12 test files under `frontend/src` | No CI gate enforcing coverage |
| Phase 2 tenancy report (UAT) | **NOT TESTED** | `scripts/phase2_tenancy_report.py` | Requires UAT Mongo |
| Strict mode cutover (UAT) | **NOT TESTED** | `scripts/strict_mode_cutover_check.py` | Phase 0 report: ready on UAT after backfill; not re-run here |

### Commands used for this assessment (reproducible)

```bash
# Branch
git rev-parse HEAD   # a8c4d432247510e533f7022502c8c6f65fd10eb8

# No Mongo required
cd backend && python3 scripts/tenant_service_filter_audit.py
cd backend && python3 scripts/verify_platform_standards.py
cd backend && python3 scripts/ai_entry_point_report.py
cd backend && python3 scripts/verify_canonical_models.py
cd backend && python3 scripts/verify_read_models_registry.py
cd backend && python3 scripts/verify_graph_performance_benchmarks.py
cd backend && python3 scripts/route_auth_inventory.py
bash scripts/check_frontend_imports.sh
cd frontend && CI=true GENERATE_SOURCEMAP=false npm run build

# Requires MONGO_URL (import / some DB samples)
cd backend && MONGO_URL=mongodb://localhost:27017/test DB_NAME=test JWT_SECRET_KEY=test-secret \
  python3 -m pytest tests/test_architecture_convergence.py tests/test_platform_standards.py -q
cd backend && MONGO_URL=mongodb://localhost:27017/test DB_NAME=test JWT_SECRET_KEY=test-secret \
  python3 scripts/verify_reliability_graph_sync.py

# Requires live UAT Atlas (not run in this assessment)
cd backend && MONGO_URL=... DB_NAME=assetiq-UAT ENVIRONMENT=uat \
  WORK_ITEMS_SOURCE=v2_instances TENANT_STRICT_MODE=true \
  python3 scripts/phase1_data_integrity_report.py
cd backend && MONGO_URL=... DB_NAME=assetiq-UAT python3 scripts/verify_uat_gates.py
```

---

## 3. Historical Issues Already Fixed

Issues that appeared in older reports or Phase 1 docs but are **verified fixed in code** or **superseded** at `a8c4d432`.

| Original problem | Fix | Verification evidence |
|------------------|-----|------------------------|
| 35+ services flagged by tenant heuristic audit | WS1 maintenance/form/intelligence scoping + zero baseline | `tenant_service_filter_audit.py` → 0 flagged; commit `503a77e3`; `TENANT_FILTER_FLAGGED_BASELINE` empty |
| Maintenance scheduler/program unscoped reads | `maintenance_tenant_scope.py`, `maintenance_scoped_job/tenant` | Included in `503a77e3`; audit clean |
| Grandfathered 7 maintenance modules in tenant baseline | Baseline cleared | `platform_standards_allowlists.py`; CI tenant gate strict |
| AI platform circular import blocking server/CI | Prompts moved to `ai_fm_prompts.py`; lazy `execute_json_prompt` | Commit `a8c4d432`; `from server import app` OK |
| `reliability_edges` missing `tenant_id` on UAT | Backfill script applied on UAT | `PHASE1_EXECUTION.md` B2: 14,350/14,350 — **historical UAT ops report**, not re-run 2026-06-26 |
| Unsafe public template/download routes (Phase 0) | Auth/permission added to 8 routes | `PHASE_0_STABILIZATION_REPORT.md`; route inventory shows intentional public set only |
| Direct OpenAI imports outside gateway | WS5 migration + CI gate | `ai_entry_point_report.py` → 0 new violations |
| Service modules >800 LOC (unallowlisted) | WS4 splits + allowlist | `verify_platform_standards.py` service_module_size OK |
| WS8 missing unified CI gate | `verify_platform_standards.py` in backend-tests.yml | `.github/workflows/backend-tests.yml` |
| CI bootstrap ImportError (`execute_json_prompt`) | Same as circular import fix | `a8c4d432` |

### Not confirmed fixed (do not list as historical fixes)

These were reported in Phase 1 / due diligence but **cannot be marked fixed** without a fresh UAT `phase1_data_integrity_report.py` exit 0:

- 248 unbridged open `scheduled_tasks`
- 8 `action_items` missing `central_actions` mirror
- 144 failure modes missing from Mongo vs static library
- 3 equipment legacy-only maintenance programs
- UAT graph sync **DB sample** gaps

---

## 4. Current Remaining Risks

Only risks **still true** at `a8c4d432`. Fixed items from §3 are excluded.

### Critical

| Risk | Why it matters |
|------|----------------|
| **Live UAT data integrity unverified in this cycle** | Platform 1.0 docs claim gates pass; Phase 1 workstreams A–D still document failures. Planned Work visibility and graph materialization may drift without periodic reports. |
| **`verify_reliability_graph_sync.py` static FAIL** | Graph ownership gate fails on current code layout — reactive chain sync expectations not met; upsert allowlist stale after module splits. |
| **Production strict mode / prod tenant backfill not done** | Single-tenant pilot (`Tyromer`) does not prove multi-customer isolation in production. |
| **JWT default secret if env misconfigured** | `database.py` falls back to insecure default when `JWT_SECRET_KEY` unset and `REQUIRE_JWT_SECRET_KEY` false. |

### High

| Risk | Why it matters |
|------|----------------|
| **48h UAT soak skipped** | Regressions under real usage not formally signed off. |
| **Redis not required in default config** | In-memory cache, rate limits, AI cost guard do not distribute across API replicas. |
| **External outbox/scheduler workers not mandatory in code** | Default in-process workers risk duplicate processing when scaling replicas. |
| **Single proven tenant** | Enterprise and DD narratives require tenant #2+ with automated cross-tenant tests. |
| **Frontend test desert (12 files)** | UI regressions rely on manual QA and E2E; high god-component count (~2,500 LOC files). |
| **Auth matrix test drift (7 failures)** | CI may pass full suite while auth/AI tests desync from WS5 — undermines “61 auth tests green” claim unless full suite run. |
| **R2 missing on UAT for AI scan photos** | Documented open in Phase 1 E — 503/storage errors for scan media. |

### Medium

| Risk | Why it matters |
|------|----------------|
| **SOC 2 / ISO 27001 / NIS2 not complete** | Blocks regulated enterprise and acquisition diligence. |
| **OpenAI-only AI stack** | Provider lock-in; copilot/risk paths not multi-model. |
| **Repository pattern ~3% adopted** | 150+ services use `db` directly — tenant discipline relies on helpers + CI heuristic. |
| **Route god files (2,000+ LOC)** | `ai_fm_suggestions.py`, `labels.py` — change risk and review cost. |
| **Dual store observations/threats** | Permanent complexity; edge-case integrity risk. |
| **Lifecycle outbox events without handlers** | Orphan events can dead-letter under load. |
| **Documentation contradictions** | `PHASE1_EXECUTION.md` and `PLATFORM_1_0_EXECUTION.md` disagree on UAT gate status — causes wrong prioritization. |

### Low

| Risk | Why it matters |
|------|----------------|
| **No CMMS/EAM/ERP connector framework** | Integration-led deals require custom work. |
| **Decision Engine UI stub** | Backend exists; product surface missing. |
| **CRA frontend toolchain** | Unmaintained; migration to Vite deferred. |
| **Legacy `work_order` timeline event type** | Domain terminology leakage in API/events. |

---

## 5. Production Readiness

| Area | Status |
|------|--------|
| **UAT pilot** | **Operational** for single-tenant design partner use. Re-run `phase1_data_integrity_report.py` and `verify_uat_gates.py` on UAT Atlas after material scheduler/graph changes. |
| **Production** | **Not ready** for strict multi-tenant production. Prod backfill waves, strict mode, and production smoke checklist are **pending / deferred**. |
| **Before production strict mode** | (1) Prod tenant backfill all wave collections, (2) `REQUIRE_JWT_SECRET_KEY=true`, (3) Redis + external workers, (4) Phase 1 integrity report exit 0 on prod-like data, (5) Pen test / upload validation, (6) Audit log retention policy, (7) 48h soak on UAT with strict mode. |
| **Safe to defer (explicit Platform 1.0)** | Neo4j, K8s, microservices, plugin marketplace, multi-region, production rollout, UAT 48h soak, production strict mode, Redis clustering. |

---

## 6. Enterprise Readiness

**Overall enterprise readiness: 4 / 10** (pilot-grade industrial SaaS, not certified enterprise platform)

| Segment | Score | Rationale |
|---------|------:|-----------|
| **Pilot readiness** (single plant, design partner) | **7 / 10** | Feature depth, RBAC, GDPR code paths, Tyromer UAT footprint |
| **Mid-market readiness** (multi-site, 2–5 tenants) | **5 / 10** | Architecture exists; second tenant and data-integrity automation not proven |
| **Regulated enterprise** (energy, SOC2, NIS2) | **3 / 10** | Gap assessments only; pen test open; NIS2 not documented |
| **Acquisition due diligence readiness** | **4 / 10** | Strong CI/governance story; contradictions in docs, graph gate fail, frontend debt, single tenant |

---

## 7. Platform 1.0 Status

Platform 1.0 is **not fully complete** per its own unchecked success criteria (“every backend service tenant safe”, “every domain canonical”, “graph one owner per relationship” in production data).

| Workstream | Status | Notes |
|------------|--------|-------|
| **WS1 — Tenant convergence** | **PARTIAL** | Heuristic audit **PASS** (0 flagged). Export paths not re-audited. Live multi-tenant proof **pending**. Success criterion “every service tenant safe” still **unchecked** in `PLATFORM_1_0_EXECUTION.md`. |
| **WS2 — Reliability graph foundation** | **PARTIAL** | Ownership matrix + docs **done**. `verify_reliability_graph_sync.py` **FAIL** static @ `a8c4d432`. Reactive chain immature (~22% in graph implementation plan). |
| **WS3 — Canonical data models** | **COMPLETE** (code gate) | `verify_canonical_models.py` pass; legacy paths remain flag-gated. |
| **WS4 — Large-file modularization** | **PARTIAL** | **Services** ≤800 LOC enforced (with allowlist). **Routes** still have 900–2,000+ LOC files. Frontend god pages largely unsplit. |
| **WS5 — AI platform** | **PARTIAL** | Registry + `ai_platform` + CI gate **done**. `build_ai_context` / `execute_grounded_prompt` unused in production paths. OpenAI-only. |
| **WS6 — Executive read models** | **COMPLETE** (code gate) | Registry + materializers + route-through reads; verify gate pass. |
| **WS7 — Graph performance** | **COMPLETE** (harness) | Benchmark harness + verify gate; production fleet not validated. |
| **WS8 — Platform standards** | **COMPLETE** | Doc + `verify_platform_standards.py` in CI. |
| **Phase 1 UAT data convergence** | **PARTIAL / NOT VERIFIED** | Do **not** mark complete until live UAT `phase1_data_integrity_report.py` and `verify_uat_gates.py` exit 0. |
| **Production rollout** | **DEFERRED** | Explicit out of scope. |
| **48h UAT soak** | **DEFERRED** | Explicit out of scope. |

---

## 8. Corrected Technical Maturity Score

Scores reflect **verified facts at `a8c4d432`**, not aspirational Platform 1.0 checkboxes. Scale 1–10; 7 ≈ mature enterprise SaaS.

| Dimension | Score | Basis |
|-----------|------:|-------|
| Architecture | **5.5** | Strong CI/registries; weak physical layering (routes/repositories); service locator |
| Scalability | **4.0** | Monolith + in-process cache/WS/workers |
| Performance | **5.0** | Read models help; frontend god components; no list virtualization at scale |
| Maintainability | **4.5** | WS4 services split; routes/frontend god files remain |
| Enterprise readiness | **4.0** | §6 |
| AI architecture | **5.5** | Unified platform; OpenAI lock-in; dead orchestrator paths |
| Code quality | **4.5** | Backend tests strong; frontend 2% unit test files |
| Developer experience | **5.0** | Good scripts/gates; doc contradictions hurt onboarding |
| Technical debt | **3.5** | (lower = more debt) |
| Moat (industrial domain) | **5.5** | Real FMEA/strategy/ALARP depth; single tenant; graph immature |
| **Overall technical maturity** | **5.0 / 10** | Credible pilot platform; not enterprise-certified |

---

## 9. Recommended Next Work

Production soak and production rollout are **intentionally skipped for now**. Recommended order:

1. **Fix documentation contradictions** — This document replaces conflicting gate claims; update `PHASE1_EXECUTION.md` success criteria vs Workstreams A–D; align `PLATFORM_1_0_EXECUTION.md` gate row with script results.
2. **Re-run UAT verification scripts on live Atlas** — `phase1_data_integrity_report.py`, `verify_uat_gates.py`; publish exit codes and counts in this file’s §2.
3. **Fix `verify_reliability_graph_sync.py` static failures** — Update `APPROVED_UPSERT_MODULES` for graph split modules; wire or document reactive sync hooks.
4. **Complete tenant hardening beyond maintenance** — `phase2_tenancy_report.py` on UAT; cross-tenant regression tests with tenant #2.
5. **Canonical data model documentation** — Keep `CANONICAL_DATA_MODELS.md` synced with registry (gate already passes).
6. **Reliability graph ownership + lifecycle documentation** — Align `RELIABILITY_GRAPH_ARCHITECTURE.md` with passing sync gate.
7. **Break down top god files** — Frontend: `MaintenanceStrategyManager.jsx`, `CausalEnginePageMain.jsx`, `DashboardPageMain.jsx`; Backend routes: `ai_fm_suggestions.py`, `labels.py`.
8. **AI platform consolidation** — Wire grounded orchestrator or remove dead paths; fix auth matrix tests for `ai_platform`; async OpenAI client.
9. **Read models** — WS6 code complete; extend PM compliance from planned → active when product needs it.
10. **Graph performance benchmarks** — Run harness against UAT-scale or synthetic 10k assets; store report under `reports/graph_benchmarks/`.

---

## 10. Documents to Update or Retire

| Document | Action | Reason |
|----------|--------|--------|
| **`docs/platform/ASSETIQ_TECHNICAL_STATUS.md`** (this file) | **Maintain** | Single source of truth; refresh after each UAT gate run |
| **`docs/platform/PHASE1_EXECUTION.md`** | **Update** | Internal contradiction: success criteria “Done (UAT)” vs Workstreams A–D “Open/Fail” |
| **`docs/platform/PLATFORM_1_0_EXECUTION.md`** | **Update** | Claims UAT verification pass; graph sync pass — conflicts with `verify_reliability_graph_sync.py` FAIL @ `a8c4d432` and unverified live UAT DB |
| **`docs/platform/PLATFORM_1_0_EXECUTION.md`** gate line | **Remove/replace claim** | “Phase 1 UAT convergence complete” until live scripts exit 0 |
| **`docs/platform/PHASE_0_STABILIZATION_REPORT.md`** | **Archive reference** | Historical Phase 0; keep but point readers to this status doc for current state |
| **`backend/REFACTORING.md`** | **Update or archive** | Stale server.py LOC claims |
| **Due diligence / audit chat outputs** | **Replace with this doc** | Not version-controlled; contradictions |
| **`docs/compliance/SOC2_GAP_ASSESSMENT.md`** | **Update** | Still valid gaps; add pointer to §6 here |
| **`docs/platform/RELIABILITY_KNOWLEDGE_GRAPH_IMPLEMENTATION_PLAN.md`** | **Keep** | 22% maturity score still honest; use alongside §2 graph sync FAIL |

### Claims to remove from old documents (unless re-verified)

- “Phase 1 verification scripts all OK on UAT” — **unverified** in this cycle; Phase 1 workstreams document failures.
- “Platform 1.0 gate: Phase 1 UAT convergence complete” — **premature** while production soak/strict mode deferred and live DB reports not attached.
- “Reliability graph sync pass on UAT” — **false for current code** until `verify_reliability_graph_sync.py` exit 0 (static section currently fails).
- “35 flagged tenant services” — **obsolete**; audit is 0 flagged at `503a77e3+`.
- “Every backend service tenant safe” Platform 1.0 checkbox — keep **unchecked** until phase2 tenancy + multi-tenant proof.

---

## References

- Executable gates: `backend/scripts/`
- CI: `.github/workflows/backend-tests.yml`, `.github/workflows/frontend-ci.yml`
- Commits cited: `503a77e3` (WS1 tenant audit), `a8c4d432` (AI import fix)
- Prior assessments: technical due diligence (2026-06), `PHASE1_EXECUTION.md`, `PLATFORM_1_0_EXECUTION.md`

---

*Next update trigger: after any push to `uat/main` that touches scheduler, graph, tenant scope, or after a scheduled UAT gate run with live `MONGO_URL`.*
