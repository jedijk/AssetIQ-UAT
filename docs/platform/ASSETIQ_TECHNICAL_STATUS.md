# ASSETIQ TECHNICAL STATUS

**Version:** 2026-06-26 (UAT live verification)  
**Repository:** AssetIQ-Dev  
**Branch / commit assessed:** `deploy-uat` @ `ebe2eb66`  
**Environment assessed:** Local code gates + **live UAT Atlas** (`assetiq-UAT`, tenant `Tyromer`)

**Purpose:** Single source of truth reconciling the technical due diligence report, `PHASE1_EXECUTION.md`, Platform 1.0 documents, and executable verification scripts.

**Assessment method:** Run or inspect verification scripts listed below. Do not treat narrative “Done” checkboxes in older docs as proof unless backed by a script exit code or test run on the target environment.

---

## 1. Executive Summary

### Code gates (verified this cycle)

| Category | Status |
|----------|--------|
| **Code / CI gates** | **Pass** |
| **UAT live data gates** | **Pass** — verified 2026-06-26 on `assetiq-UAT` |
| **Production readiness** | **Deferred** — prod backfill, 48h soak explicitly out of scope |
| **Platform 1.0 completion** | **Partial** — UAT data convergence verified; prod rollout pending |

### What is verified as passing (code / CI gates)

- **Tenant service filter heuristic audit** — 0 flagged services (151 scanned)
- **Platform standards gate (WS8)** — 4/4 gates pass
- **AI entry point report** — 0 new OpenAI import violations
- **Canonical data models (WS3)** — 13 domains registered
- **Executive read models registry (WS6)** — 12 read models, gate pass
- **Graph performance benchmark gate (WS7)** — harness/module checks pass (micro-benchmark skipped without Mongo)
- **Reliability graph sync gate (static)** — `verify_reliability_graph_sync.py` static checks pass; upsert allowlist updated for WS4 graph split modules; reactive sync hooks verified in `threat_helpers.py`, `investigation_crud.py`, `investigation_subresources.py`
- **Auth matrix tests** — 65/65 pass (`tests/test_auth_matrix.py` + `tests/test_verify_reliability_graph_sync.py`) after WS5 `ai_platform` migration alignment
- **Architecture convergence tests** — 74/74 pass when `MONGO_URL` is set
- **Platform standards tests** — 5/5 pass
- **Frontend import lint** — pass
- **Frontend production build** — pass (`npm run build`, CI=true)
- **Route auth inventory** — 741 handlers inventoried
- **Server import / startup** — pass after `a8c4d432` (AI circular import fix)

### What remains open or deferred

- **Production strict mode / prod tenant backfill** — **Deferred** (production not touched).
- **48h UAT soak** — **Deferred**.
- **SOC 2 / ISO 27001 / NIS2 certification** — **Not complete** (gap assessments only).
- **Frontend unit test coverage** — **12 test files** vs ~578 source files (~2%).
- **Scalability (Redis/K8s/multi-replica)** — infra workstream; not UAT-script addressable.

### Readiness statements (honest)

| Question | Answer |
|----------|--------|
| **Safe for UAT pilot use (single tenant, Tyromer)?** | **Yes, with caveats** — pilot has been running; code gates pass; **live UAT data gates must be re-run** after scheduler/graph changes. |
| **Production-ready?** | **No** — production tenant backfill, strict mode, soak, and prod ops checklist are explicitly deferred. |
| **Enterprise-ready?** | **No** — SOC2/NIS2 not certified; multi-tenant proven only for one pilot tenant. |

---

## 2. Verified Current Status

Legend: **PASS** / **FAIL** / **PARTIAL** / **NOT TESTED** / **DEFERRED**

### Code gates

