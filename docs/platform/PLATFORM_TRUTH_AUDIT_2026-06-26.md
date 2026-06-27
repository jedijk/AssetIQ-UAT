# AssetIQ Platform & Product Truth Audit

**Date:** 2026-06-26  
**Repository:** AssetIQ-Dev  
**Commit assessed:** `58f82e8c` (`deploy-uat`, local; includes scheduler/VM board tenant fixes not yet re-verified on live UAT Atlas)  
**Assessment method:** Code inspection, executable verification scripts, CI gates, UAT Atlas evidence (`assetiq-UAT`, tenant `Tyromer`)  
**Companion docs:** [`ASSETIQ_TECHNICAL_STATUS.md`](./ASSETIQ_TECHNICAL_STATUS.md) (operational gates), [`PHASE1_EXECUTION.md`](./PHASE1_EXECUTION.md), [`PLATFORM_1_0_EXECUTION.md`](./PLATFORM_1_0_EXECUTION.md) — remain active until archived after the next live UAT gate run.

**Rule:** Nothing in this document is marked **Implemented** without file, script, or test evidence. Unverified items are marked **NOT VERIFIED**.

---

## 1. Executive Summary (one page)

AssetIQ is a **credible single-tenant industrial reliability pilot platform** with **deep domain features** (FMEA library, observation-to-action lifecycle, maintenance strategies/programs, executive read models, visual boards, RIL copilot) and **strong engineering governance** (13 registered domains, 12 read models, 9+ verify scripts, 1500+ backend tests, frontend lib test gate). It is **not yet a world-class enterprise multi-tenant SaaS** or a **fully authoritative reliability knowledge graph**.

### What is truly implemented (verified)

| Area | Truth |
|------|--------|
| **Reliability lifecycle (core path)** | Observation/threat → investigation → central action → strategy/program → scheduled task → task instance → form execution is implemented with services, routes, and UAT data gates passing (Phase 1 integrity exit 0 @ 2026-06-26). |
| **FMEA / failure modes** | 643 failure modes on UAT Mongo; static library sync gate pass; EFMs, RPN, recommended actions. |
| **Multi-tenant code path** | `tenant_id` backfill on UAT; strict mode cutover pass; 0 flagged services in heuristic audit; **one production tenant proven (Tyromer)**. |
| **AI platform** | Central `ai_platform` + prompt registry + cost guard; grounded orchestrator + evidence pack exist; CI blocks direct OpenAI imports. |
| **Executive intelligence** | Materialized read models (executive KPIs, dashboards, asset health) with registry gate. |
| **Engineering gates** | Platform standards, graph handler coverage, auth matrix, architecture convergence tests, frontend unit test gate (42 suites / 282 tests). |

### What is partial or overstated in marketing docs

| Area | Truth |
|------|--------|
| **Work signal (observation/threat)** | **Phase 1+2 converged:** `create_work_signal` / `update_work_signal` are the sole approved write path; same UUID in `observations` + `threats` projection; verify gate in CI/UAT. **Structural debt remains:** two collections, `/threats` UI/API, bridge module until Phases 4–6 (see [`OBSERVATION_THREAT_CONVERGENCE_PLAN.md`](./OBSERVATION_THREAT_CONVERGENCE_PLAN.md)). |
| **Knowledge graph** | Mongo `reliability_edges`; static sync gate pass; **reactive chain ~22% mature** (many transitions manual or incomplete). Graph is **not yet authoritative operational intelligence layer**. |
| **Decision Engine** | Deterministic rules + human approve/reject/execute; **not autonomous AI decisions**. |
| **Enterprise SaaS** | OIDC spike only; no SOC2/ISO27001 certification; Redis optional; single-instance workers. |
| **Integrations** | RIL reading types model SCADA/historian sources; **no verified production ERP/CMMS connectors**. |

### Strategic position

AssetIQ differentiates on **reliability-native workflow + FMEA depth + grounded AI + graph intent**, not on mature EAM breadth (Maximo/SAP) or CMMS simplicity (MaintainX/UpKeep). The moat is **domain workflow integration**; the gap is **enterprise hardening, graph completeness, and multi-tenant proof**.

### Top five leverage moves (90-day CTO view)

1. **Second tenant + cross-tenant penetration tests** — prove multi-customer isolation beyond Tyromer.  
2. **Complete reactive graph sync chain** — every lifecycle transition writes/updates edges with verify gate.  
3. **Observation/threat structural cutover (Phases 4–6)** — UI/route rename, retire bridge, graph node consolidation; Phase 1+2 write convergence **already landed**.  
4. **Production cutover package** — Redis, external workers, prod backfill, 48h soak, pen test.  
5. **Evidence-first AI contract** — every recommendation returns citations + deterministic score separation (already documented in product spec; enforce in all AI surfaces).

