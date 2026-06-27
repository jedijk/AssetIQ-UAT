# AssetIQ Platform & Product Truth Audit

**Date:** 2026-06-27  
**Repository:** AssetIQ-Dev / AssetIQ-UAT  
**Commit assessed:** `6b90c9ef` (`uat/main`, pushed 2026-06-27)  
**Assessment method:** Code inspection, executable verification scripts, CI gates, prior UAT Atlas evidence (`assetiq-UAT`, tenant `Tyromer`)  
**Companion docs:** [`ASSETIQ_TECHNICAL_STATUS.md`](./ASSETIQ_TECHNICAL_STATUS.md), [`OBSERVATION_THREAT_CONVERGENCE_PLAN.md`](./OBSERVATION_THREAT_CONVERGENCE_PLAN.md), [`SOC2_GAP_ASSESSMENT.md`](../compliance/SOC2_GAP_ASSESSMENT.md)

**Rule:** Nothing is marked **Implemented** without file, script, or test evidence. Unverified items are marked **NOT VERIFIED**.

**Supersedes:** [`PLATFORM_TRUTH_AUDIT_2026-06-26.md`](./PLATFORM_TRUTH_AUDIT_2026-06-26.md)

---

## 1. Executive Summary (one page)

AssetIQ is a **credible industrial reliability intelligence pilot platform** with **deep domain features** (FMEA library, observation-to-action lifecycle, maintenance strategies/programs, executive read models, visual boards, RIL copilot) and **strong engineering governance** (18 registered domains, 12 read models, 10+ verify scripts, **1679** backend tests collected, frontend lib test gate). It is **not yet a world-class enterprise multi-tenant SaaS** or a **fully authoritative reliability knowledge graph**.

### What is truly implemented (verified)

| Area | Truth |
|------|--------|
| **Reliability lifecycle (core path)** | Observation → investigation → central action → strategy/program → scheduled task → task instance → form execution is implemented with services, routes, and UAT data gates passing (Phase 1 integrity exit 0 @ 2026-06-26). |
| **Work signal (observation/threat)** | **Phases 1–6 landed @ `6b90c9ef`:** canonical writes via `create_work_signal` / `update_work_signal`; primary API `/observations/signals/*`; frontend `/observations/*`; deprecated `/threats/*` aliases; `create_observation` routed through lifecycle; graph sync on new writes uses observation edges only; `ai_risk_queries` accepts `observation_id` alias. |
| **FMEA / failure modes** | 643 failure modes on UAT Mongo (last gate run); static library sync gate pass; EFMs, RPN, recommended actions. |
| **Multi-tenant code path** | `tenant_id` backfill on UAT; strict mode cutover pass; 0 flagged services in heuristic audit; **one production tenant proven (Tyromer)**. |
| **AI platform** | Central `ai_platform` + prompt registry + cost guard; grounded orchestrator + evidence pack exist; CI blocks direct OpenAI imports. |
| **Executive intelligence** | Materialized read models (executive KPIs, dashboards, asset health) with registry gate (12/12). |
| **Engineering gates** | Platform standards, graph handler coverage, auth matrix (61+ route permission tests), architecture convergence tests, frontend unit test gate. |

### What is partial or overstated in marketing docs

| Area | Truth |
|------|--------|
| **Work signal residual debt** | `threats` collection retained as read projection; `threat_observation_bridge.py` deprecated but present; legacy graph `threat` edges may remain until UAT runs `backfill_graph_threat_to_observation_edges.py`; Phase 3 tenant backfill `--execute` **NOT VERIFIED** on live UAT after deploy. |
| **Knowledge graph** | Mongo `reliability_edges`; static sync gate pass; **reactive chain ~22% mature** (many transitions manual or incomplete). Graph is **not yet authoritative operational intelligence layer**. |
| **Decision Engine** | Deterministic rules + human approve/reject/execute; **not autonomous AI decisions**. |
| **Enterprise SaaS** | OIDC spike only; no SOC2/ISO27001 certification; Redis optional; single-instance workers. |
| **Integrations** | RIL reading types model SCADA/historian sources; **no verified production ERP/CMMS connectors**. |

### Strategic position

