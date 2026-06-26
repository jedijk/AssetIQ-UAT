# Observation / Threat Convergence Plan

**Status:** Phase 1+2 landed on `deploy-uat` (2026-06-26)  
**Scope:** Planning only — no data migration in this sprint

## Current state (as of 2026-06-26)

AssetIQ maintains **two Mongo collections** for the same work signal:

| Collection | Role today |
|------------|------------|
| `observations` | Canonical write target for converged lifecycle |
| `threats` | Legacy read projection (`projection_of: "observation"`, same `id` when converged) |

Phase 1+2 code is **live**:

- `update_work_signal()` — sole approved path for threat projection updates (arch-enforced allowlist)
- `create_work_signal()` — inserts observation + same-id threat projection + graph sync
- `backfill_threat_observation_convergence.py` — upserts same-id observations from threats; removes `legacy_threat_id` duplicates
- `verify_threat_observation_convergence.py` — gate: every threat id has matching observation; no orphan/duplicate groups

## Collections & related data

- **Primary:** `observations`, `threats`
- **Lifecycle:** `investigations`, `central_actions`, `timeline_events`, `action_items`, `evidence_items`
- **Graph:** `reliability_edges` (both `observation` and `threat` node types today)
- **AI cache:** `ai_risk_insights` (keyed by `threat_id`, same as observation id when converged)
- **Bridge (legacy):** `legacy_threat_id` on pre-convergence observation docs

## API surface

| Route prefix | Usage |
|--------------|-------|
| `/api/threats/*` | Primary UI list/detail/edit (ThreatsPage, mobile, dashboards) |
| `/api/observations/*` | Structured CRUD, combined list, failure-mode suggest |
| `/api/observation-workspace/{id}/*` | Workspace aggregate (reads threat collection today) |
| `/api/ai/analyze-risk/{threat_id}` | AI risk (id = work signal id) |

**Write-path split (risk):**

- Converged: `create_work_signal` / `update_work_signal` → both collections
- Non-converged: `observation_service.create_observation` → observations only; `convert_threat_to_observation` → separate doc (pre-convergence)

## UI entry points

| Path | Component | API client |
|------|-----------|------------|
| `/threats` | `ThreatsPage.js` | `threatsAPI` |
| `/threats/:id/workspace` | `ObservationWorkspacePage.jsx` | `observationWorkspaceAPI` + `threatsAPI` |
| Mobile observations | `MobileObservations.js` | `threatsAPI` |
| Dashboards / equipment timeline | Multiple | `threatsAPI` |

Product copy says "Observations"; routes still use `/threats`. No standalone `/observations` page.

## Canonical target

**Single work signal entity:** `observations` collection, one UUID per signal.

- **Writes:** all creates/updates via `work_signal_lifecycle` (`create_work_signal`, `update_work_signal`)
- **Reads (transition):** `work_signal_projection` / unified list endpoints; keep `threats` projection until UI cutover
- **Graph (long-term):** `observation` node type only; retire duplicate `threat` edges after backfill
- **AI / investigations / actions:** rename fields to `observation_id` (values unchanged when same-id)

## Migration scope

| Phase | Work | Status |
|-------|------|--------|
| **1** | Insert allowlist, `create_work_signal`, graph dual-sync | Landed |
| **2** | `update_work_signal`, threat update allowlist, service rewires | Landed |
| **3** | Backfill + verify scripts, tenant gate | Scripts landed; **UAT execute pending per tenant** |
| **4** | UI/API route rename (`/threats` → `/observations` or `/signals`) | Not started |
| **5** | Retire `threat_observation_bridge`, separate-doc convert, observation-only creates | Not started |
| **6** | Graph node consolidation, `ai_risk_insights.threat_id` rename | Not started |

## Risks

1. **Dual writes missed** — code path bypassing `work_signal_lifecycle` leaves drift (verify script catches)
2. **UI still threat-keyed** — workspace and KPIs read `threats`; converged data OK if projection synced
3. **Graph duplication** — both `sync_observation_edges` and `sync_threat_edges` on each converged write
4. **Legacy convert endpoint** — `POST /threats/{id}/convert-to-observation` creates separate doc; must deprecate
5. **Tenant backfill** — Tyromer UAT may pass verify only after `--execute` backfill

## Safe migration order

1. Run `verify_threat_observation_convergence.py` on UAT (read-only) → baseline gap count
2. Run `backfill_threat_observation_convergence.py --execute --tenant-id <tenant>` on UAT
3. Re-run verify until exit 0
4. Enforce verify in UAT milestone / weekly gate
5. Redirect new feature work to `create_work_signal` / `update_work_signal` only; block new direct `db.threats.*` writes (already arch-tested)
6. Switch read paths to `observations` + projection fallback (backend first, then frontend API client)
7. Rename routes and permissions (`/threats` → `/observations`)
8. Remove threat projection collection writes; keep read-only projection or drop collection after soak
9. Graph + AI field rename in dedicated release

## Intentionally not in this sprint

- Production backfill
- Route/UI renames
- Neo4j or microservice split
- Dropping `threats` collection

## Verification commands

```bash
cd backend && python3 scripts/verify_threat_observation_convergence.py
cd backend && python3 scripts/backfill_threat_observation_convergence.py          # dry-run
cd backend && python3 scripts/backfill_threat_observation_convergence.py --execute  # UAT only
cd backend && pytest tests/test_work_signal_lifecycle.py tests/test_verify_threat_observation_convergence.py -q
```
