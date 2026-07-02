# AssetIQ — Complete Application Description

**Version:** 3.7.7  
**Last updated:** June 14, 2026  
**Platform type:** Industrial reliability intelligence & asset management  
**Tagline (PWA):** Industrial Reliability Intelligence Platform

---

## What AssetIQ Is

AssetIQ is an end-to-end **reliability intelligence platform** for asset-intensive industries — processing plants, mining, utilities, and manufacturing. It connects equipment hierarchy, failure-mode knowledge (FMEA), field observations, root-cause investigations, corrective actions, and maintenance execution into a single operational system.

The product's core promise is **closed-loop reliability**: turn field signals into structured risk, act on them with evidence-based maintenance strategy, execute work, and measure whether risk actually went down.

Unlike a generic CMMS or BI tool, AssetIQ combines:

- A **curated failure-mode library** (ISO 14224–aligned)
- **Deterministic risk scoring** (criticality + FMEA)
- A **reliability knowledge graph** linking equipment, strategy, work, findings, and outcomes
- **Advisory AI** across observations, investigations, library curation, and production analysis
- **Success Readiness** measurement across People, Process, and Technology pillars

---

## Who It's For

| Persona | Primary use |
|--------|-------------|
| **Executives** | Portfolio exposure, lifecycle risk, cost avoidance, trend dashboards, Success Readiness snowflake |
| **Reliability engineers** | Failure modes, observations, investigations, RIL, equipment reliability trace |
| **Maintenance planners / supervisors** | Scheduler, My Tasks, Supervisor Command Center, PM compliance |
| **Operators / inspectors** | Mobile observations, forms, QR scans, Simple Mode |
| **Administrators** | Users, permissions, tenants, onboarding workspace, Success Readiness, audit, GDPR, integrations |

---

## Technology Foundation

| Layer | Stack |
|-------|--------|
| **Frontend** | React 18, React Router 7, TanStack Query, Tailwind + Radix UI, Framer Motion, Recharts/D3 |
| **Backend** | Python 3.11, FastAPI, Motor/PyMongo (async MongoDB) |
| **Database** | MongoDB 7 (Atlas in production; local via Docker) |
| **Cache / jobs** | Redis (optional), APScheduler, background workers on Railway |
| **AI** | OpenAI via centralized `ai_gateway` with cost guards and usage logging |
| **Files** | Cloudflare R2 (S3-compatible), MongoDB fallback |
| **Email / push** | Resend, Web Push (VAPID) |
| **Deployment** | Railway (API + workers), GitHub Actions CI, Playwright E2E |
| **Languages** | English, Dutch, German (UI + backend translation dictionary) |

Auth supports **JWT bearer** and **cookie** modes, optional **OIDC SSO**, email/password with 2FA, and GDPR flows (consent, export, deletion requests).

---

## Security, Roles & Multi-Tenancy

### Roles

Six base roles: **owner**, **admin**, **reliability_engineer**, **maintenance**, **operations**, **viewer**. Custom roles inherit from a base role.

### Permissions

Feature-gated RBAC with per-feature **read / write / delete** across 22+ areas (observations, investigations, actions, scheduler, library, dashboards, visual boards, success readiness, settings, etc.). Admins can **preview as another role**. Owners can **switch between tenants** (UAT/production organizations) without re-login.

### Multi-tenancy

Rolling `tenant_id` hardening across collections (wave-based migration). Reads use `tenant_read_filter`, matching documents by **`tenant_id` or `company_id`** so legacy prod data and new pilot collections coexist. **`TENANT_STRICT_MODE`** (enabled on UAT) requires one of those fields; non-strict mode also includes documents missing `tenant_id` during migration. **`BACKFILL_TENANT_ID`** seeds single-tenant defaults when user context lacks an org id.

Tenant registry supports trial/active/suspended states, **per-tenant module toggles** (ObservationIQ, StrategyIQ, SchedulingIQ, Digital Operator, Spares, Visual Boards, RIL Copilot, Executive Dashboards, AI Risk Analysis), and **prod/UAT database isolation** (`assetiq` vs `assetiq-UAT` on the same cluster). Owners can switch active tenant without re-login.

**Read scoping** uses `tenant_read_filter` in `tenant_schema.py`: documents match when `tenant_id` **or** `company_id` equals the user's organization. During migration, non-strict mode also includes documents where `tenant_id` is absent (`$exists: false`).