---

## 2. Product Surface Inventory

Legend: **I** = Implemented · **P** = Partial · **Pl** = Planned/ stub · **N** = Not implemented  
Maturity based on code + tests + UAT gates, not slide decks.

| Product surface | Business purpose | Canonical entity | Collection(s) | Canonical service / API | Maturity | Evidence | Known limitations |
|-----------------|------------------|------------------|---------------|-------------------------|----------|----------|---------------------|
| **Equipment Hierarchy** | ISO 14224 asset tree, scoping, criticality | `equipment_nodes` | `equipment_nodes`, `installations` | `equipment_search_service`, `routes/equipment/` | **I** | `domain_registry` equipment; hierarchy utils tests | Legacy level aliases; large route files |
| **Equipment Types** | Type registry, strategy linkage | `equipment_types` | `equipment_types` | `equipment_type_registry.py` | **I** | Domain registry; type-strategy routes | NOT VERIFIED: full UI coverage |
| **Failure Modes (FMEA)** | Library, RPN, recommended actions | `failure_modes` | `failure_modes`, `equipment_failure_modes` | `services/failure_modes/`, `efm_service` | **I** | UAT 643 docs; `seed_failure_modes.py`; FM tests | Static + Mongo dual source; sync gate required |
| **Observations** | Operational risk signals from field | **`observations`** (canonical write); `threats` = read projection | `observations`, `threats` | `work_signal_lifecycle`, `observation_service`, `/threats` read API | **I** (lifecycle) / **P** (surface) | `work_signal_lifecycle.py`; `verify_threat_observation_convergence.py`; Phase 1+2 landed | Writes converged; UI still `/threats`; bridge not retired (Phases 4–6) |
| **AI Risk Analysis** | Interpret observation, suggest risk | AI output + threat fields | `threats`, AI usage logs | `ai_risk_analysis.py`, `ai_platform` | **P** | `ai_platform.py`, prompt registry, cost guard | OpenAI-only; not all paths use grounded orchestrator |
| **Investigations** | Structured RCA, evidence, causes | `investigations` | `investigations`, `cause_nodes`, `evidence_items`, `timeline_events` | `investigation_crud`, `investigation_subresources` | **I** | Domain registry; graph sync hooks in crud | Legacy `action_items` mirror path |
| **Actions** | Track mitigation work | `central_actions` | `central_actions` | `action_service`, `routes/actions.py` | **I** | Phase 1 action mirror gate pass; delete cache fix | Was dual with investigation `action_items` |
| **Maintenance Strategies** | Equipment-type strategy templates | `equipment_type_strategies` | `equipment_type_strategies` | `apply_strategy_service`, strategy v2 routes | **I** | Domain registry; apply strategy tests | NOT VERIFIED: all strategy types in UI |
| **Maintenance Programs** | PM program per equipment | `maintenance_programs_v2` | `maintenance_programs_v2` | `maintenance_program_service` | **I** | `verify_v2_program_coverage.py` UAT pass | Legacy v1 paths may exist |
| **Planned Work** | Scheduled maintenance tasks | `scheduled_tasks` | `scheduled_tasks` | `maintenance_scheduling.py` | **I** | Phase 1 bridge 0 unbridged on UAT | Drift verify script exists |
| **Scheduling** | Calendar, assignment, instances | `task_instances` | `task_instances`, `task_templates` | `maintenance_scheduler_*`, `task_service` | **I** | Scheduler routes; bridge scripts | In-process scheduler scaling NOT VERIFIED |
| **Digital Forms** | Operator rounds, submissions | `form_templates`, `form_submissions` | `form_templates`, `form_submissions` | `form_service`, `routes/forms.py` | **I** | Domain registry; form tests | Form designer complexity NOT VERIFIED E2E |
| **Spares** (formerly SpareIQ) | Spare parts, requirements | `spare_parts` | `spare_parts`, `spare_categories` | `spare_parts_service`, graph sync | **P** | Domain registry; `routes/spare_parts.py`; spare tests | UI label **Spares**; route `/spareiq` unchanged; NOT VERIFIED: customer usage depth |
| **Reliability Knowledge Graph** | Traceability, impact, learning | `reliability_edges` | `reliability_edges`, `findings`, `outcomes` | `reliability_graph*.py` | **P** | Static + UAT DB sample gate pass; handler registry 10/10 entities | Reactive chain incomplete; not Neo4j |
| **Executive Dashboards** | Leadership KPIs, exposure | read models | `executive_*_snapshots` | `executive_*_materializer.py` | **I** | Read models registry 12/12; refresh jobs | Snapshot staleness depends on jobs |
| **Visual Management Boards** | Gemba / TV boards | `visual_boards` | `visual_boards`, tokens, pairings | `visual_board_service` | **I** | Domain registry; `test_visual_board_data_service.py` (13 pass) | Kiosk user had no installation scope until `58f82e8c`; re-verify on TV after deploy |
| **RIL Copilot** | NL reliability queries | RIL context + AI | `ril_*`, snapshots | `ril_copilot_service`, `ai_orchestrator` | **P** | Grounded prompt in registry; auth matrix | Tool coverage NOT VERIFIED exhaustive |
| **Decision Engine** | Closed-loop learning rules | `decision_rules`, `decision_suggestions` | `decision_rules`, `decision_suggestions` | `decision_engine.py`, routes | **P** | Evaluators + approve/reject/execute API | Rules require **human approval**; not auto-closed loop |