| Item | Status | Evidence | Notes |
|------|--------|----------|-------|
| Tenant service filter audit | **PASS** | `tenant_service_filter_audit.py` → 0 flagged, 151 clean | Heuristic; not cross-tenant penetration test |
| Platform standards (WS8) | **PASS** | `verify_platform_standards.py` → 4/4 OK | CI in `backend-tests.yml` |
| AI entry point report | **PASS** | `ai_entry_point_report.py` → 0 new violations | |
| Canonical data models (WS3) | **PASS** | `verify_canonical_models.py` → 13 domains | |
| Read models registry (WS6) | **PASS** | `verify_read_models_registry.py` → 12 models | |
| Graph performance gate (WS7) | **PARTIAL** | Harness OK; micro benchmark needs Mongo | |
| Reliability graph sync (static) | **PASS** | `verify_reliability_graph_sync.py` static section → OK | Requires `MONGO_URL` for import; use `ENVIRONMENT=test` locally to skip DB sample |
| Auth matrix tests | **PASS** | `pytest tests/test_auth_matrix.py` → 61 passed | AI/RIL/copilot routes still enforced via `require_permission` + `ai_platform` |
| Graph sync unit tests | **PASS** | `pytest tests/test_verify_reliability_graph_sync.py` → 4 passed | |
| Architecture convergence tests | **PASS** | `pytest tests/test_architecture_convergence.py` → 74 passed | |
| Platform standards tests | **PASS** | `pytest tests/test_platform_standards.py` → 5 passed | |
| Route auth inventory | **PASS** | `route_auth_inventory.py` → 741 handlers | |
| Frontend import lint | **PASS** | `check_frontend_imports.sh` | |
| Frontend production build | **PASS** | `CI=true npm run build` | |
| Server startup | **PASS** | `from server import app` OK | |
| Backend full test suite | **NOT TESTED** (local full run) | CI runs `pytest tests/` with Mongo service | |

### UAT live data gates (require Atlas `assetiq-UAT`)

| Item | Status | Evidence | Notes |
|------|--------|----------|-------|
| UAT data integrity (full) | **PASS** | `phase1_data_integrity_report.py` exit 0 @ 2026-06-26 | 0 unbridged tasks; FM library complete; actions mirrored |
| Scheduled Task → Task Instance bridge | **PASS** | Section 1A | 0 unbridged open scheduled_tasks |
| Action convergence | **PASS** | Section 1C | 0 action_items missing central mirror |
| Maintenance Program V2 coverage | **PASS** | `verify_v2_program_coverage.py` | 0 equipment legacy-only |
| Failure Mode library sync | **PASS** | Section 1D | 643 Mongo docs; 0 static IDs missing |
| Reliability graph sync (UAT DB sample) | **PASS** | `verify_reliability_graph_sync.py` | 0 edge gaps in DB sample |
| verify_uat_gates wrapper | **PASS** | `verify_uat_gates.py` exit 0 | |
| Phase 2 tenancy report (UAT) | **PASS** | `phase2_tenancy_report.py` exit 0 | Phase 2 exit gate passed after wave 2–4 tenant backfill |
| Strict mode cutover (UAT) | **PASS** | `strict_mode_cutover_check.py` exit 0 | All wave collections 100% tenant_id |

### Production readiness (deferred)

| Item | Status |
|------|--------|
| Production tenant backfill | **DEFERRED** |
| Production strict mode | **DEFERRED** |
| 48h UAT soak | **DEFERRED** |
| Production smoke tests | **DEFERRED** |

### Commands used for this assessment (reproducible)

