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

This allows tenants to see their own data **plus** unmigrated legacy rows until backfill completes. Strict `{tenant_id: tid}` filtering applies only after migration.

### Helpers (`services/tenant_schema.py`)

- `tenant_read_filter(user)` — migration-safe `$or` fragment
- `merge_tenant_filter(base_query, user)` — `$and` merge with existing query
- `with_tenant_id(doc, user)` — attach `tenant_id` on writes
- `tenant_filter(user)` — strict filter (pilot collections post-migration)

## Collection Rollout Waves

| Wave | Collections | Status |
|------|-------------|--------|
| Pilot | `work_item_projections`, `reliability_context_snapshots`, `background_jobs`, `audit_log` | Active |
| **Wave 1** | `equipment_nodes`, `threats`, `users` | Active |
| **Wave 2** | `task_instances`, `scheduled_tasks`, `central_actions`, `maintenance_programs_v2`, `equipment_type_strategies` | Active (read filters on work-items merge path) |
| Wave 3+ | Remaining domain collections | Planned |

## Wave 1 Route Changes

- **equipment_nodes** — tenant filter on list/find; `with_tenant_id` on node create
- **threats** — tenant filter merged into `build_threat_filter` results; `with_tenant_id` on threat updates
- **users** — tenant scope on `get_users` / `pending`; `with_tenant_id` on admin user create

## Index Strategy

Pilot collections already carry compound indexes `(tenant_id, user_id, updated_at)`. Wave 1 collections should add `{tenant_id: 1}` indexes during backfill (see `scripts/create_indexes.py`).

## Middleware Wiring

Registered in `server.py` after CORS, timeout, gzip, and security middleware:

```python
from middleware.tenant_context import TenantContextMiddleware
app.add_middleware(TenantContextMiddleware)
```

## Testing

`backend/tests/test_tenant_schema.py` covers helper behavior including migration-safe `$or` filters and `merge_tenant_filter` composition.