---

## 3. Canonical Business Entities & Duplicate Models

Source: `backend/architecture/domain_registry.py` + code search.

| Entity | Canonical collection | Owner domain | Legacy / duplicate paths | Status |
|--------|---------------------|--------------|---------------------------|--------|
| Company / tenant | `users.company_id`, `tenant_id` on collections | user_management | `organization_id` alias in some paths | **P** — strict mode on UAT |
| Installation | `installations` | equipment | Site/location aliases in labels | **I** |
| Equipment | `equipment_nodes` | equipment | — | **I** |
| Observation | **`observations`** (canonical write target) | observations / work_signal_lifecycle | `threats` = same-id read projection; `/threats` UI/API; `threat_observation_bridge` until Phase 5 | **I** (Phase 1+2) / **P** (Phases 4–6) |
| Investigation | `investigations` | investigations | — | **I** |
| Action | **`central_actions`** | actions | `investigation.action_items`, linked threat actions | **P — converging** |
| Failure mode | `failure_modes` | failure_modes | Static `failure_modes.py` library | **I** with sync gate |
| Maintenance strategy | `equipment_type_strategies` | strategies | — | **I** |
| Maintenance program | `maintenance_programs_v2` | maintenance_programs | Legacy v1 naming in docs | **I** on UAT |
| Scheduled task | `scheduled_tasks` | maintenance_programs | — | **I** |
| Task instance | `task_instances` | work_execution | — | **I** |
| Form | `form_templates` / `form_submissions` | forms | — | **I** |
| Spare part | `spare_parts` | spare_parts | — | **I** |
| Graph edge | `reliability_edges` | reliability_graph | Ad-hoc joins in services | **P** |
| AI recommendation | Prompt output + citations | ai_platform | Contract enforced on analyze-risk, insights, PM import; doc: `AI_RECOMMENDATION_CONTRACT.md` | **P** — chat FM suggestions not yet versioned |
| Executive KPI | `executive_kpi_snapshots` | analytics | Live compute vs snapshot | **I** (materialized) |

**Work signal convergence status (2026-06-26):**

| Layer | Status | Evidence |
|-------|--------|----------|
| **Write path** | **Converged (Phase 1+2)** | `create_work_signal`, `update_work_signal`; arch allowlist blocks direct threat writes |
| **Identity** | **Converged** | Same UUID in `observations` + `threats` when backfilled; `verify_threat_observation_convergence.py` |
| **Read surface** | **Partial (Phase 4 pending)** | UI/API still `/threats`, `threatsAPI`; product copy says "Observations" |
| **Bridge / legacy** | **Partial (Phase 5 pending)** | `threat_observation_bridge.py` retained for pre-convergence docs and convert endpoint |
| **Graph nodes** | **Partial (Phase 6 pending)** | Both `observation` and `threat` edge sync on converged writes |

Phase 1+2 fixed **operational truth** (one lifecycle, one ID). Remaining work is **structural deduplication** (routes, UI, retire bridge, single graph node type) — not a failed merge.

See [`OBSERVATION_THREAT_CONVERGENCE_PLAN.md`](./OBSERVATION_THREAT_CONVERGENCE_PLAN.md).

---

## 4. Reliability Lifecycle — Transition Audit

