# Tenant isolation — Phase 2

## Scope hierarchy

1. **tenant_id wins** — Every read/write on wave collections is scoped to the user's
   `company_id` / `organization_id` (stored as `tenant_id` on documents).
2. **Installation filter is sub-scope** — Within a tenant, users may only see equipment,
   threats, and actions for their assigned installations (unless `owner` role).
3. **Owner role** — Bypasses installation filtering but still respects tenant scope when
   `TENANT_STRICT_MODE=true`.

## Migration vs strict mode

| Mode | Env | Read behaviour |
|------|-----|----------------|
| Migration (default) | `TENANT_STRICT_MODE=false` | `{tenant_id: user}` **OR** `{tenant_id: {$exists: false}}` |
| Strict | `TENANT_STRICT_MODE=true` | `{tenant_id: user}` only |

Enable strict mode **only after** Wave 2 backfill reaches 100%:

```bash
cd backend && MONGO_URL=... python scripts/backfill_tenant_id.py --wave2 --create-indexes
cd backend && MONGO_URL=... python scripts/phase2_tenancy_report.py
# When report says Wave 2 OK → set TENANT_STRICT_MODE=true on staging, then UAT, then prod
```

## Backfill

```bash
# Preview Wave 2 (work execution + maintenance programs)
MONGO_URL=... python scripts/backfill_tenant_id.py --wave2 --dry-run

# Apply + indexes
MONGO_URL=... BACKFILL_TENANT_ID=co-default python scripts/backfill_tenant_id.py --wave2 --create-indexes

# All waves
MONGO_URL=... python scripts/backfill_tenant_id.py --create-indexes
```

Resolution order for missing `tenant_id`:

1. Lookup `created_by` / `user_id` / `owner_id` on the document → user's `company_id`
2. Fallback to `BACKFILL_TENANT_ID` env (single-tenant migration)

## Phase 2 report

```bash
cd backend && MONGO_URL=... ENVIRONMENT=uat python scripts/phase2_tenancy_report.py
```

Exit `0` = Wave 2 backfilled and `TENANT_STRICT_MODE=true`.

## OIDC enterprise pilot (step 5)

Enable on Railway when ready:

```
OIDC_ENABLED=true
OIDC_ISSUER=https://login.microsoftonline.com/{tenant}/v2.0
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
OIDC_REDIRECT_URI=https://your-app/api/auth/oidc/callback
```

Routes: `GET /api/auth/oidc/config`, `GET /api/auth/oidc/login`, `GET /api/auth/oidc/callback`.

## Critical endpoints with tenant filters

- `GET /api/threats` — `merge_tenant_filter` + installation scope
- `GET /api/actions` — `merge_tenant_filter` + installation scope
- `GET /api/work-items` — `merge_tenant_filter` in `work_item_query`
- `GET /api/investigations/*` — `_inv_query` uses `merge_tenant_filter`
- `GET /api/equipment-nodes/*` — `merge_tenant_filter` on node queries

Automated isolation tests: `backend/tests/test_tenant_isolation.py`
