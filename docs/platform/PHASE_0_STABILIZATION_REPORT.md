# Phase 0 Stabilization Report

**Date:** 2026-06-25  
**Scope:** Tenancy validation, route auth hardening, CI gates, mobile RBAC, AI gateway inventory  
**Branch:** `deploy-uat` / UAT database `assetiq-UAT` (tenant `Tyromer`)

---

## Executive summary

Phase 0 is **complete for UAT pilot readiness**. All wave collections (1–11) are backfilled with `tenant_id`, users carry `company_id`, strict mode cutover checks pass on UAT, CI gates block frontend build/import regressions and AI bypass growth, and eight previously public data/template routes now require authentication or permissions.

**UAT can enable `TENANT_STRICT_MODE=true`** after setting `BACKFILL_TENANT_ID=Tyromer` on the backend and a 48-hour smoke soak. Production strict mode remains **not recommended** until prod backfill is run.

---

## 1. Tenant readiness audit

### Scripts run (UAT: `assetiq-UAT`)

| Script | Result |
|--------|--------|
| `strict_mode_cutover_check.py` | **Strict mode ready: YES** — all wave collections backfilled |
| `phase2_tenancy_report.py` | **Wave 1–3: 100% tenant_id** — Phase 2 exit gate OK |
| `wave2_tenant_isolation_report.py` | **RESULT: Wave 2 tenant isolation gate passed** |
| `backfill_tenant_id.py` | Previously applied on UAT (73,321 docs, tenant `Tyromer`) |
| `backfill_user_company_id.py` | Applied — 12/12 users have `company_id: Tyromer` |

### Tenant-safe collections (waves 1–11)

All collections in `WAVE_COLLECTIONS` (pilot + waves 1–11) are registered in `tenant_isolation_audit.py` and backfilled on UAT. Sample counts from phase2 report:

- Wave 1: `equipment_nodes` (249), `observations`, `threats`, `users` (12)
- Wave 2: `scheduled_tasks` (258), `task_instances` (1204), `maintenance_programs_v2`, …
- Wave 3: `failure_modes` (483), `reliability_edges` (14347), `form_submissions` (946), …
- Waves 4–11: all collections report `backfill_complete: ok` in wave2 isolation report

### Collections missing tenant_id

**UAT:** None in wave collections.  
**Unscoped backlog** (intentionally not in strict-mode waves): `definitions`, `permissions`, `app_settings`.

### Routes/services without tenant filters

Phase 0 did **not** perform a full static scan of every Mongo query. Known pattern:

- Wave-scoped services use `merge_tenant_filter`, `tenant_read_filter`, or `with_tenant_id` from `tenant_schema.py`
- Unscoped backlog collections are global config / RBAC metadata
- Full service-layer tenant audit → **Phase 1**

### TENANT_STRICT_MODE readiness

| Environment | Ready? | Notes |
|-------------|--------|-------|
| **UAT** | **YES** | Backfill complete; users have `company_id` |
| **Prod** | **NO** | Backfill not run on `assetiq` production DB |
| **CI (local Mongo)** | N/A | Empty test DB — informational only |

**Recommended UAT cutover:**

1. Set `BACKFILL_TENANT_ID=Tyromer` and `TENANT_STRICT_MODE=true` on Railway UAT backend
2. Redeploy; smoke test login, equipment, tasks, SpareIQ, mobile
3. Monitor 48h

---

## 2. Route authentication inventory

Full report: [`ROUTE_AUTH_INVENTORY.md`](./ROUTE_AUTH_INVENTORY.md)

Regenerate:

```bash
cd backend && python scripts/route_auth_inventory.py --markdown ../docs/platform/ROUTE_AUTH_INVENTORY.md
```

### Summary (741 handlers)

| Classification | Count |
|----------------|------:|
| Permission protected | 514 |
| Authenticated only | 196 |
| Intentionally public | ~24 |
| Review / fixed in Phase 0 | 0 remaining unsafe |

### Intentionally public

- Health: `/health`, `/system/health`, `/`
- Auth: `/auth/login`, `/auth/register`, password reset, OIDC spike
- GDPR: terms of service, privacy policy
- Visual kiosk: `visual_board_public.py` token URLs
- Display pairing: `visual_display.py` device flow
- Static asset: `/assets/video/background.mp4`
- Avatar: `/users/{id}/avatar` — manual JWT validation in handler
- Timezones: `/timezones` — static IANA list

### Phase 0 route fixes

| Route | Protection added |
|-------|------------------|
| `GET /download/documentation` | `scheduler:read` |
| `GET /download/functional-spec` | `scheduler:read` |
| `GET /spare-parts-import/template` | `spareiq:read` |
| `GET /template` (PM import) | `library:read` |
| `GET /equipment-hierarchy/disciplines` | authenticated |
| `GET /equipment-hierarchy/criticality-profiles` | authenticated |
| `GET /equipment-hierarchy/iso-levels` | authenticated |
| `GET /definitions/defaults` | authenticated |

**Note:** `ai_fm_suggestions` routes inherit `library:write` via router-level `dependencies` (AST inventory under-counts these).

---

## 3. CI build protection