| Transition | Mode | Evidence | Gap |
|------------|------|----------|-----|
| Field signal → Observation | Manual + AI-assisted | `create_work_signal` (chat, forms, mobile) | Legacy `/observations`-only creates and convert endpoint until Phase 5 |
| Observation → AI risk | AI-assisted | `ai_risk_analysis.py` | Deterministic scores separate (product spec §6.4) |
| Observation → Investigation | Manual + event | Investigation routes, threat link | NOT VERIFIED: auto-create rules |
| Investigation → Action | Deterministic + manual | `investigation_action_sync`, `central_actions` | Mirror convergence ongoing |
| Action → Failure mode learning | Manual + Decision Engine | `decision_engine` unknown_failure rule | Requires human approve |
| FM → Maintenance strategy | Manual + AI suggest | Strategy v2, AI recommendations service | AI suggest ≠ auto-apply |
| Strategy → Program | Deterministic | `apply_strategy_service`, graph sync handler | — |
| Program → Planned work | Deterministic | `scheduled_tasks` generation; `maintenance_scheduling.py` | Run-scheduler moved async (`maintenance_scheduler_run.py`) to avoid gateway 504 |
| Planned work → Task instance | Deterministic + job | `backfill_scheduled_task_instances.py`; bridge gate | UAT gate 0 unbridged; tenant stamp on new tasks in `58f82e8c` |
| Task instance → Digital execution | Manual | Forms, task completion | Offline partial |
| Execution → Evidence | Manual | Form submissions, attachments | R2 UAT gaps for scan photos (status doc) |
| Evidence → Graph | Event-driven | `sync_*_edges` handlers | **~22% reactive maturity** |
| Graph → Executive insight | Deterministic materialization | Executive materializers, graph KPI aggregator | Snapshot lag |
| Insight → Continuous improvement | Manual + Decision Engine | Decision suggestions | Not closed-loop autonomous |

**Disconnected transitions:** Graph does not yet receive all lifecycle events; some learning loops stop at human approval queues.

---

## 5. Intelligence Audit — Deterministic vs AI

Per `docs/ASSETIQ_PHASE2_PRODUCT_REVERSE_ENGINEERING.md` §6.4 and code review.

### Must remain deterministic (verified intent)

- Equipment hierarchy resolution — **I** (`equipment_hierarchy_filters`)
- Criticality / weighted risk — **I** (`criticalityScore.js`, `riskScore.js`, backend criticality)
- FMEA RPN scoring — **I** (`failure_modes`, fmea helpers)
- Maintenance scheduling dates — **I** (scheduler services)
- Permission checks — **I** (`require_permission`, RBAC)
- Executive KPI materialization — **I** (read models, not LLM totals)

### AI-assisted (verified)

- Observation interpretation, risk narrative — `ai_risk_analysis.py`
- Investigation problem check — `ai_platform` via investigation facade
- Strategy/program AI recommendations — `maintenance_program_ai_recommendations.py`
- RIL copilot — `ril_copilot_service` + grounded orchestrator
- PM import vision — `pm_import` services

### Flags — AI on business-critical paths without full grounding

| Location | Risk | Evidence |
|----------|------|----------|
| Some legacy AI endpoints | May return JSON without citation block | `ai_platform` supports citations; not all callers use `execute_grounded` |
| Decision Engine | Named "engine" but **human-in-the-loop** | `approve_suggestion`, `execute_suggestion` routes |
| Failure mode suggestions | AI can propose; FM creation is manual | Decision engine + FM routes |

**Recommendation contract:** `ai_evidence_pack.py`, `ai_citation.py`, `ai_orchestrator.py` exist — **enforce on all user-facing AI outputs**.

---

## 6. Evidence & Explainability

| Evidence type | Linked to recommendations? | Evidence |
|---------------|---------------------------|----------|
| Observations / threats | **I** (converged writes) / **P** (read surface) | Same-id gate; investigation links; UI still threat-keyed until Phase 4 |
| Form submissions | **I** | Form service, investigation evidence |
| Images / attachments | **P** | Attachment routes; R2 UAT issues NOT VERIFIED fixed |
| Maintenance history | **I** | Equipment history, task instances |
| Failure modes | **I** | EFM links, graph edges when synced |
| Graph relationships | **P** | Query services; incomplete sync chain |
| AI reasoning / citations | **P** | Citation builder exists; coverage uneven |
| User decisions | **I** | Audit log, decision engine execution log |
| Supporting documents | **P** | Document fetch; investigation files |

**NOT VERIFIED:** End-to-end test proving every AI recommendation UI shows citations.

---

## 7. Product Benchmark (selected competitors)

Qualitative comparison based on codebase capabilities + industrial SaaS norms. **NOT VERIFIED** against live competitor product versions.

