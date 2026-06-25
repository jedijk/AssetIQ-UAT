# Phase 0 — Stop the Bleeding

Security baseline and CI gates before Phase 1 (graph/outbox) work.

## Status

| ID | Task | Status | Notes |
|----|------|--------|-------|
| A1 | Tenant readiness scripts | **Run on UAT/prod** | Requires `MONGO_URL` — not runnable locally without Mongo |
| A2 | Backfill waves 6–11 | **Ready** | `backfill_tenant_id.py --wave6` … `--wave11` added |
| A3 | Strict mode on UAT | **Pending ops** | Set `TENANT_STRICT_MODE=true` after A1/A2 pass |
| A4 | Tenant audit waves 6–11 | **Done** | `tenant_isolation_audit.py` + tests |
| A5 | Unscoped backlog documented | **Done** | `definitions`, `permissions`, `app_settings` |
| A6 | Route auth inventory | **Done** | `backend/scripts/route_auth_inventory.py` |
| A7 | Close public routes | **Pending review** | Run inventory on UAT; fix or document each |
| A8 | Mobile RBAC | **Done** | `/mobile` gated via `tasks:read` |
| A9 | CSRF strict prod | **Pending ops** | Set `CSRF_STRICT=true` in prod env |
| F1 | Frontend build CI | **Done** | `.github/workflows/frontend-ci.yml` |
| F2 | Import lint | **Done** | `scripts/check_frontend_imports.sh` |
| F3 | AI entry point CI gate | **Done** | Added to `backend-tests.yml` |
| F4 | Convergence tests | **Existing** | Full pytest suite in CI |

## Gate G0 — UAT strict mode (48h soak)

1. On UAT Mongo host:
   ```bash
   cd backend
   MONGO_URL=... DB_NAME=assetiq-UAT python scripts/strict_mode_cutover_check.py
   MONGO_URL=... DB_NAME=assetiq-UAT python scripts/phase2_tenancy_report.py
   ```
2. Fix blockers:
   ```bash
   MONGO_URL=... BACKFILL_TENANT_ID=<default-co> python scripts/backfill_tenant_id.py --dry-run
   MONGO_URL=... python scripts/backfill_tenant_id.py --create-indexes
   # Or per wave: --wave1 … --wave11
   ```
3. Set `TENANT_STRICT_MODE=true` on UAT Railway/Vercel backend env.
4. Run full test suite + manual smoke (login, threats, tasks, SpareIQ, mobile).
5. Monitor 48h — no cross-tenant 404/empty data reports.

## Commands

```bash
# Route auth — list public endpoints
cd backend && python scripts/route_auth_inventory.py --public-only

# Full inventory JSON
cd backend && python scripts/route_auth_inventory.py --json reports/route_auth.json

# AI bypass check (must exit 0)
cd backend && python scripts/ai_entry_point_report.py

# Frontend gates
bash scripts/check_frontend_imports.sh
cd frontend && npm run build

# Tenant tests
cd backend && MONGO_URL=mongodb://localhost:27017/test DB_NAME=test python -m pytest tests/test_tenant_isolation_audit_waves.py tests/test_strict_mode_cutover.py -q
```

## Public routes — review checklist

After running `route_auth_inventory.py --public-only`, each handler must be either:

- Intentionally public (health, login, kiosk token, template download), **documented**
- Fixed with `require_permission` or `get_current_user`

Known candidates from due diligence:

- `routes/maintenance.py` — documentation downloads
- `routes/spare_parts.py` — import template GET
- `routes/pm_import.py` — template download
- `routes/definitions.py` — `/definitions/defaults`
- `routes/assets.py` — background video

## Next (Phase 1)

Do not start until **G0 passed** on UAT:

- Graph BFS rewrite (`reliability_graph_query.py`)
- `GRAPH_SYNC_ASYNC=true` + outbox monitoring
- Transactional outbox for top write paths
- AI gateway migration for bypass files