AssetIQ differentiates on **reliability-native workflow + FMEA depth + grounded AI + graph intent**, not on mature EAM breadth (Maximo/SAP) or CMMS simplicity (MaintainX/UpKeep). The moat is **domain workflow integration**; the gap is **enterprise hardening, graph completeness, multi-tenant proof, and UAT operational verification after latest deploy**.

### Top five leverage moves (90-day CTO view)

1. **Second tenant + cross-tenant penetration tests** — prove multi-customer isolation beyond Tyromer.  
2. **Complete reactive graph sync chain** — every lifecycle transition writes/updates edges with verify gate; run graph threat→observation edge backfill on UAT.  
3. **Convergence soak on UAT** — run `backfill_threat_observation_convergence.py --execute` + `verify_threat_observation_convergence.py` exit 0 per tenant; then graph edge backfill.  
4. **Production cutover package** — Redis, external workers, prod backfill, 48h soak, pen test.  
5. **Evidence-first AI contract** — every recommendation returns citations + deterministic score separation (documented in product spec; enforce on all AI surfaces).

---

## 2. Product Surface Inventory

Legend: **I** = Implemented · **P** = Partial · **Pl** = Planned/stub · **N** = Not implemented  
Maturity based on code + tests + UAT gates, not slide decks.

| Product surface | Business purpose | Canonical entity | Collection(s) | Canonical service / API | Maturity | Evidence | Known limitations |
|-----------------|------------------|------------------|---------------|-------------------------|----------|----------|---------------------|
| **Equipment Hierarchy** | ISO 14224 asset tree, scoping, criticality | `equipment_nodes` | `equipment_nodes`, `installations` | `equipment_search_service`, `routes/equipment/` | **I** | `domain_registry` equipment; hierarchy utils tests | Legacy level aliases; large route files |
| **Equipment Types** | Type registry, strategy linkage | `equipment_types` | `equipment_types` | `equipment_type_registry.py` | **I** | Domain registry; type-strategy routes | NOT VERIFIED: full UI coverage |
| **Failure Modes (FMEA)** | Library, RPN, recommended actions | `failure_modes` | `failure_modes`, `equipment_failure_modes` | `services/failure_modes/`, `efm_service` | **I** | UAT 643 docs; `seed_failure_modes.py`; FM tests | Static + Mongo dual source; sync gate required |
| **Observations** | Operational risk signals from field | **`observations`** (canonical); `threats` = projection | `observations`, `threats` | `work_signal_lifecycle`, `/observations/signals/*` | **I** | `create_work_signal`, `update_work_signal`; `test_observation_threat_convergence_phases.py`; frontend `/observations` | Projection collection + deprecated `/threats` aliases; UAT backfill **NOT VERIFIED** post-deploy |
| **AI Risk Analysis** | Interpret observation, suggest risk | AI output + work signal fields | `ai_risk_insights`, `threats` projection | `ai_risk_analysis.py`, `ai_platform` | **P** | `ai_platform.py`, prompt registry, cost guard; `observation_id` alias in queries | OpenAI-only; not all paths use grounded orchestrator |
| **Investigations** | Structured RCA, evidence, causes | `investigations` | `investigations`, `cause_nodes`, `evidence_items`, `timeline_events` | `investigation_crud`, `investigation_subresources` | **I** | Domain registry; graph sync hooks in crud | Legacy `action_items` mirror path |
| **Actions** | Track mitigation work | `central_actions` | `central_actions` | `action_service`, `routes/actions.py` | **I** | Phase 1 action mirror gate pass | Was dual with investigation `action_items` |
| **Maintenance Strategies** | Equipment-type strategy templates | `equipment_type_strategies` | `equipment_type_strategies` | `apply_strategy_service`, strategy v2 routes | **I** | Domain registry; apply strategy tests | NOT VERIFIED: all strategy types in UI |
| **Maintenance Programs** | PM program per equipment | `maintenance_programs_v2` | `maintenance_programs_v2` | `maintenance_program_service` | **I** | `verify_v2_program_coverage.py` UAT pass | Legacy v1 paths may exist |
| **Planned Work** | Scheduled maintenance tasks | `scheduled_tasks` | `scheduled_tasks` | `maintenance_scheduling.py` | **I** | Phase 1 bridge 0 unbridged on UAT | Drift verify script exists |
| **Scheduling** | Calendar, assignment, instances | `task_instances` | `task_instances`, `task_templates` | `maintenance_scheduler_*`, `task_service` | **I** | Scheduler routes; async `maintenance_scheduler_run.py`; `test_scheduler_scope.py` | In-process scheduler scaling NOT VERIFIED |
| **Digital Forms** | Operator rounds, submissions | `form_templates`, `form_submissions` | `form_templates`, `form_submissions` | `form_service`, `routes/forms.py` | **I** | Domain registry; form tests | Form designer complexity NOT VERIFIED E2E |
| **Spares** (SpareIQ) | Spare parts, requirements | `spare_parts` | `spare_parts`, `spare_categories` | `spare_parts_service`, graph sync | **P** | `routes/spare_parts.py`; `SparePartRequirementsEditor` uses `useLanguage` | Route `/spareiq`; NOT VERIFIED: customer usage depth |
| **Reliability Knowledge Graph** | Traceability, impact, learning | `reliability_edges` | `reliability_edges`, `findings`, `outcomes` | `reliability_graph*.py` | **P** | Static + UAT DB sample gate pass; handler registry | Reactive chain incomplete; legacy `threat` node edges |
| **Executive Dashboards** | Leadership KPIs, exposure | read models | `executive_*_snapshots` | `executive_*_materializer.py` | **I** | Read models registry 12/12; refresh jobs | Snapshot staleness depends on jobs |
| **Visual Management Boards** | Gemba / TV boards | `visual_boards` | `visual_boards`, tokens, pairings | `visual_board_service` | **I** | `test_visual_board_data_service.py` (13 pass) | Re-verify kiosk data on live UAT after `6b90c9ef` |
| **RIL Copilot** | NL reliability queries | RIL context + AI | `ril_*`, snapshots | `ril_copilot_service`, `ai_orchestrator` | **P** | Grounded prompt in registry; auth matrix | Tool coverage NOT VERIFIED exhaustive |
| **Decision Engine** | Closed-loop learning rules | `decision_rules`, `decision_suggestions` | `decision_rules`, `decision_suggestions` | `decision_engine.py`, routes | **P** | Evaluators + approve/reject/execute API | Rules require **human approval** |

