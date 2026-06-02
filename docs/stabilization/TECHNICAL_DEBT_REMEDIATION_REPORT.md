# AssetIQ Technical Debt Remediation Report

**Status:** Priorities 1–5 foundation delivered (June 2026)  
**Date:** June 2026

## Executive summary

Stabilization work improves production reliability without changing product behavior. Delivered: unified cache, AI guards, observability, background job tracking, maintenance strategy module split, production dashboard extraction, index migration script, and security middleware.

## Completed (Priority 1)

### Unified cache architecture

- **New:** `backend/services/unified_cache.py` — single service for entity caches (equipment, users, failure modes, stats) and query caches.
- **Facades:** `cache_service.py` and `query_cache.py` delegate to unified cache (backwards compatible imports).
- **Invalidation:** `invalidate_equipment_related()` / `invalidate_domain()` invalidate hierarchy query keys, dashboard keys, and entity equipment caches together.
- **Metrics:** hits, misses, invalidations, entity sizes exposed via `get_stats()`.
- **Logging:** cache events logged with structured `extra` fields.

### AI cost protection

- **New:** `backend/services/ai_cost_guard.py`
- Per-user and per-company per-minute rate limits (env-configurable).
- Daily request limits and daily spend cap (USD estimate).
- HTTP 429 with clear messages when exceeded.
- Integrated into `ai_helpers.chat_completions_create()` for all chat completion calls in that module.

### Structured logging

- **New:** `backend/middleware/structured_logging.py`
- Request ID and correlation ID (headers `X-Request-ID`, `X-Correlation-ID`).
- Per-request duration logging; warnings for slow requests (default ≥1000ms).
- Optional JSON logging when `LOG_FORMAT=json`.

### Error monitoring

- **New:** `backend/middleware/sentry_init.py`
- Enabled only when `SENTRY_DSN` is set; disabled by default.

### Metrics endpoint

- **New:** `GET /api/metrics` (owner/admin) — database ping, unified cache stats, daily AI usage summary.

### Tests

- `backend/tests/test_unified_cache.py` — hit/miss, equipment invalidation, domain invalidation.

## Completed (Priority 2)

- **`services/background_jobs.py`** — retries, exponential backoff, dead-letter status in MongoDB `background_jobs`
- **`schedule_tracked_job()`** — wired for equipment translation and maintenance task translation jobs
- **`GET /api/metrics`** — includes real `queue` health from job service

## Completed (Priority 3)

- **`routes/maintenance_strategy_v2/`** package: `propagation.py`, `strategy_helpers.py`, `routes.py` (endpoints)
- **`features/production/dashboard/productionDashboardShared.jsx`** — KPI cards, charts, waste panel, form dialog, filter storage (~570 lines extracted from page)

## Completed (Priority 4)

- **`migrations/create_indexes_stabilization.py`** — indexes for equipment tag/level, maintenance programs, scheduled tasks, background jobs
- **`services/db_monitoring.py`** — slow-query logging helpers (`SLOW_QUERY_MS`, default 500ms)

## Completed (Priority 5)

- **`middleware/security.py`** — security headers + request body size limit (`MAX_REQUEST_BODY_BYTES`)
- **Secret masking** in structured logging for sensitive field names
- **`SECURITY_REVIEW_SUMMARY.md`** updated

## Remaining follow-ups

| Item | Status |
|------|--------|
| Wire `schedule_tracked_job` on all remaining `BackgroundTasks` call sites | Partial |
| Wire AI guard on routes outside `ai_helpers` | Pending |
| Run `create_indexes_stabilization.py` on UAT/prod DB | Ops task |
| Multi-instance rate limits (Redis) for AI + jobs | Future |

## Before/after performance metrics

Baseline benchmarks were not captured in this pass. After deployment, compare:

- Equipment hierarchy `GET /api/equipment-hierarchy/nodes` p95 latency
- Cache hit rate via `GET /api/system/cache-stats` or `/api/metrics`
- AI 429 rate and daily spend from logs / `ai_usage_daily`

## Risk notes

- AI rate limits use in-process counters (per instance). For multi-instance production, move limits to Redis or MongoDB.
- Unified cache remains in-memory; restart clears all entries (same as before).

## Next recommended steps

1. Deploy P1 changes to UAT; verify equipment criticality + hierarchy freshness.
2. Add AI guard to `routes/ai_*.py` entry points with real `user_id` / `company_id`.
3. Implement P2 job queue before further feature work.
