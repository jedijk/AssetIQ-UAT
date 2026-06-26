# Tenant scope — canonical helpers (Platform 1.0 WS1)

All request-scoped MongoDB reads and writes must include a tenant filter derived from the authenticated user or an explicit job tenant.

## Canonical API

**`backend/services/tenant_scope.py`**

| Helper | Use when |
|--------|----------|
| `scoped(user, query=None)` | HTTP handlers and services with a `current_user` / `user` dict |
| `scoped_job(query=None, tenant_id=None)` | Background jobs, materializers, audits — uses `tenant_id` or `BACKFILL_TENANT_ID` |

Both delegate to `merge_tenant_filter` in `tenant_schema.py`.

## Domain-specific wrappers (still valid)

| Module | Helpers |
|--------|---------|
| `maintenance_tenant_scope.py` | `maintenance_scoped`, `maintenance_scoped_job`, `maintenance_scoped_tenant` |
| `maintenance_scheduler_scope.py` | `scope_scheduled_tasks_query` |
| Aggregations | `prepend_tenant_match(pipeline, user)` |

Prefer `scoped` / `scoped_job` in new code unless maintenance scheduler semantics apply.

## Investigation sub-resources

`investigation_service.py`:

- `investigation_query(user, inv_id=..., extra=...)` — parent investigation documents
- `inv_child_query(user, inv_id, extra=...)` — timeline, causes, actions, evidence, failures

## Repositories

`TenantScopedRepository` (`repositories/base.py`) applies tenant filters when `user=` is passed. Prefer repositories for new CRUD; use `scoped` for ad-hoc queries and aggregations.

## Background jobs

Set `BACKFILL_TENANT_ID` (or pass `tenant_id` to `scoped_job`) before running scripts on UAT/prod. Never run unscoped backfills in multi-tenant environments.

## Verification

```bash
cd backend && python3 scripts/tenant_service_filter_audit.py
cd backend && MONGO_URL=... DB_NAME=assetiq-UAT python3 scripts/phase2_tenancy_report.py
```

Audit heuristic: services with ≥3 `db.*.find*` calls must use tenant helpers on ≥25% of those calls (typically every read).

## WS1 completion (2026-06)

- Canonical `tenant_scope.py` introduced
- All 26 services previously flagged by `tenant_service_filter_audit.py` updated
- `insights_service`, `investigation_service`, `intelligence_map_routes_service`, and related routes aligned
- Audit script updated to recognize `scoped(`, `scoped_job(`, `investigation_query(`, `inv_child_query(`