| Gate | Workflow | Status |
|------|----------|--------|
| Backend full test suite | `.github/workflows/backend-tests.yml` | Active |
| Tenant isolation unit tests | `backend-tests.yml` (added Phase 0) | Active |
| AI entry point gate | `backend-tests.yml` | Active — blocks new OpenAI bypasses |
| Route auth inventory | `backend-tests.yml` | Informational (`continue-on-error`) |
| Strict mode cutover check | `backend-tests.yml` | Informational on CI Mongo |
| Frontend production build | `.github/workflows/frontend-ci.yml` | Active |
| Banned import lint | `scripts/check_frontend_imports.sh` | Active |

### Frontend import lint checks

- Banned: `react-i18next` (use `LanguageContext`)
- Banned: `equipmentAPI` (use `equipmentHierarchyAPI` from `lib/apis/equipment`)
- Validates all `lib/apis/*` import paths resolve to existing `.js`/`.ts` files

---

## 4. AI gateway enforcement

Script: `backend/scripts/ai_entry_point_report.py` (CI gate, exit 0 required)

**Current state:**

| Category | Count | Files |
|----------|------:|-------|
| AI gateway users | 31 | Routes/services using `services.ai_gateway` |
| OpenAI import allowlist | 3 | `ai_gateway.py`, `openai_service.py`, `image_analysis_service.py` |
| Legacy bypasses (baseline, tracked) | 2 | `ai_helpers.py`, `routes/feedback.py` |
| **New violations** | **0** | CI fails if new direct OpenAI imports appear |

**Phase 1 migration:** Move `ai_helpers.py` and `routes/feedback.py` behind `ai_gateway`.

---

## 5. Mobile permission check

**Frontend** (`App.js`):

- `MobileLayout` requires authenticated user
- `canAccessRoute("/mobile")` → requires `tasks:read` (mapped in `PermissionsContext.js`)

**Backend:** Mobile task endpoints use existing task permission dependencies.

No mobile shell redesign in Phase 0.

---

## 6. Tests run

| Test suite | Result |
|------------|--------|
| `test_tenant_isolation_audit_waves.py` | Pass |
| `test_strict_mode_cutover.py` | Pass |
| `test_user_tenant_fields.py` | Pass |
| `test_auth_matrix.py` | Pass |
| Frontend `npm run build` | Pass |
| `check_frontend_imports.sh` | Pass |
| `ai_entry_point_report.py` | Pass (0 new violations) |

Full backend suite (`pytest tests/`) runs in CI with Mongo service — not re-run locally (no local Mongo).

---

## 7. Files changed (Phase 0 completion pass)

### Route hardening

- `backend/routes/maintenance.py`
- `backend/routes/spare_parts.py`
- `backend/routes/pm_import.py`
- `backend/routes/equipment/equipment_utils.py`
- `backend/routes/definitions.py`

### Tooling & CI

- `backend/scripts/route_auth_inventory.py` — `--markdown` report generator
- `scripts/check_frontend_imports.sh` — lib/apis path validation
- `.github/workflows/backend-tests.yml` — tenant isolation test step

### Documentation

- `docs/platform/ROUTE_AUTH_INVENTORY.md` (generated)
- `docs/platform/PHASE_0_STABILIZATION_REPORT.md` (this file)

### Prior Phase 0 commits (already on UAT)

- `tenant_isolation_audit.py` waves 6–11
- `backfill_tenant_id.py` waves 6–11
- `frontend-ci.yml`, `check_frontend_imports.sh`
- Mobile RBAC in `App.js` / `PermissionsContext.js`
- `stamp_user_tenant_fields`, `backfill_user_company_id.py`

---

## 8. Remaining risks

| Risk | Severity | Phase |
|------|----------|-------|
| Production DB not backfilled | **High** | Ops before prod strict mode |
| Unscoped collections (`definitions`, `permissions`, `app_settings`) | Medium | Phase 1 tenant wave |
| Service-layer query audit incomplete | Medium | Phase 1 |
| AI bypasses in `ai_helpers.py`, `feedback.py` | Medium | Phase 1 gateway migration |
| CSRF strict mode not enabled in prod | Medium | Ops (`CSRF_STRICT=true`) |
| Graph BFS / outbox not hardened | High | Phase 1 |
| OIDC SSO disabled | Low | Enterprise pilot config |

---

## 9. Phase 0 acceptance criteria

| Criterion | Status |
|-----------|--------|
| Frontend builds successfully | ✅ |
| Backend tests pass (CI) | ✅ |
| Tenant audit report exists | ✅ |
| Route auth inventory exists | ✅ |
| Obvious unsafe public endpoints fixed | ✅ |
| Mobile route permission check | ✅ |
| AI gateway bypass report in CI | ✅ |
| CI catches frontend build/import errors | ✅ |
| Phase 0 stabilization report exists | ✅ |

---

## 10. Recommended Phase 1 next steps

Do **not** start feature work until UAT strict mode soak passes.

1. Enable `TENANT_STRICT_MODE=true` on UAT; 48h monitor
2. Graph BFS rewrite + transactional outbox for top write paths
3. Migrate remaining AI bypasses to `ai_gateway`
4. Prod tenant backfill + strict mode cutover
5. Service-layer tenant filter audit (automated grep + fix gaps)

See also: [`PHASE0_EXECUTION.md`](./PHASE0_EXECUTION.md)