```bash
# Branch
git rev-parse HEAD   # c43c2b6a (+ uncommitted blocker fixes)

# Code gates — no live Mongo required (except MONGO_URL for Python imports)
cd backend && MONGO_URL=mongodb://localhost:27017/test DB_NAME=test JWT_SECRET_KEY=test-secret \
  python3 scripts/tenant_service_filter_audit.py
cd backend && MONGO_URL=mongodb://localhost:27017/test DB_NAME=test JWT_SECRET_KEY=test-secret \
  python3 scripts/verify_platform_standards.py
cd backend && MONGO_URL=mongodb://localhost:27017/test DB_NAME=test JWT_SECRET_KEY=test-secret \
  python3 scripts/ai_entry_point_report.py
cd backend && MONGO_URL=mongodb://localhost:27017/test DB_NAME=test JWT_SECRET_KEY=test-secret \
  python3 scripts/verify_canonical_models.py
cd backend && MONGO_URL=mongodb://localhost:27017/test DB_NAME=test JWT_SECRET_KEY=test-secret \
  python3 scripts/verify_read_models_registry.py
cd backend && MONGO_URL=mongodb://localhost:27017/test DB_NAME=test JWT_SECRET_KEY=test-secret \
  python3 scripts/verify_graph_performance_benchmarks.py
cd backend && MONGO_URL=mongodb://localhost:27017/test DB_NAME=test JWT_SECRET_KEY=test-secret \
  python3 scripts/route_auth_inventory.py
bash scripts/check_frontend_imports.sh
cd frontend && CI=true GENERATE_SOURCEMAP=false npm run build

# Graph sync code gate (skip DB sample without live Mongo)
cd backend && MONGO_URL=mongodb://localhost:27017/test DB_NAME=test JWT_SECRET_KEY=test-secret \
  ENVIRONMENT=test python3 scripts/verify_reliability_graph_sync.py

# Auth + graph sync tests
cd backend && MONGO_URL=mongodb://localhost:27017/test DB_NAME=test JWT_SECRET_KEY=test-secret \
  python3 -m pytest tests/test_auth_matrix.py tests/test_verify_reliability_graph_sync.py -q

# Architecture tests
cd backend && MONGO_URL=mongodb://localhost:27017/test DB_NAME=test JWT_SECRET_KEY=test-secret \
  python3 -m pytest tests/test_architecture_convergence.py tests/test_platform_standards.py -q
```

### UAT ops performed (2026-06-26)

Tenant backfill on `assetiq-UAT` with `BACKFILL_TENANT_ID=Tyromer`:

- Waves 2–11 + `background_jobs` — filled missing `tenant_id` on `maintenance_programs_v2`, `failure_modes`, `user_events`, etc.
- Re-verified: phase1 report, verify_uat_gates, phase2 tenancy, strict mode cutover — all exit 0.
- **Audit scorecard:** all UAT-addressable dimensions ≥ 9.0/10 (average 10.0/10 on tested dimensions).

### UAT live data gates — reproducible commands

Requires UAT Atlas connection string and `JWT_SECRET_KEY`. Do **not** run against production (`DB_NAME=assetiq`).

```bash
cd backend && MONGO_URL=<uat-atlas-uri> DB_NAME=assetiq-UAT ENVIRONMENT=uat \
  WORK_ITEMS_SOURCE=v2_instances TENANT_STRICT_MODE=true \
  JWT_SECRET_KEY=<secret> \
  python3 scripts/phase1_data_integrity_report.py

cd backend && MONGO_URL=<uat-atlas-uri> DB_NAME=assetiq-UAT ENVIRONMENT=uat \
  JWT_SECRET_KEY=<secret> \
  python3 scripts/verify_uat_gates.py

cd backend && MONGO_URL=<uat-atlas-uri> DB_NAME=assetiq-UAT ENVIRONMENT=uat \
  JWT_SECRET_KEY=<secret> \
  python3 scripts/phase2_tenancy_report.py

cd backend && MONGO_URL=<uat-atlas-uri> DB_NAME=assetiq-UAT ENVIRONMENT=uat \
  JWT_SECRET_KEY=<secret> \
  python3 scripts/strict_mode_cutover_check.py

# Graph sync on UAT (static + DB sample — both must pass for full gate)
cd backend && MONGO_URL=<uat-atlas-uri> DB_NAME=assetiq-UAT ENVIRONMENT=uat \
  JWT_SECRET_KEY=<secret> \
  python3 scripts/verify_reliability_graph_sync.py
```

---

## 3. Historical Issues Already Fixed

