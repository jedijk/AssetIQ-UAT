# Logging & Monitoring Runbook

## Request tracing

1. Every HTTP response includes `X-Request-ID` and `X-Correlation-ID`.
2. Pass `X-Correlation-ID` from the frontend for end-to-end traces.
3. Search logs: `request_id=<uuid>` or `correlation_id=<uuid>`.

## JSON logging (production)

```bash
export LOG_FORMAT=json
```

Log lines include `request_id`, `correlation_id`, `duration_ms`, `path`, `status_code`, and optional `user_id`.

## Slow requests

- Default warning threshold: **1000ms** (`SLOW_API_MS`)
- Legacy timeout middleware still logs requests **>5s**

## Cache troubleshooting

1. Call `GET /api/system/cache-stats` (owner).
2. After equipment edit, confirm log: `cache invalidate_domain` with `domain=equipment`.
3. If stale data persists, `POST /api/equipment-hierarchy/refresh` clears equipment caches.

## AI limits

Environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `AI_RATE_LIMIT_USER_PER_MINUTE` | 20 | Burst limit per user |
| `AI_RATE_LIMIT_COMPANY_PER_MINUTE` | 100 | Burst limit per company |
| `AI_DAILY_USER_REQUEST_LIMIT` | 500 | Daily requests per user |
| `AI_DAILY_COMPANY_REQUEST_LIMIT` | 5000 | Daily requests per company |
| `AI_DAILY_SPEND_CAP_USD` | 50 | Estimated daily spend cap |
| `AI_COST_PER_1K_TOKENS_USD` | 0.002 | Cost estimation |

HTTP **429** indicates limit exceeded. Check `/api/metrics` → `ai_usage_daily`.

## Sentry

```bash
export SENTRY_DSN=https://...
export SENTRY_ENVIRONMENT=production
export SENTRY_TRACES_SAMPLE_RATE=0.1
```

Unset `SENTRY_DSN` to disable (default).

## Application metrics

`GET /api/metrics` (owner/admin): database ping, cache stats, AI daily summary.

## UAT gates & background jobs

**UAT cutover checklist** — run drift + v2 program coverage gates:

```bash
cd backend && MONGO_URL=mongodb://... python scripts/verify_uat_gates.py
```

Exit `0` = all gates passed; `2` = one or more gates failed.

**External background worker** — set `USE_EXTERNAL_BACKGROUND_WORKER=true` so the API only enqueues jobs to MongoDB; `run_background_worker.py` executes them (Railway sidecar).

**background_jobs indexes** — `background_jobs` indexes (claim queue + tenant-scoped workers) are created automatically at API startup via `scripts/create_indexes.py`.

**Worker tenant scoping** — set `WORKER_TENANT_ID=<company_id>` on a dedicated worker instance to claim only that tenant's jobs (matches `tenant_id` on `background_jobs` records). Omit for a shared worker that processes all tenants.

**Job polling** — async apply-strategy and PM Import AI review return `job_id`; poll:

- `GET /maintenance-scheduler/jobs/{job_id}`
- `GET /pm-import/jobs/{job_id}`