---

## 3. Canonical Business Entities & Duplicate Models

Source: `backend/architecture/domain_registry.py` (18 domains) + code search.

| Entity | Canonical collection | Owner domain | Legacy / duplicate paths | Status |
|--------|---------------------|--------------|---------------------------|--------|
| Company / tenant | `users.company_id`, `tenant_id` on collections | user_management | `organization_id` alias in some paths | **P** — strict mode on UAT |
| Installation | `installations` | equipment | Site/location aliases in labels | **I** |
| Equipment | `equipment_nodes` | equipment | — | **I** |
| Observation / work signal | **`observations`** | observations / `work_signal_lifecycle` | `threats` = same-id read projection; deprecated `/threats/*` API aliases | **I** (code) / **P** (UAT data soak) |
| Investigation | `investigations` | investigations | — | **I** |
| Action | **`central_actions`** | actions | `investigation.action_items` | **P — converging** |
| Failure mode | `failure_modes` | failure_modes | Static `failure_modes.py` library | **I** with sync gate |
| Maintenance strategy | `equipment_type_strategies` | strategies | — | **I** |
| Maintenance program | `maintenance_programs_v2` | maintenance_programs | Legacy v1 naming in docs | **I** on UAT |
| Scheduled task | `scheduled_tasks` | maintenance_programs | — | **I** |
| Task instance | `task_instances` | work_execution | — | **I** |
| Form | `form_templates` / `form_submissions` | forms | — | **I** |
| Spare part | `spare_parts` | spare_parts | — | **I** |
| Graph edge | `reliability_edges` | reliability_graph | Ad-hoc joins in services | **P** |
| AI recommendation | Prompt output + citations | ai_platform | Contract on analyze-risk; uneven elsewhere | **P** |
| Executive KPI | `executive_kpi_snapshots` | analytics | Live compute vs snapshot | **I** (materialized) |

### Work signal convergence status (2026-06-27)

