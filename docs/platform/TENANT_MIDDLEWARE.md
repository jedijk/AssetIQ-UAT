# Tenant Middleware — Multi-Tenant Isolation Design

## Overview

AssetIQ is moving toward **tenant-scoped data isolation** where each organization's data is keyed by `tenant_id` (sourced from the authenticated user's `company_id` or `organization_id` JWT fields).

## Tenant ID Source

| Field | Priority |
|-------|----------|
| `user.company_id` | 1 (preferred) |
| `user.organization_id` | 2 (fallback) |

When neither is present, the user is treated as **legacy single-tenant** — no tenant filter is applied.

## Request Flow

```
HTTP Request
    → TenantContextMiddleware (sets request.state.tenant_id)
    → Route handler (Depends get_current_user)
    → merge_tenant_filter(base_query, user) on reads
    → with_tenant_id(doc, user) on inserts
```

`TenantContextMiddleware` runs after structured logging / security middleware and uses `get_optional_user_from_request` so unauthenticated paths (health checks) pass through with `tenant_id = None`.

## Migration-Safe Read Filter

During rollout, legacy documents may lack `tenant_id`. Wave collections use a migration-safe filter:

```python
{"$or": [{"tenant_id": "<tid>"}, {"tenant_id": {"$exists": False}}]}
```

This allows tenants to see their own data **plus** unmigrated legacy rows until backfill completes.

### Strict mode (post-migration)

Set `TENANT_STRICT_MODE=true` to use strict `{tenant_id: tid}` filtering on all reads (no legacy `$exists: false` bleed).

### Helpers (`services/tenant_schema.py`)

- `tenant_read_filter(user)` — migration-safe or strict `$or` / exact match
- `merge_tenant_filter(base_query, user)` — `$and` merge with existing query
- `with_tenant_id(doc, user)` — attach `tenant_id` on writes
- `tenant_filter(user)` — strict filter (pilot collections post-migration)
- `prepend_tenant_match(pipeline, user)` — tenant `$match` for aggregations
- `ensure_tenant_indexes(db)` — idempotent `{tenant_id: 1}` indexes

## Collection Rollout Waves

| Wave | Collections | Status |
|------|-------------|--------|
| Pilot | `work_item_projections`, `reliability_context_snapshots`, `background_jobs`, `audit_log` | Active |
| **Wave 1** | `equipment_nodes`, `threats`, `users` | Active |
| **Wave 2** | `task_instances`, `scheduled_tasks`, `central_actions`, `maintenance_programs_v2`, `equipment_type_strategies` | Active |
| **Wave 3** | `failure_modes`, `form_templates`, `form_submissions`, `investigations`, investigation sub-collections, `reliability_edges`, `pm_import_sessions` | Active |
| Wave 4+ | Remaining domain collections | Planned |

## Wave 3 Route / Service Changes

- **failure_modes** — `get_all` / `create` tenant-scoped in `services/failure_modes/crud.py`
- **form_templates** — `get_templates` / `create_template` in `form_service.py`
- **investigations** — CRUD + sub-documents (`timeline_events`, `cause_nodes`, …) via `_inv_query` / `with_tenant_id`
- **Analytics** — `intelligence_map`, `/stats`, `/reliability-scores`, executive KPIs merge tenant filters

## Backfill

```bash
# Preview
MONGO_URL=... python scripts/backfill_tenant_id.py --dry-run

# Apply (optional default for docs without created_by user)
MONGO_URL=... BACKFILL_TENANT_ID=co-default python scripts/backfill_tenant_id.py --create-indexes
```

Backfill resolves `tenant_id` from `created_by` / `user_id` / `owner_id` user records when possible.

## Index Strategy

Run `ensure_tenant_indexes(db)` or backfill with `--create-indexes`. Wave collections should carry `{tenant_id: 1}` before strict mode.

## Middleware Wiring

Registered in `server.py` after CORS, timeout, gzip, and security middleware:

```python
from middleware.tenant_context import TenantContextMiddleware
app.add_middleware(TenantContextMiddleware)
```

## Testing

`backend/tests/test_tenant_schema.py` covers helper behavior including migration-safe `$or` filters, strict mode, and `merge_tenant_filter` composition.

## Work Execution (related)

Hybrid work-item reads and bridge env flags are documented in [WORK_EXECUTION.md](./WORK_EXECUTION.md).

## Rate Limiting (related)

Global API limits use `DEFAULT_RATE_LIMIT` (default `120/minute`) and `RATE_LIMIT_ENABLED`. Health paths `/`, `/health`, `/api/health` are exempt. See `middleware/rate_limit.py`.
