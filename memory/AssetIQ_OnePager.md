# AssetIQ — Industrial Reliability Intelligence Platform

## What is AssetIQ?

AssetIQ is a full-stack reliability intelligence platform for asset-intensive industries — processing plants, mining, utilities, and manufacturing. It connects equipment hierarchy, failure-mode knowledge, field observations, investigations, corrective actions, and maintenance execution into one closed-loop system.

Built for reliability engineers, maintenance teams, plant operators, and executives — accessible from desktop, mobile PWA, and shop-floor kiosk displays.

---

## Key Features

### Observations & Risk Scoring
Canonical observation workspace with deterministic risk scoring (equipment criticality + FMEA). Every field signal links to equipment hierarchy and failure modes. Legacy threat routes redirect to observations.

### AI Chat Assistant
Report equipment issues by voice or text. The AI identifies equipment from your hierarchy, matches failure modes from the FMEA library, creates a risk-scored observation, and suggests actions. Photo attachments trigger damage analysis and follow-up actions.

### Equipment Hierarchy (ISO 14224)
Full asset hierarchy from installation through maintainable items. Installation-scoped access for non-owner users. Global equipment unit filter narrows list views. Resizable hierarchy sidebar in the main layout for quick navigation.

### Equipment Reliability Trace
Graph-based chain view (`/equipment/:id/trace`) showing how maintenance strategy, scheduled work, observations, investigations, and outcomes connect for a single asset.

### Causal Investigation Engine
Structured root cause analyses linked to observations. Cause-and-effect chains, evidence, linked actions, and AI-assisted problem checks.

### Failure Mode Library & PM Import
ISO 14224–aligned FMEA with severity, occurrence, detectability, and RPN. PM Intelligence Import turns Excel, PDF, and image maintenance plans into structured failure modes and active programs. Maintenance Strategy v2 with Apply Strategy.

### Maintenance & Scheduling
Recurring maintenance programs, task scheduler with AI planner, My Tasks personal queue, form builder for inspections, and Supervisor Command Center for shift-start prioritization.

### Success Readiness
People / Process / Technology pillars with 15 KPIs, snowflake dashboard, registers (training, champions, procedures, governance), assessments, pulse surveys, evidence, and AI recommendations. Owner configures integration scope.

### Self-Service Onboarding
Guided in-app workspace (`/settings/onboarding`) for customers to configure their own environment with AI Coach and phase validation.

### Multi-Tenant & Multi-Environment
Tenant registry with per-module toggles. Production and UAT database isolation for owners. Tenant read filters match `tenant_id` or `company_id`; strict mode after backfill.

### Reliability Intelligence Layer (RIL)
Cases, alerts, correlations, equipment reliability state, and RIL Copilot for natural-language queries over reliability data.

### Visual Management Studio
Shop-floor TV boards with device pairing — kiosk access without login credentials on displays.

### Mobile-First & Simple Mode
PWA with portrait lock. Operators can use Simple Mode for a streamlined field experience: My Tasks, equipment, observations, and production.

---

## Technical Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router 7, TanStack Query, Tailwind + Radix UI |
| Backend | FastAPI (Python 3.11), async MongoDB (Motor/PyMongo) |
| Database | MongoDB 7 (Atlas production; Docker local) |
| AI | OpenAI via centralized gateway (text, vision, voice) |
| Auth | JWT / cookie, OIDC SSO, RBAC with 6 base roles |
| Deployment | Railway, GitHub Actions, Playwright E2E |

---

## Who Is It For?

- **Executives** — Portfolio exposure, lifecycle risk, Success Readiness dashboard
- **Reliability Engineers** — Failure modes, observations, investigations, equipment trace, RIL
- **Maintenance Teams** — Scheduler, My Tasks, forms, PM compliance
- **Plant Operators** — Mobile observations, QR scans, Simple Mode, production logging
- **Administrators** — Tenant management, onboarding workspace, permissions, integrations

---

*AssetIQ — From observation to action. Industrial Reliability Intelligence Platform.*