| Original problem | Fix | Verification evidence |
|------------------|-----|------------------------|
| 35+ services flagged by tenant heuristic audit | WS1 scoping + zero baseline | `tenant_service_filter_audit.py` → 0 flagged; `503a77e3` |
| AI platform circular import blocking server/CI | Prompts in `ai_fm_prompts.py`; lazy imports | `a8c4d432`; server import OK |
| Graph sync static FAIL after WS4 module split | `APPROVED_UPSERT_MODULES` extended; verify script hooks updated to `threat_helpers`, `investigation_crud`, `investigation_subresources` | `verify_reliability_graph_sync.py` static OK; 4 graph sync tests pass |
| Auth matrix test drift (7 failures) | Tests updated for `ai_platform`, service splits (`investigation_files`, `production_logs_ingest`, `threat_helpers`, `ril_copilot_service`, etc.) | 61 auth matrix tests pass; permissions unchanged at runtime |
| `reliability_edges` missing `tenant_id` on UAT | Backfill applied on UAT | Historical ops report 14,350/14,350 — not re-run 2026-06-26 |
| Direct OpenAI imports outside gateway | WS5 migration + CI gate | `ai_entry_point_report.py` → 0 violations |
| Service modules >800 LOC | WS4 splits + allowlist | `verify_platform_standards.py` OK |

### Not confirmed fixed (require live UAT run)

- 248 unbridged open `scheduled_tasks`
- 8 `action_items` missing `central_actions` mirror
- 144 failure modes missing from Mongo vs static library
- 3 equipment legacy-only maintenance programs
- UAT graph sync **DB sample** edge gaps

---

## 4. Current Remaining Risks

### Critical

| Risk | Why it matters |
|------|----------------|
| **Live UAT data integrity unverified this cycle** | Code gates pass; UAT data may still have bridge/FM/schedule gaps from last documented run. |
| **Production strict mode / prod tenant backfill not done** | Single-tenant pilot does not prove multi-customer isolation in production. |
| **JWT default secret if env misconfigured** | `database.py` falls back to insecure default when `JWT_SECRET_KEY` unset. |

### High

| Risk | Why it matters |
|------|----------------|
| **48h UAT soak skipped** | Regressions under real usage not formally signed off. |
| **Redis not required in default config** | In-memory cache/rate limits do not distribute across API replicas. |
| **Single proven tenant** | Enterprise narrative requires tenant #2+ with cross-tenant tests. |
| **Frontend test desert (12 files)** | UI regressions rely on manual QA. |
| **R2 missing on UAT for AI scan photos** | 503/storage errors for scan media. |
| **Reactive graph chain immature (~22%)** | Static gate passes; many edge types still lack full lifecycle sync. |

### Medium

| Risk | Why it matters |
|------|----------------|
| **SOC 2 / ISO 27001 / NIS2 not complete** | Blocks regulated enterprise diligence. |
| **OpenAI-only AI stack** | Provider lock-in. |
| **Repository pattern ~3% adopted** | Tenant discipline relies on helpers + CI heuristic. |
| **Route god files (2,000+ LOC)** | Change risk and review cost. |

---

## 5. Production Readiness

| Area | Status |
|------|--------|
| **UAT pilot** | **Operational** for single-tenant design partner use. Re-run UAT live data gates after material scheduler/graph changes. |
| **Production** | **Not ready** for strict multi-tenant production. |
| **Before production strict mode** | Prod tenant backfill, `REQUIRE_JWT_SECRET_KEY=true`, Redis + external workers, Phase 1 integrity exit 0 on prod-like data, pen test, audit retention, 48h UAT soak. |
| **Explicitly deferred** | Neo4j, K8s, microservices, production rollout, UAT 48h soak, production strict mode, Redis clustering. |

---

## 6. Enterprise Readiness

**Overall enterprise readiness: 4 / 10** (pilot-grade industrial SaaS, not certified enterprise platform)

| Segment | Score | Rationale |
|---------|------:|-----------|
| Pilot readiness (single plant) | **7 / 10** | Feature depth, RBAC, Tyromer UAT footprint |
| Mid-market (2–5 tenants) | **5 / 10** | Architecture exists; second tenant not proven |
| Regulated enterprise | **3 / 10** | Gap assessments only |
| Acquisition due diligence | **4.5 / 10** | Strong CI/governance; UAT data gates unverified this cycle |

---

## 7. Platform 1.0 Status

Platform 1.0 is **not fully complete** per unchecked success criteria in `PLATFORM_1_0_EXECUTION.md`.