| Layer | Status | Evidence |
|-------|--------|----------|
| **Write path** | **I** | `create_work_signal`, `update_work_signal`; arch allowlist blocks direct threat writes |
| **Identity** | **I** (code) | Same UUID in `observations` + `threats`; `verify_threat_observation_convergence.py` |
| **Read surface** | **I** (code) | Primary `/observations/signals/*`; frontend `/observations/*`; deprecated `/threats/*` |
| **Bridge / legacy** | **P** | `threat_observation_bridge.py` deprecated; convert endpoint deprecated; module retained for counts/backfill |
| **Graph nodes** | **P** | New writes: observation edges only (`work_signal_lifecycle`); legacy threat edges: `backfill_graph_threat_to_observation_edges.py` |

**Remaining operational work:** UAT execute backfill + verify exit 0; graph edge backfill; eventual `threats` collection retirement after soak.

See [`OBSERVATION_THREAT_CONVERGENCE_PLAN.md`](./OBSERVATION_THREAT_CONVERGENCE_PLAN.md).

---

## 4. Reliability Lifecycle — Transition Audit

| Transition | Mode | Evidence | Gap |
|------------|------|----------|-----|
| Field signal → Observation | Manual + AI-assisted | `create_work_signal` (chat, forms, mobile, structured create) | Pre-convergence docs may lack same-id observation |
| Observation → AI risk | AI-assisted | `ai_risk_analysis.py` | Deterministic scores separate (product spec §6.4) |
| Observation → Investigation | Manual + event | Investigation routes, signal link | NOT VERIFIED: auto-create rules |
| Investigation → Action | Deterministic + manual | `investigation_action_sync`, `central_actions` | Mirror convergence ongoing |
| Action → Failure mode learning | Manual + Decision Engine | `decision_engine` unknown_failure rule | Requires human approve |
| FM → Maintenance strategy | Manual + AI suggest | Strategy v2, AI recommendations service | AI suggest ≠ auto-apply |
| Strategy → Program | Deterministic | `apply_strategy_service`, graph sync handler | — |
| Program → Planned work | Deterministic | `scheduled_tasks` generation; tenant-scoped program load | Run-scheduler async job |
| Planned work → Task instance | Deterministic + job | `backfill_scheduled_task_instances.py`; bridge gate | UAT gate 0 unbridged |
| Task instance → Digital execution | Manual | Forms, task completion | Offline partial |
| Execution → Evidence | Manual | Form submissions, attachments | R2 UAT gaps NOT VERIFIED fixed |
| Evidence → Graph | Event-driven | `sync_observation_edges` on converged writes | **~22% reactive maturity**; legacy threat edges |
| Graph → Executive insight | Deterministic materialization | Executive materializers, graph KPI aggregator | Snapshot lag |
| Insight → Continuous improvement | Manual + Decision Engine | Decision suggestions | Not closed-loop autonomous |

**Disconnected transitions:** Graph does not yet receive all lifecycle events; some learning loops stop at human approval queues.

---

## 5. Intelligence Audit — Deterministic vs AI

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
| Observations / work signals | **I** | Same-id lifecycle; investigation links; `/observations` UI |
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
| RBAC + permission matrix | **I** | `rbac_service`, `require_permission`, `test_auth_matrix.py` (61+ tests) |
| Installation scoping | **I** | `installation_filter_service` |
| Tenant isolation | **P** | `tenant_schema.py`, strict mode UAT pass; **one tenant proven** |
| OIDC / SSO | **P** | `routes/auth_oidc.py` — spike; `OIDC_ENABLED` env |
| Session management | **P** | Bearer default; cookie mode documented |

### 8.2 Multi-Tenancy

| Control | Status | Evidence |
|---------|--------|----------|
| Tenant filtering services | **I** | `tenant_service_filter_audit.py` → 0 flagged |
| Cross-tenant tests | **P** | `test_cross_tenant_regression.py`, `test_tenant_isolation.py` — limited |
| Background jobs tenant scope | **I** | `background_jobs` backfill; job tenant_id |
| Scheduler tenant scope | **I** (code) | `maintenance_scheduler_scope.py`, `maintenance_scheduler_run.py`, `test_scheduler_scope.py` | NOT VERIFIED on live UAT after `6b90c9ef` |
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
| Secret management | **P** | Env-based; JWT fail-fast on uat/staging/production |
| Upload validation | **Open** | SOC2 gap assessment |
| Fail-closed auth | **I** | Permission deps on sensitive routes |
| Pen testing | **N** | Listed as pre-prod requirement |
| Dependency scanning | **NOT VERIFIED** | Confirm in `.github/workflows/` |