| Competitor | They have / AssetIQ lacks | AssetIQ has / they lack | Hard to copy | Easy to copy |
|------------|---------------------------|-------------------------|--------------|--------------|
| **IBM Maximo** | ERP depth, mature WO costing, asset financials, global SI ecosystem | Reliability-native loop, FMEA library UX, grounded copilot, ISO 14224-first hierarchy | Integrated observation→graph→strategy loop with FM library | Mobile forms, basic dashboards |
| **SAP EAM** | Finance/controlling integration, enterprise procurement | Faster pilot UX, AI library tools, visual boards | Domain-specific reliability scoring blend | Task scheduling UI |
| **IFS Ultimo** | Benelux EAM install base, contract workflows | AI-assisted FMEA import, RIL copilot, decision engine concept | FM+strategy+program linkage | Permission matrix patterns |
| **MaintainX / UpKeep / Limble** | Simplicity, mobile-first WO, low TCO | Deep FMEA, investigations, executive exposure models, graph | Industrial reliability depth + ALARP-style exposure | Chat UI, photo upload AI |
| **Fiix** | CMMS analytics, acquisition-backed scale | Custom reliability graph, strategy v2 | Graph + strategy convergence | PM templates |
| **Palantir Foundry** | Enterprise ontology at scale, pipeline ops | Vertical reliability workflow out-of-box, maintainer UX | Vertical workflow + FM library | Graph visualization concept |

**AssetIQ's defensible wedge:** Closed reliability lifecycle with **versioned FM library**, **deterministic scoring separated from AI narrative**, and **materialized executive read models** — not generic WO management.

---

## 8. Platform Checklist (Enterprise SaaS)

### 8.1 Identity & Access

| Control | Status | Evidence |
|---------|--------|----------|
| JWT auth | **I** | `routes/auth.py`, middleware |
| Password reset | **I** | Auth routes (NOT VERIFIED full E2E) |
| RBAC + permission matrix | **I** | `rbac_service`, `require_permission`, 741 routes inventoried |
| Installation scoping | **I** | `installation_filter_service` |
| Tenant isolation | **P** | `tenant_schema.py`, strict mode UAT pass; **one tenant proven** |
| OIDC / SSO | **P** | `routes/auth_oidc.py` — **spike**; `OIDC_ENABLED` env |
| Session management | **P** | Bearer default; cookie mode documented |

### 8.2 Multi-Tenancy

| Control | Status | Evidence |
|---------|--------|----------|
| Tenant filtering services | **I** | `tenant_service_filter_audit.py` → 0 flagged |
| Cross-tenant tests | **P** | `test_cross_tenant_regression.py`, `test_tenant_isolation.py` — limited |
| Background jobs tenant scope | **I** | `background_jobs` backfill; job tenant_id |
| Scheduler tenant scope | **I** (code) | `maintenance_scheduler_scope.py` passes `user` to `load_schedulable_programs`; `maintenance_scheduler_run.py` async job; `test_scheduler_scope.py`, `test_maintenance_scheduler_run.py` | **NOT VERIFIED** on live UAT after `58f82e8c`; legacy `scheduled_tasks` without `tenant_id` may need backfill under strict mode |
| Graph tenant scope | **P** | Edges backfilled; ongoing sync hooks |
| AI tenant scope | **P** | Cost guard keys; NOT VERIFIED all prompts |
| CI validation | **I** | `phase2_tenancy_report.py`, strict mode check |

### 8.3 Data Governance & Privacy

| Control | Status | Evidence |
|---------|--------|----------|
| GDPR export | **P** | `routes/gdpr.py` |
| Deletion requests | **P** | Deletion request workflow in gdpr routes |
| Consent | **N / NOT VERIFIED** | — |
| Retention policies | **Pl** | Documented gaps in SOC2 assessment |
| Audit trails | **P** | `audit_log`, `security_audit_log` |
| EU data residency | **NOT VERIFIED** | Atlas region choice ops concern |
| DPA readiness | **P** | Gap assessments only |

### 8.4 Security Operations

| Control | Status | Evidence |
|---------|--------|----------|
| Rate limiting | **P** | AI cost guard; spam protection |
| CSRF | **P** | `apiConfig.js` CSRF helpers |
| Secret management | **P** | Env-based; JWT fail-fast on uat/staging/production (2026-06-26) |
| Upload validation | **Open** | SOC2 gap assessment |
| Fail-closed auth | **I** | Permission deps on sensitive routes |
| Pen testing | **N** | Listed as pre-prod requirement |
| Dependency scanning | **NOT VERIFIED** | CI may run; confirm in workflows |

### 8.5 Reliability & Operations

| Control | Status | Evidence |
|---------|--------|----------|
| CI/CD | **I** | `backend-tests.yml`, `frontend-ci.yml` |
| Background workers | **P** | `background_jobs.py`; in-process + external worker doc |
| Scheduler | **I** | Maintenance scheduler services |
| Outbox | **I** | `event_outbox.py`, `domain_events.py` |
| Graph sync | **P** | Verify gate pass; reactive chain incomplete |
| Retry strategies | **P** | Job handlers; NOT VERIFIED uniform |
| Monitoring / alerting | **P** | Health endpoints; NOT VERIFIED prod alerting |
| DR / backup | **NOT VERIFIED** | Atlas backups assumed ops |