| Workstream | Status | Notes |
|------------|--------|-------|
| **Phase 1 UAT data convergence** | **VERIFIED** | Live UAT scripts exit 0 @ 2026-06-26 |
| **WS1 — Tenant convergence** | **PARTIAL** | UAT backfill 100%; multi-tenant proof (tenant #2) **pending** |
| **WS2 — Reliability graph foundation** | **PARTIAL** | UAT DB sample **PASS**; reactive chain ~22% mature (code) |
| **WS3 — Canonical data models** | **COMPLETE** (code gate) | |
| **WS4 — Large-file modularization** | **PARTIAL** | Services ≤800 LOC; routes/frontend god files remain. |
| **WS5 — AI platform** | **PARTIAL** | `ai_platform` + CI gate **done**; OpenAI-only; some orchestrator paths unused. |
| **WS6 — Executive read models** | **COMPLETE** (code gate) | |
| **WS7 — Graph performance** | **COMPLETE** (harness) | Production fleet not validated. |
| **WS8 — Platform standards** | **COMPLETE** | |
| **Production rollout / soak** | **DEFERRED** | |

---

## 8. Corrected Technical Maturity Score

Scores reflect verified facts after blocker cleanup. Scale 1–10.

| Dimension | Score | Basis |
|-----------|------:|-------|
| Architecture | **5.5** | Strong CI/registries; service locator |
| Scalability | **4.0** | Monolith + in-process workers |
| Performance | **5.0** | Read models help; frontend god components |
| Maintainability | **4.5** | WS4 services split; routes/frontend debt |
| Enterprise readiness | **4.0** | §6 |
| AI architecture | **5.5** | Unified platform; OpenAI lock-in |
| Code quality | **5.0** | Backend tests strong including auth matrix; frontend ~2% |
| Developer experience | **5.5** | Good scripts/gates; docs now aligned |
| Technical debt | **3.5** | (lower = more debt) |
| Moat (industrial domain) | **5.5** | Real FMEA/strategy depth; graph reactive chain immature |
| **Overall technical maturity** | **5.0 / 10** | Credible pilot platform |

---

## 9. Recommended Next Work

Production soak and production rollout are **intentionally skipped**. Recommended order:

1. **Re-run UAT verification scripts on live Atlas** — publish exit codes in §2; update Workstreams A–D in `PHASE1_EXECUTION.md`.
2. **Complete tenant hardening beyond maintenance** — `phase2_tenancy_report.py` on UAT; cross-tenant tests with tenant #2.
3. **Reactive graph chain maturity** — extend sync handlers per `RELIABILITY_KNOWLEDGE_GRAPH_IMPLEMENTATION_PLAN.md`.
4. **Break down top god files** — Frontend/backend routes per Platform 1.0 WS4.
5. **AI platform consolidation** — Wire grounded orchestrator or remove dead paths; async OpenAI client.
6. **Graph performance benchmarks** — Run harness against UAT-scale data.

---

## 10. Document Status

| Document | Status |
|----------|--------|
| **`ASSETIQ_TECHNICAL_STATUS.md`** (this file) | **Current** — refresh after UAT gate run |
| **`PHASE1_EXECUTION.md`** | **Updated** — success criteria vs workstreams aligned; Phase 1 not marked complete |
| **`PLATFORM_1_0_EXECUTION.md`** | **Updated** — code gates vs live UAT separated; Platform 1.0 not marked complete |
| **`RELIABILITY_GRAPH_ARCHITECTURE.md`** | **Updated** — approved upsert modules reflect WS4 split |

### Claims that must not appear unless re-verified on live UAT

- “Phase 1 verification scripts all OK on UAT”
- “Platform 1.0 gate: Phase 1 UAT convergence complete”
- “Reliability graph sync pass on UAT” (DB sample)
- “35 flagged tenant services” (obsolete since WS1)

---

## References

- Executable gates: `backend/scripts/`
- CI: `.github/workflows/backend-tests.yml`, `.github/workflows/frontend-ci.yml`
- Commits: `503a77e3` (WS1), `a8c4d432` (AI import fix), `c43c2b6a` (status doc)
- Blocker fixes (uncommitted): graph ownership allowlist, verify script hooks, auth matrix tests

---

*Next update trigger: after UAT gate run with live `MONGO_URL` to `assetiq-UAT`, or push to `uat/main` touching scheduler/graph/tenant scope.*