| Setting | Purpose |
|---------|---------|
| `TENANT_STRICT_MODE=true` | After Wave 2 backfill, reads use strict `{tenant_id \| company_id}` matching only — no legacy bleed |
| `BACKFILL_TENANT_ID` | Default tenant for scripts, background jobs, and single-tenant deployments |
| `PRIMARY_TENANT_ID` | Primary tenant for repair/seed scripts |

**Database environment isolation:** Owners switch between production and UAT MongoDB databases in **Settings → Database Environment**. `PRODUCTION_DB_NAME` and `UAT_DB_NAME` (defaults `assetiq` and `assetiq-UAT`) are fixed switch targets; all tenant data, equipment, and observations are isolated per database.

Installation-level scoping further restricts non-owner users via `assigned_installations` (see Equipment hierarchy below).

---

## Application Structure — Main Areas

### Dashboard hub (`/dashboard`)

Multi-tab command center, permission-gated:

- **Operational** — risk overview across the fleet
- **Production** — machine KPIs, events, AI insights, log-driven metrics
- **Reliability (RIL)** — Reliability Intelligence Layer dashboard
- **Executive** — lifecycle exposure, active threat exposure, materialized snapshots (owner by default)
- **Dashboard Builder** — optional AI-assisted custom dashboards (feature-flagged)

### Observations (`/observations`)

Canonical field-signal module (legacy `/threats` routes redirect here).

**Data model:** New observations are written to the canonical `observations` collection. A compatibility projection maintains the legacy `threats` collection for downstream consumers during convergence. List views, APIs, and the Observation Workspace read from the canonical source.

**Observation Workspace** (`/observations/:id/workspace`) is the primary detail view:

- Equipment history timeline with **PM Compliance** badge
- Reliability intelligence and exposure cards
- Failure mode linking and recommended actions from the library
- Action plan, ALARP-style mitigation progress, learning closure
- AI-assisted description and risk context

### Investigations — Causal Engine (`/causal-engine`)

Structured root-cause analysis:

- Timeline, failures, causes, evidence, linked actions
- 5-Why style workflows, file attachments
- AI problem check and similar-incident suggestions

### Actions (`/actions`)

Central corrective/preventive action register linked to observations and investigations. Completion tracking, validation, outcome assessment (risk reduction %, repeat failures, exposure delta).

### Strategy / Failure Mode Library (`/library`)

FMEA knowledge base:

- Severity, occurrence, detection, RPN, effects, causes, recommended actions
- Version history, validation, duplicate scan, AI improve/consolidate
- **Failure Mode Information Cards** — deterministic AI-generated engineering cards (localized en/nl/de), versioned cache, PNG export, projected RPN if all actions implemented
- **PM Intelligence Import** (Excel/PDF/images → structured FM data and PM tasks)
- Maintenance Strategy v2 per equipment type with task generation and sync

**Intelligence Map / library stats:** PM import–driven maintenance programs (`program_source: pm_import`) count as **active programs** alongside v2 strategy-backed programs. Equipment with active PM-import tasks but no v2 program still contributes to reliability KPIs and executive exposure coverage.

### Equipment (`/equipment-manager`, `/equipment/:id/reliability`, `/equipment/:id/trace`)

Hierarchical equipment registry (ISO 14224) with criticality, files, QR codes, and reliability profile.

**Installation-scoped filtering:** Non-owner users see data only for installations in `assigned_installations`. Owners and VMB kiosk users see all installations within the tenant. The `installation_filter_service` scopes observations, actions, investigations, equipment lists, and related aggregates.

**Equipment unit filter:** A global **equipment unit filter** (persisted per tenant in browser storage) narrows list views — observations, maintenance schedule, library stats, hierarchy API responses, and more — to selected plant units. Sent via `X-Equipment-Unit-Ids` request header. Stale IDs after database migrations are ignored server-side; the frontend auto-clears invalid stored IDs on load.

**Layout hierarchy sidebar:** The main `Layout` includes a resizable equipment hierarchy sidebar (`data-testid="hierarchy-sidebar"`) for quick navigation, search, and context-menu actions (e.g. report observation from equipment). Auto-collapses on Equipment Manager and Settings pages.

**Equipment Reliability Trace** (`/equipment/:id/trace`):