### 8.6 Observability

| Control | Status | Evidence |
|---------|--------|----------|
| Request IDs | **I** | `middleware/structured_logging.py`, `X-Request-ID` |
| Structured logging | **I** | Structured middleware |
| Error tracking | **NOT VERIFIED** | No Sentry reference found in quick search |
| Metrics endpoint | **I** | `routes/system.py`, redis status |
| Distributed tracing / OpenTelemetry | **N** | Not found |

### 8.7 Compliance

| Framework | Status | Evidence |
|-----------|--------|----------|
| SOC 2 | **P** | `docs/compliance/SOC2_GAP_ASSESSMENT.md` |
| ISO 27001 | **N** | NOT VERIFIED |
| NIS2 | **N** | NOT VERIFIED |

### 8.8 Scalability

| Control | Status | Evidence |
|---------|--------|----------|
| Horizontal API scaling | **P** | Monolith; Redis optional |
| Distributed cache | **P** | `redis_store.py`, `unified_cache` partial |
| Load testing | **N** | NOT VERIFIED |
| Graph scalability | **P** | WS7 benchmark harness; UAT-scale NOT VERIFIED |
| AI scalability | **P** | Rate limits; single provider |

---

## 9. Technical Architecture (summary)

```
[React SPA] → [FastAPI routes] → [Domain services] → [MongoDB Atlas]
                      ↓                    ↓
              [ai_platform]          [reliability_graph]
                      ↓                    ↓
                 [OpenAI]            [reliability_edges]
                      ↓
            [Background jobs / outbox / materializers]
```

| Layer | Where intelligence lives |
|-------|-------------------------|
| Business rules | Services (scheduling, RBAC, decision engine evaluators) |
| Deterministic calcs | criticality, risk, FMEA RPN, KPI materializers |
| Graph reasoning | `reliability_graph_query`, ontology — **partial** |
| AI | `ai_platform`, orchestrator, copilot — **grounding partial** |
| Read models | Executive/production/RIL snapshot collections |

**Integrations:** RIL models include historian/SCADA **source types**; **no verified ERP/CMMS bidirectional connectors** in repo.

**Frontend:** React 18, React Query, Zustand; large page components remain (WS4 partial). **Offline:** kiosk/offline queue modules — **P**.

**Mobile:** Responsive web + mobile routes; **NOT VERIFIED** native apps.

---

## 10. Top 20 Remediation Items

### P0 — Critical

| # | Problem | Evidence | Business impact | Tech impact | Effort | Dependencies | Outcome |
|---|---------|----------|-----------------|-------------|--------|--------------|---------|
| 1 | Single tenant proven | Tyromer only; phase2 report | Blocks enterprise sales | Isolation bugs latent | 2–4 wk | Test tenant data | Second tenant + pen test |
| 2 | Observation/threat **structural cutover** (Phases 4–6) | Phase **1+2 landed** — `update_work_signal`, backfill/verify scripts; plan: `OBSERVATION_THREAT_CONVERGENCE_PLAN.md` | Residual reporting/UI fragmentation until route rename | Graph dual-node sync until Phase 6 | 2–4 wk (Phases 4–6) | UAT backfill `--execute` + verify exit 0 (Phase 3) | Single read API + retired bridge |
| 3 | Production cutover blocked | Status doc §5 deferred | No prod revenue at scale | Data integrity risk | 4–8 wk | Ops, Atlas prod | Prod backfill + strict mode |
| 4 | Graph reactive chain incomplete | ~22% maturity note | Weak "knowledge graph" claim | Traceability gaps | 6–10 wk | Graph plan doc | All lifecycle edges synced |
| 5 | JWT secret fallback | **Mitigated 2026-06-26** — startup fails for uat/staging/production without `JWT_SECRET_KEY` | Account takeover if misconfig (local dev only) | Security incident | Done (code) | Deploy config on Railway | `tests/test_jwt_secret_config.py` |

### P1 — High

| # | Problem | Evidence | Business impact | Tech impact | Effort | Outcome |
|---|---------|----------|-----------------|-------------|--------|---------|
| 6 | Redis not required | `redis_store` optional | AI limit bypass multi-pod | Cache inconsistency | 1 wk | Upstash + env | Global limits + shared cache |
| 7 | External job workers | In-process workers | Duplicate scheduled work | Scale ceiling | 2–3 wk | Redis/queue | Durable worker fleet |
| 8 | AI citation enforcement | `ai_citation.py` not universal | Trust / audit failure | Compliance | 3–4 wk | ai_platform | 100% grounded user AI |
| 9 | OIDC production | `auth_oidc.py` spike | Enterprise SSO blocker | Auth ops | 2–3 wk | IdP | SSO for pilot #2 |
| 10 | 48h UAT soak | Deferred | Undetected regressions | Quality | 2 d | UAT users | Signed pilot stability |
| 11 | Pen test + upload validation | SOC2 open items | Security diligence fail | OWASP gaps | 2–4 wk | Vendor | Pre-prod gate |
| 12 | Frontend god components | WS4 partial | Slow feature velocity | Bug risk | 8–12 wk | WS4 plan | Routes/pages ≤800 LOC |

