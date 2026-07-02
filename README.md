# AssetIQ

**Version 3.7.7** · June 2026

AssetIQ is an industrial **reliability intelligence platform** for asset-intensive operations — processing plants, mining, utilities, and manufacturing. It connects ISO 14224 equipment hierarchy, failure-mode knowledge (FMEA), field observations, root-cause investigations, corrective actions, and maintenance execution into one closed-loop system.

The platform turns field signals into structured risk, applies evidence-based maintenance strategy, executes work in the field, and measures whether exposure actually went down — with advisory AI and a living failure-mode knowledge base at the center.

## Key capabilities

- **Observations & Observation Workspace** — risk-scored field signals with exposure, PM compliance, and action planning
- **Causal Engine** — structured root-cause investigations linked to observations and actions
- **Failure Mode Library & Intelligence Map** — FMEA catalog, maintenance strategy v2, PM import, strategy-to-work flow visualization
- **Equipment hierarchy** — installation-scoped tree with criticality, QR codes, reliability profile, and graph-based trace
- **Maintenance & scheduling** — programs, task scheduler, My Tasks, digital forms
- **Reliability Intelligence Layer (RIL)** — cases, readings, alerts, copilot, equipment reliability state
- **Success Readiness** — People / Process / Technology adoption KPIs, registers, assessments, and pulse surveys
- **Visual Management Studio** — shop-floor TV boards with kiosk pairing
- **Multi-tenant SaaS** — tenant registry, module toggles, RBAC, external API, GDPR tooling

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, React Router 7, TanStack Query, Tailwind, Radix UI |
| Backend | Python 3.11, FastAPI, Motor (async MongoDB) |
| Database | MongoDB 7 (Atlas in cloud; Docker locally) |
| AI | OpenAI via centralized gateway with usage guards |
| Deploy | Railway, GitHub Actions, Playwright E2E |

## Documentation

| Document | Purpose |
|----------|---------|
| [Complete application description](docs/ASSETIQ_PRODUCT_DESCRIPTION.md) | Canonical product overview — modules, workflows, AI, integrations |
| [Client onboarding playbook](docs/CLIENT_ONBOARDING_PLAYBOOK.md) | Operator runbook for provisioning tenants and loading data |
| [Go-live readiness checklist](docs/ASSETIQ_GO_LIVE_READINESS_CHECKLIST.md) | Executive checklist before production handoff |
| [Documentation index](docs/README.md) | Index of architecture, platform, and compliance docs |

## Local development

**Prerequisites:** Docker (recommended) or local MongoDB, Node.js 18+, Python 3.11+

```bash
# Full stack (MongoDB + API + worker + frontend)
docker compose up

# Or run services individually:
docker compose up mongo -d
cd backend && pip install -r requirements.txt && uvicorn server:app --reload --port 8000
cd frontend && npm install && npm start
```

Set `MONGO_URL` and `JWT_SECRET` in the backend environment. The frontend dev server proxies API requests to port 8000.

## Repository layout

```
backend/     FastAPI API, services, workers
frontend/    React SPA (desktop + mobile + PWA)
docs/        Product, architecture, and onboarding documentation
tests/       Playwright E2E tests
```