Graph-based visualization of the reliability chain for a single asset — from maintenance strategy and scheduled work through observations, investigations, and outcomes. Powered by `getEquipmentReliabilityChain` on the reliability knowledge graph. Linked from the reliability profile page and evidence panels. Depth and node limits are configurable; live reliability state (open observation count, exposure) is shown in the header.

### Maintenance & Scheduling

- **Maintenance programs** (v1 and v2)
- **Task Scheduler** (`/tasks`) — timeline, daily/weekly planner, technician assignment, AI planner
- **My Tasks** (`/my-tasks`) — unified personal work queue (tasks + actions)
- **Form submissions** — inspection/checklist execution
- **Maintenance readiness** settings and KPIs

### Production

Production dashboard, log ingestion (upload → column detect → parse → batch ingest), viscosity pairing, granulometry analysis page.

### Reliability Intelligence Layer (RIL)

`/reliability/cases`, readings, alerts, correlations, predictions, digital twin concepts, **RIL Copilot** (natural-language queries over reliability data), equipment reliability state.

### Supervisor Command Center (`/supervisor`)

Shift-start prioritized queue: open observations, overdue PM, pending actions, active investigations.

### SpareIQ (`/spareiq`)

Spare parts register linked to equipment via reliability graph (`used_on`, `requires`).

### Visual Management Studio

Board editor, templates, device pairing, analytics. Published boards accessible at **`/vmb/:token`** (kiosk, no login). TV pairing at `/tv` and `/tv/board`. Legacy PHP display fallback for older browsers.

### Mobile (`/mobile`)

Dedicated shell: Home (equipment hierarchy), Analytics, Tasks, Alerts. PWA with portrait lock and iOS optimizations.

### Simple Mode

Per-user **default Simple Mode** flag. On mobile, operators see a simplified **Operator Landing** (greeting, My Tasks, Equipment, Production/Observations) instead of the full dashboard. Profiles: **operations** vs **maintenance**.

### Settings (extensive `/settings/*`)

Preferences, users, permissions, QR/labels, notifications, risk calculation weights, AI usage, file security, **External API** keys, server performance, database environment (owner), audit log, criticality definitions, visual management admin, log ingestion, **tenant management**, GDPR/privacy, translations dictionary, disciplines, task generation, feedback admin.

**Success Readiness** (`/settings/success-readiness`) — adoption and go-live measurement across **People**, **Process**, and **Technology** pillars with 15 KPIs (5 per pillar, 20% weight each within pillar):

| Pillar | KPIs |
|--------|------|
| **People** | User Adoption, Training Completion, Champion Program, Role Coverage, Change Readiness |
| **Process** | Core Data Readiness, Procedure Coverage, Governance Maturity, Workflow Adoption, Reliability Process |
| **Technology** | Platform Utilization, Integration Health, Data Quality, Infrastructure Readiness, AI Readiness |

KPIs are **automatic** (computed from platform data) or **manual** (updated via registers and assessments). Status derives from score vs target: on track, at risk, off track, not started, excluded.

| Area | Path | Purpose |
|------|------|---------|
| Dashboard | `/settings/success-readiness` | Snowflake radar chart, pillar scores, overall maturity; clickable pillar cards scroll to KPI sections |
| People / Process / Technology | `.../people`, `.../process`, `.../technology` | Pillar drill-down with KPI tables |
| Assessments | `.../assessments` | Structured readiness assessments |
| Registers | `.../registers` | Manual KPI evidence — training, champion, procedure, governance |
| Pulse Surveys | `.../pulse-surveys` | Adoption pulse surveys with templates and response tracking |
| Evidence / History | `.../evidence`, `.../history` | Attached evidence and score history |
| AI Recommendations | `.../ai-recommendations` | Advisory improvement suggestions |
| Configuration | `.../configuration` | Owner-only: `integrations_enabled` excludes Integration Health from scoring when integrations are out of scope |

Permission: `success_readiness:read` / `write`. Complements the [Go-Live Readiness Checklist](./ASSETIQ_GO_LIVE_READINESS_CHECKLIST.md).

**Onboarding workspace** (`/settings/onboarding`) — guided self-service setup for new tenants (see `SELF_SERVICE_ONBOARDING_WORKSPACE_SPEC.md`). Complements the operator-facing [Client Onboarding Playbook](./CLIENT_ONBOARDING_PLAYBOOK.md).

### Public / kiosk routes

Login, register, password reset, OIDC callback, QR scan landing, visual board kiosk, TV display pairing.