### P2 — Medium

| # | Problem | Evidence | Effort | Outcome |
|---|---------|----------|--------|---------|
| 13 | OpenAI-only | ai_entry_point gate | 4–6 wk | Provider abstraction used |
| 14 | Repository pattern ~3% | Status doc | Ongoing | Tenant safety in repos |
| 15 | E2E test gap for UI | Manual QA reliance | 4–6 wk | Playwright critical paths |
| 16 | OpenTelemetry | Not found | 2–3 wk | Trace across AI + jobs |
| 17 | ERP integration | Not in repo | 8+ wk | SAP/Maximo read-only sync |
| 18 | R2 media UAT | Status doc R2 gap | 1 wk | Scan photos reliable |
| 19 | Load testing | NOT VERIFIED | 2 wk | Baseline RPS + graph queries |
| 20 | SOC2 evidence automation | Gap assessment | 8–12 wk | Audit-ready controls |

---

## 11. World-Class Roadmap (Definition of Done)

### Phase 1 — Truth & tenant proof (0–90 days)

**DoD:** Second tenant on UAT; cross-tenant test suite green; observation/threat **Phase 3 backfill executed** on UAT tenants; Phase 1+2 convergence verified (`verify_threat_observation_convergence.py` exit 0); UAT soak signed off; all verify scripts exit 0 on schedule.

### Phase 2 — Graph as intelligence layer (90–180 days)

**DoD:** Every lifecycle transition in §4 has registered sync handler; `verify_reliability_graph_sync.py` + graph coverage 100% reactive; executive dashboards cite graph paths.

### Phase 3 — Enterprise platform (180–365 days)

**DoD:** OIDC prod; Redis required; external workers; prod strict mode; pen test remediated; SOC2 Type I readiness assessment complete.

### Phase 4 — Category leadership (365+ days)

**DoD:** ERP connector; multi-site benchmark customer; AI recommendations 100% cited; load test published; competitor win-loss evidence.

**World-class criteria mapping:**

| Criterion | Current | Phase to meet |
|-----------|---------|---------------|
| Multi-tenancy verified | One tenant | Phase 1 |
| One canonical model per domain | Work signal **writes converged**; read surface + bridge until Phase 4–6 | Phase 1 (backfill) + Phase 2 (cutover) |
| End-to-end traceable workflow | Core path yes; graph partial | Phase 2 |
| Grounded auditable AI | Partial | Phase 2 |
| Graph authoritative | Partial | Phase 2 |
| CI-enforced platform standards | **Yes** | Maintained |
| Honest security/compliance docs | **Yes** | Phase 3 evidence |
| Business-outcome driven | NOT VERIFIED | Phase 4 metrics |

---

## 12. Technical Glossary

| Term | Meaning |
|------|---------|
| **RBAC** | Role-Based Access Control — permissions via roles + matrix |
| **FMEA** | Failure Mode and Effects Analysis — severity × occurrence × detectability |
| **CMMS** | Computerized Maintenance Management System |
| **EAM** | Enterprise Asset Management |
| **EFM** | Equipment Failure Mode — FM linked to specific equipment |
| **RPN** | Risk Priority Number — product of FMEA dimensions |
| **RIL** | Reliability Intelligence Layer — telemetry, readings, alerts |
| **ALARP** | As Low As Reasonably Practicable — risk reduction principle |
| **ISO 14224** | International equipment reliability taxonomy standard |
| **UAT** | User Acceptance Testing environment |
| **WS1–WS8** | Platform 1.0 workstreams (tenant, graph, models, modularization, AI, read models, perf, standards) |
| **OIDC** | OpenID Connect — SSO federation protocol |
| **SOC 2** | Service Organization Control audit (security/availability) |
| **GDPR** | EU General Data Protection Regulation |
| **NIS2** | EU Network and Information Security directive |
| **CQRS** | Command Query Responsibility Segregation — separate read/write models |
| **Knowledge Graph** | Entity-relationship store (`reliability_edges`) for traceability |
| **Read model** | Materialized snapshot optimized for queries (executive KPIs) |
| **Outbox** | Reliable domain event dispatch pattern |
| **Tenant strict mode** | Queries require `tenant_id` match (no legacy `$or` fallback) |