### 8.5 Reliability & Operations

| Control | Status | Evidence |
|---------|--------|----------|
| CI/CD | **I** | `backend-tests.yml`, `frontend-ci.yml` |
| Background workers | **P** | `background_jobs.py`; in-process + external worker doc |
| Scheduler | **I** | Maintenance scheduler services; async run job |
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
| Graph scalability | **P** | `verify_graph_performance_benchmarks.py`; UAT-scale NOT VERIFIED |
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
                      ↓
              [WebSockets: visual boards / display]
```

| Layer | Where intelligence lives |
|-------|-------------------------|
| Business rules | Services (scheduling, RBAC, decision engine evaluators) |
| Deterministic calcs | criticality, risk, FMEA RPN, KPI materializers |
| Graph reasoning | `reliability_graph_query`, ontology — **partial** |
| AI | `ai_platform`, orchestrator, copilot — **grounding partial** |
| Read models | Executive/production/RIL snapshot collections (12 registered) |

**Integrations:** RIL models include historian/SCADA **source types**; **no verified ERP/CMMS bidirectional connectors** in repo.

**Frontend:** React 18, React Query, Zustand; `LanguageContext` i18n (not react-i18next). **Offline:** kiosk/offline queue modules — **P**.

**Mobile:** Responsive web + mobile routes; **NOT VERIFIED** native apps.

---

## 10. Top 20 Remediation Items

### P0 — Critical

| # | Problem | Evidence | Business impact | Tech impact | Effort | Outcome |
|---|---------|----------|-----------------|-------------|--------|---------|
| 1 | Single tenant proven | Tyromer only | Blocks enterprise sales | Isolation bugs latent | 2–4 wk | Second tenant + pen test |
| 2 | UAT convergence soak | Phases 1–6 code on `uat/main`; backfill scripts exist | Residual data drift until execute | Reporting/graph gaps | 1 wk | `verify_threat_observation_convergence.py` exit 0 + graph edge backfill |
| 3 | Production cutover blocked | Status doc deferred | No prod revenue at scale | Data integrity risk | 4–8 wk | Prod backfill + strict mode |
| 4 | Graph reactive chain incomplete | ~22% maturity | Weak "knowledge graph" claim | Traceability gaps | 6–10 wk | All lifecycle edges synced |
| 5 | JWT secret fallback | **Mitigated** — startup fails without `JWT_SECRET_KEY` on uat/staging/production | Local dev only risk | Security | Done | `tests/test_jwt_secret_config.py` |

### P1 — High

| # | Problem | Evidence | Effort | Outcome |
|---|---------|----------|--------|---------|
| 6 | Redis not required | `redis_store` optional | 1 wk | Global limits + shared cache |
| 7 | External job workers | In-process workers | 2–3 wk | Durable worker fleet |
| 8 | AI citation enforcement | `ai_citation.py` not universal | 3–4 wk | 100% grounded user AI |
| 9 | OIDC production | `auth_oidc.py` spike | 2–3 wk | SSO for pilot #2 |
| 10 | 48h UAT soak | Deferred | 2 d | Signed pilot stability |
| 11 | Pen test + upload validation | SOC2 open items | 2–4 wk | Pre-prod gate |
| 12 | Frontend god components | WS4 partial | 8–12 wk | Routes/pages ≤800 LOC |

### P2 — Medium

| # | Problem | Evidence | Effort | Outcome |
|---|---------|----------|--------|---------|
| 13 | OpenAI-only | ai_entry_point gate | 4–6 wk | Provider abstraction |
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

**DoD:** Second tenant on UAT; cross-tenant test suite green; convergence backfill + verify exit 0 on all UAT tenants; graph edge backfill executed; UAT soak signed off; all verify scripts exit 0 on schedule.

### Phase 2 — Graph as intelligence layer (90–180 days)

**DoD:** Every lifecycle transition in §4 has registered sync handler; `verify_reliability_graph_sync.py` reactive coverage 100%; executive dashboards cite graph paths; `threats` collection retired or read-only soak complete.

### Phase 3 — Enterprise platform (180–365 days)

**DoD:** OIDC prod; Redis required; external workers; prod strict mode; pen test remediated; SOC2 Type I readiness assessment complete.

### Phase 4 — Category leadership (365+ days)

**DoD:** ERP connector; multi-site benchmark customer; AI recommendations 100% cited; load test published; competitor win-loss evidence.

**World-class criteria mapping:**

| Criterion | Current | Phase to meet |
|-----------|---------|---------------|
| Multi-tenancy verified | One tenant | Phase 1 |
| One canonical model per domain | Work signal **converged in code**; UAT data soak pending | Phase 1 |
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
| **Work signal** | Canonical observation entity — one UUID in `observations` + optional `threats` projection |

---

## 13. Verification Evidence Index

| Script / test | Purpose | Last known |
|---------------|---------|------------|
| `audit_maturity_scorecard.py` | Composite gate | 10/10 tested dims @ UAT 2026-06-26 |
| `verify_uat_gates.py` | UAT wrapper | PASS @ 2026-06-26 — **NOT VERIFIED** after `6b90c9ef` |
| `phase1_data_integrity_report.py` | Bridge, FM, actions | PASS |
| `verify_reliability_graph_sync.py` | Graph static + DB | PASS |
| `verify_platform_standards.py` | WS8 | 4/4 PASS |
| `verify_frontend_unit_tests.py` | Frontend gate | 42+ suites |
| `tenant_service_filter_audit.py` | Tenant heuristic | 0 flagged |
| `test_auth_matrix.py` | Route permissions | 61+ pass |
| `test_observation_threat_convergence_phases.py` | Phases 4–6 routes/lifecycle | PASS (local) |
| `verify_threat_observation_convergence.py` | Same-id gate | UAT `--execute` NOT VERIFIED post-deploy |
| `backfill_graph_threat_to_observation_edges.py` | Graph node consolidation | Script landed; UAT execute NOT VERIFIED |
| `pytest --collect-only` | Backend test inventory | **1679** collected @ 2026-06-27 |

---

## 14. 90-Day CTO Execution Plan

| Month | Focus | Deliverables |
|-------|-------|--------------|
| **1** | Truth & safety | Second tenant; cross-tenant tests; re-run UAT gates weekly after `6b90c9ef`; convergence + graph backfill `--execute` per tenant |
| **2** | Graph & AI trust | Complete top 5 graph sync handlers; enforce citations on all AI user endpoints; Redis on UAT; 48h soak |
| **3** | Enterprise path | OIDC with pilot #2; external worker POC; pen test; prod cutover runbook |

**Explicitly defer:** Neo4j migration, microservices split, plugin marketplace, multi-region.

---

## 15. Document Control

| Field | Value |
|-------|-------|
| Author | Platform audit (evidence-based) |
| Supersedes | `PLATFORM_TRUTH_AUDIT_2026-06-26.md` |
| Next review | After live UAT gate run post-`6b90c9ef` |
| Related | `ASSETIQ_TECHNICAL_STATUS.md`, `OBSERVATION_THREAT_CONVERGENCE_PLAN.md`, `SOC2_GAP_ASSESSMENT.md` |

---

## 16. Post-audit delta (`6b90c9ef`, 2026-06-27)

Pushed to `uat/main`. **NOT VERIFIED:** live UAT Atlas gate re-run.

| Change | Evidence | Audit impact |
|--------|----------|--------------|
| Observation/threat Phases 4–6 | `routes/threats.py`, `observation_service.py`, `work_signal_lifecycle.py`, `App.js`, `threatsAPI` | Primary `/observations/signals` + `/observations` UI; deprecated `/threats` aliases |
| Graph write consolidation | `_sync_work_signal_graph` observation-only; backfill script | New writes single node type; legacy edges need backfill |
| AI field alias | `ai_risk_queries.py` | `observation_id` + `threat_id` on upsert |
| CI hygiene | `test_*` MONGO_URL guards; scheduler param order | Pytest collection 1679 / 0 errors |
| SpareIQ build fix | `SparePartRequirementsEditor.jsx` → `useLanguage` | Frontend build passes without `react-i18next` |

---

*This document is the product + platform truth snapshot as of 2026-06-27 (commit `6b90c9ef`). Re-verify UAT gates after deploy.*
