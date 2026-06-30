# AssetIQ — Complete Application Description

**Version:** 3.7.7  
**Last updated:** June 2026  
**Platform type:** Industrial reliability intelligence & asset management  
**Tagline (PWA):** AI-Powered Asset Management Platform

---

## What AssetIQ Is

AssetIQ is an end-to-end **reliability intelligence platform** for asset-intensive industries — processing plants, mining, utilities, and manufacturing. It connects equipment hierarchy, failure-mode knowledge (FMEA), field observations, root-cause investigations, corrective actions, and maintenance execution into a single operational system.

The product's core promise is **closed-loop reliability**: turn field signals into structured risk, act on them with evidence-based maintenance strategy, execute work, and measure whether risk actually went down.

Unlike a generic CMMS or BI tool, AssetIQ combines:

- A **curated failure-mode library** (ISO 14224–aligned)
- **Deterministic risk scoring** (criticality + FMEA)
- A **reliability knowledge graph** linking equipment, strategy, work, findings, and outcomes
- **Advisory AI** across observations, investigations, library curation, and production analysis

---

## Who It's For

| Persona | Primary use |
|--------|-------------|
| **Executives** | Portfolio exposure, lifecycle risk, cost avoidance, trend dashboards |
| **Reliability engineers** | Failure modes, observations, investigations, RIL, equipment trace |
| **Maintenance planners / supervisors** | Scheduler, My Tasks, Supervisor Command Center, PM compliance |
| **Operators / inspectors** | Mobile observations, forms, QR scans, Simple Mode |
| **Administrators** | Users, permissions, tenants, risk settings, audit, GDPR, integrations |

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

Feature-gated RBAC with per-feature **read / write / delete** across 22+ areas (observations, investigations, actions, scheduler, library, dashboards, visual boards, settings, etc.). Admins can **preview as another role**. Owners can **switch between tenants** (UAT/production organizations) without re-login.

### Multi-tenancy

Rolling `tenant_id` hardening across collections. Tenant registry supports trial/active/suspended states and **per-tenant module toggles** (ObservationIQ, StrategyIQ, SchedulingIQ, Digital Operator, Spares, Visual Boards, RIL Copilot, Executive Dashboards, AI Risk Analysis).

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

**Observation Workspace** (`/observations/:id/workspace`) is the single detail view:

- Equipment history timeline with **PM Compliance** badge
- Reliability intelligence and exposure cards
- Failure mode linking and recommended actions from the library
- Action plan, ALARP-style mitigation progress, learning closure
- AI-assisted description and risk context

New observations are written to canonical `observations` and projected to legacy `threats` for compatibility.

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
- PM Intelligence Import (Excel/PDF/images → structured FM data)
- Maintenance Strategy v2 per equipment type with task generation and sync

### Equipment (`/equipment-manager`, `/equipment/:id/reliability`, `/equipment/:id/trace`)

Hierarchical equipment registry with criticality, files, QR codes, reliability profile, and graph-based trace of how strategy, work, and findings connect.

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
2. **Analysis** — Workspace shows history, PM compliance, exposure, and library recommendations; optional Causal Engine investigation.
3. **Planning** — Actions added from FM library or ad hoc; ALARP progress tracked.
4. **Execution** — My Tasks / scheduler / forms; technicians complete work with feedback.
5. **Closure & learning** — Mitigation, outcome intelligence (did risk drop? did it repeat?), executive exposure updates.
6. **Knowledge reuse** — FM library, information cards, and graph edges preserve institutional reliability knowledge.

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
4. **Engineering-grade FM Information Cards** — deterministic, versioned, multilingual, exportable.
5. **PM Intelligence Import** — turns legacy maintenance documents into structured library data.
6. **Visual Management Studio** — shop-floor TV boards without credential exposure on displays.
7. **Executive exposure model** — covered / uncovered / unassessed exposure with drill-down.
8. **Closed-loop outcome intelligence** — measures whether actions actually reduced risk.
9. **Multi-tenant SaaS readiness** — registry, module flags, owner tenant switching.
10. **Operator-first mobile** — Simple Mode, PWA, QR, forms at the point of work.

---

## Maturity Notes

- **Decision Engine** (`/decision-engine`) — backend exists; UI is still under development.
- **Observations vs threats** — UI and routes say "observations"; some backend collections/API heritage remains during convergence.
- **Smart Dashboard Builder** — behind feature flag.
- **Architecture convergence** — ongoing wave-based migration to bounded contexts, repositories, and route line limits (enforced in CI).

---

## Summary

**AssetIQ helps industrial teams see reliability risk clearly, act on it with proven maintenance strategy, execute work in the field, and prove that exposure went down — with AI assistance and a living failure-mode knowledge base at the center.**