---

## 13. Verification Evidence Index

| Script / test | Purpose | Last known |
|---------------|---------|------------|
| `audit_maturity_scorecard.py` | Composite gate | 10/10 tested dims @ UAT 2026-06-26 |
| `verify_uat_gates.py` | UAT wrapper | PASS |
| `phase1_data_integrity_report.py` | Bridge, FM, actions | PASS |
| `verify_reliability_graph_sync.py` | Graph static + DB | PASS |
| `verify_platform_standards.py` | WS8 | 4/4 PASS |
| `verify_frontend_unit_tests.py` | Frontend gate | 42 suites, 36/36 lib |
| `tenant_service_filter_audit.py` | Tenant heuristic | 0 flagged |
| `test_auth_matrix.py` | Route permissions | 65+ pass |
| `test_maintenance_scheduler_run.py` | Async run-scheduler job | PASS (local) |
| `test_ensure_program_tenant_scope.py` | Program ensure tenant stamp | PASS (local) |
| `test_visual_board_data_service.py` | VMB display user scope | 13 pass (local) |
| `verify_threat_observation_convergence.py` | Same-id observation/threat gate | Scripts landed; UAT `--execute` NOT VERIFIED |
| `backfill_threat_observation_convergence.py` | Upsert observations from threats | Scripts landed |
| `test_architecture_convergence.py` | Domain boundaries | 74 pass |

---

## 14. 90-Day CTO Execution Plan

**Principle:** Build the reliability intelligence loop, not feature count.

| Month | Focus | Deliverables |
|-------|-------|--------------|
| **1** | Truth & safety | Second tenant; cross-tenant tests; JWT hardening **landed**; re-run UAT gates weekly; observation/threat **Phase 1+2 landed** — run Phase 3 backfill `--execute` per tenant |
| **2** | Graph & AI trust | Complete top 5 graph sync handlers; enforce citations on all AI user endpoints; Redis on UAT; start 48h soak |
| **3** | Enterprise path | OIDC with pilot #2; external worker POC; pen test; prod cutover runbook (no prod execute unless approved); frontend modularization of top 3 god pages |

**Explicitly defer:** Neo4j migration, microservices split, plugin marketplace, multi-region.

---

## 15. Document Control

| Field | Value |
|-------|-------|
| Author | Platform audit (evidence-based) |
| Supersedes | Ad-hoc diligence narratives (not yet archived) |
| Next review | After next live UAT gate run — then archive superseded execution/status docs if gates still pass |
| Related | `ASSETIQ_TECHNICAL_STATUS.md`, `PHASE1_EXECUTION.md`, `PLATFORM_1_0_EXECUTION.md`, `SOC2_GAP_ASSESSMENT.md` |

---

## 16. Post-audit delta (`58f82e8c`, 2026-06-26)

Local commit at audit refresh (`deploy-uat`, ahead of remote UAT). Re-run UAT gates after deploy.

| Change | Evidence | Audit impact |
|--------|----------|--------------|
| Scheduler tenant-scoped program load | `maintenance_scheduler_scope.py`, `scheduler_program_source.py` | Fixes empty schedule when strict tenant + wrong `BACKFILL_TENANT_ID` program IDs |
| Async run-scheduler (504 mitigation) | `routes/maintenance_scheduler/scheduler.py`, `maintenance_scheduler_run.py`, `job_handlers.py` | Background job default; frontend polls job status |
| v2 program `tenant_id` on ensure/insert | `maintenance_program_service.py`, `apply_strategy_service.py` | Fixes “Equipment Manager program sync failed for 1 item(s)” on legacy rows |
| VMB kiosk tenant-wide read | `visual_board_helpers.py`, `installation_filter_service.py` | TV boards show executive KPIs (was empty for synthetic `vmb-display` user) |
| Breadcrumb click-through | `NavigationBreadcrumb.jsx`, `App.css` | Strategy/Schedule header buttons no longer blocked |
| Spares rename (display) | i18n, `routeLabels.js`, `permissions_defaults.py` | Product label **Spares**; technical key `spareiq` unchanged |
| Intelligence map programs tooltip | `intelligence_map_stats.py`, `IntelligenceMapTab.jsx` | “Strategy Programs” count vs strategy document count |

**NOT VERIFIED:** Live UAT Atlas re-run of `verify_uat_gates.py` after this commit.

---

*This document is the product + platform truth snapshot as of 2026-06-26 (refreshed for commit `58f82e8c`). Re-verify UAT gates after deploy of scheduler, graph, tenant scope, or VM board changes.*
