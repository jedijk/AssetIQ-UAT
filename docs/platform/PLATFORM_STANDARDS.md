# Platform Engineering Standards (Platform 1.0 WS8)

**Objective:** Document engineering conventions and enforce them in CI so new code cannot regress architecture without an explicit allowlist update.

**Status:** **Done (WS8)** — standards doc, shared check module, unified verify gate, CI integration.

Machine-readable checks: `backend/architecture/platform_standards.py`  
Verification: `cd backend && python3 scripts/verify_platform_standards.py`

---

## Layer boundaries

| Layer | Responsibility | Must not |
|-------|----------------|----------|
| `routes/` | HTTP auth, validation, delegate to services | Contain business logic or direct Mongo aggregations |
| `services/` | Domain logic, tenant-scoped reads/writes | Import `routes.*` |
| `repositories/` | Persistence helpers | Bypass tenant filters |
| `architecture/` | Registries, standards, domain maps | Import application services at module load |
| `workers/` | Async projection / graph handlers | Write operational data without tenant scope |

Green routes (thin delegation) are tracked in `architecture/convergence_registry.py` and tested in `tests/test_architecture_convergence.py`.

---

## Module size

- **Target:** service modules ≤ **800 LOC**
- **Allowlist:** `architecture/platform_standards_allowlists.py` — grandfathered modules with explicit caps
- **Growth buffer:** allowlisted modules may grow by **50 LOC** before CI fails
- **New oversized modules:** split by domain (see WS4) or add to allowlist with justification in PR

---

## Tenant scoping

All Mongo reads/writes in services must use canonical tenant helpers:

- `merge_tenant_filter`, `scoped`, `scoped_job`, `tenant_read_filter`, domain-specific `*_scoped` helpers

**CI gate:** heuristic audit flags services with ≥3 `find`/`aggregate` calls and tenant-helper ratio < 0.25. New flagged files fail CI; seven maintenance modules are grandfathered in the baseline.

Audit script (informational): `scripts/tenant_service_filter_audit.py`

See also: [`TENANT_MIDDLEWARE.md`](./TENANT_MIDDLEWARE.md)

---

## AI entry points

- **Preferred:** `services.ai_platform` (`execute_prompt`, `execute_json_prompt`, …)
- **Transport only:** `services.ai_gateway` — not called from routes directly
- **Direct `openai` imports:** allowlisted in `scripts/ai_entry_point_report.py` only

Prompt registry: `services/ai_prompt_registry.py` — see [`AI_PLATFORM.md`](./AI_PLATFORM.md)

---

## Reliability graph

- **Writes:** `dispatch_graph_sync()` only — never `upsert_edge` outside approved modules
- **Reads:** `GraphTraversalService` / materialized read models — not live operational scans on dashboard paths
- **Ownership:** `services/reliability_graph_ownership.py`

Gates: `scripts/verify_reliability_graph_sync.py`, `scripts/graph_coverage_report.py`

---

## Read models & dashboards

Executive dashboards read from snapshot collections (WS6). Invalidation via `services/dashboard_read_model_hooks.py`.

Registry: `architecture/read_models_registry.py`  
Gate: `scripts/verify_read_models_registry.py`

---

## Domain events & projections

- Publish domain events through `services/event_outbox.py`
- Read-model refresh via `services/projection_dispatch.py` → `workers/projection_handler.py`
- Graph sync via `workers/graph_projection_handler.py` when `GRAPH_SYNC_ASYNC=true`

---

## Naming & folder structure

| Artifact | Convention |
|----------|------------|
| Service modules | `{domain}_service.py`, `{domain}_{concern}.py` |
| Routes | `routes/{domain}.py` or `routes/{domain}/` |
| Read materializers | `{domain}_materializer.py` or `{domain}_summary_materializer.py` |
| Verify scripts | `scripts/verify_{gate}.py` |
| Architecture registries | `architecture/{name}_registry.py` |

---

## Error handling & logging

- Domain services raise `HTTPException` only at route boundary; services return data or raise domain errors
- Graph sync: log-and-continue unless `graph_sync_strict()` / audit mode
- Use module `logger = logging.getLogger(__name__)` — no bare `print` in services
- Slow Mongo queries: `db_monitoring.timed_find` / `timed_aggregate` on hot paths

---

## Testing expectations

| Area | Test location |
|------|---------------|
| Architecture gates | `tests/test_architecture_convergence.py`, `tests/test_architecture_boundaries.py` |
| Platform standards | `tests/test_platform_standards.py` |
| Tenant isolation | `tests/test_tenant_isolation_audit_waves.py` |
| Domain registries | `tests/test_read_models_registry.py`, etc. |

New gates require a verify script **and** at least one unit test.

---

## CI gates (WS8)

`scripts/verify_platform_standards.py` runs on every backend CI workflow:

| Gate ID | Check |
|---------|--------|
| `service_module_size` | 800 LOC limit + allowlist |
| `tenant_service_filters` | No new low-ratio tenant scoping risks |
| `ai_entry_points` | No new direct OpenAI imports |
| `service_route_boundary` | Services do not import routes |

Related gates (separate scripts, also in CI):

- `scripts/ai_entry_point_report.py` (subset of platform standards)
- `scripts/graph_coverage_report.py`
- `scripts/verify_uat_gates.py`
- `scripts/verify_read_models_registry.py`
- `scripts/verify_graph_performance_benchmarks.py`

---

## References

- [`PLATFORM_1_0_EXECUTION.md`](./PLATFORM_1_0_EXECUTION.md) — WS8 definition of done
- [`CANONICAL_DATA_MODELS.md`](./CANONICAL_DATA_MODELS.md)
- [`RELIABILITY_GRAPH_ARCHITECTURE.md`](./RELIABILITY_GRAPH_ARCHITECTURE.md)
- [`EXECUTIVE_READ_MODELS.md`](./EXECUTIVE_READ_MODELS.md)
- [`GRAPH_PERFORMANCE_BENCHMARKS.md`](./GRAPH_PERFORMANCE_BENCHMARKS.md)
