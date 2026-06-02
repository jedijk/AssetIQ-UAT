# AssetIQ Technical Debt Remediation Report

**Status:** In progress (Priority 1 foundation delivered)  
**Date:** June 2026

## Executive summary

Stabilization work focuses on production reliability without changing product behavior. The first delivery unifies caching, adds AI cost guards, structured request logging, optional Sentry, coordinated equipment cache invalidation, and an application metrics endpoint.

## Completed (Priority 1 – partial)

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

## Pending (by priority)

| Priority | Item | Status |
|----------|------|--------|
| P1 | Wire AI guard on all non–`ai_helpers` OpenAI call sites | Pending |
| P1 | Mongo slow-query logging (>500ms) | Pending |
| P2 | Background job framework (retries, DLQ) | Pending |
| P2 | Queue health in `/api/metrics` | Pending |
| P3 | Split `maintenance_strategy_v2.py` | Pending |
| P3 | Refactor `ProductionDashboardPage.js` | Pending |
| P4 | Index audit + documentation | Pending |
| P4 | Query performance pass | Pending |
| P5 | Security headers, request size limits, log secret masking | Pending |

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