---

## Core Workflows

```
Equipment & FM Library → Observation → Investigation → Action → Verification → Closure
                              ↓                              ↑
                         PM Strategy → Scheduled Work → Form / Task
```

1. **Risk identification** — Operator or engineer records an observation; equipment and failure mode are assessed; deterministic risk score is calculated.
2. **Analysis** — Workspace shows history, PM compliance, exposure, and library recommendations; optional Causal Engine investigation; equipment trace for full chain context.
3. **Planning** — Actions added from FM library or ad hoc; ALARP progress tracked.
4. **Execution** — My Tasks / scheduler / forms; technicians complete work with feedback.
5. **Closure & learning** — Mitigation, outcome intelligence (did risk drop? did it repeat?), executive exposure updates.
6. **Knowledge reuse** — FM library, information cards, and graph edges preserve institutional reliability knowledge.
7. **Readiness** — Success Readiness KPIs, registers, and pulse surveys track adoption through and after go-live.

---

## AI Capabilities (Advisory Only)

All AI routes through a **central gateway** with token logging and cost guards. AI does **not** set authoritative numeric risk scores.

| Area | Examples |
|------|----------|
| Chat assistant | Voice/text observation reporting, guided intake |
| Observations | Risk insights, causal analysis, action optimization, fault tree / bow-tie |
| Failure modes | Suggest, improve, discipline mapping, duplicate scan, downtime classification, information cards |
| Investigations | Problem check, similar incidents |
| Production | Log parsing, machine analysis, dashboard insights |
| Maintenance | AI scheduler plan |
| RIL | Copilot queries |
| Success Readiness | Improvement recommendations |
| Translations | AI-assisted dictionary generation |
| Documents/images | Structured extraction, damage analysis |

---

## Integrations

| Integration | Purpose |
|-------------|---------|
| **External API v1** (`/api/v1/external`) | Machine-to-machine: observation ingest, equipment read; API keys, tenant-scoped |
| **OIDC SSO** | Enterprise single sign-on |
| **QR codes** | Equipment lookup from physical tags |
| **Web push** | Real-time notifications |
| **Resend email** | Invites, password reset, GDPR |
| **Cloudflare R2** | Attachments and exports |
| **EFMS** | Equipment–failure-mode mapping API |

---

## Key Differentiators

1. **Reliability knowledge graph** — cross-domain edges power trace views, intelligence map, and outcome learning.
2. **Deterministic + monetary risk** — configurable criticality/FMEA blend separate from AI narrative.
3. **Single Observation Workspace** — replaces fragmented legacy threat views.
4. **Equipment Reliability Trace** — end-to-end graph chain from strategy to field signals.
5. **Engineering-grade FM Information Cards** — deterministic, versioned, multilingual, exportable.
6. **PM Intelligence Import** — turns legacy maintenance documents into structured library data and active programs.
7. **Success Readiness** — measurable People/Process/Technology adoption with snowflake dashboard and pulse surveys.
8. **Self-Service Onboarding** — guided in-app workspace for customer self-configuration.
9. **Visual Management Studio** — shop-floor TV boards without credential exposure on displays.
10. **Executive exposure model** — covered / uncovered / unassessed exposure with drill-down.
11. **Closed-loop outcome intelligence** — measures whether actions actually reduced risk.
12. **Multi-tenant SaaS readiness** — registry, module flags, strict-mode cutover, owner tenant switching.
13. **Operator-first mobile** — Simple Mode, PWA, QR, forms at the point of work.

---

## Maturity Notes

- **Decision Engine** (`/decision-engine`) — backend exists; UI is still under development.
- **Observations vs threats** — canonical `observations` collection is authoritative; legacy `threats` projection and API heritage remain during convergence. UI and routes use "observations" throughout.
- **Smart Dashboard Builder** — behind feature flag.
- **Architecture convergence** — ongoing wave-based migration to bounded contexts, repositories, and route line limits (enforced in CI).
- **Tenant strict mode** — enable `TENANT_STRICT_MODE` per environment after Wave 2 backfill validation (`scripts/strict_mode_cutover_check.py`).

---

## Summary

**AssetIQ helps industrial teams see reliability risk clearly, act on it with proven maintenance strategy, execute work in the field, prove that exposure went down, and measure adoption readiness — with AI assistance and a living failure-mode knowledge base at the center.**
