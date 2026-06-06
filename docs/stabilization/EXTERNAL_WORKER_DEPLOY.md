# External Background Worker — UAT / Production Checklist

Run long-running Apply Strategy and other durable jobs in a **separate worker process** so the API stays responsive.

## Architecture

| Service | Role |
|---------|------|
| **API** (`backend/railway.toml`) | FastAPI via uvicorn; enqueues jobs when external worker is enabled |
| **Worker** (`railway.worker.toml`) | Polls `background_jobs` and executes handlers |

Local development: `docker compose up` starts API + Mongo; add worker with `docker compose --profile worker up`.

## Required Environment Variables

### API service (UAT + production)

| Variable | Value | Notes |
|----------|-------|-------|
| `USE_EXTERNAL_BACKGROUND_WORKER` | `true` | API must not run jobs in-process |
| `MONGO_URL` | *(shared)* | Same cluster as worker |

### Worker service (UAT + production)

| Variable | Value | Notes |
|----------|-------|-------|
| `MONGO_URL` | *(shared)* | Same as API |
| `WORKER_TENANT_ID` | *(optional)* | Scope worker to one tenant |

Worker does **not** need `USE_EXTERNAL_BACKGROUND_WORKER`.

## Railway Setup

1. **API service** — existing deploy from `backend/` using `railway.toml`.
2. **Worker service** — new service, same repo, root `backend/`, start command:
   ```
   python scripts/run_background_worker.py
   ```
   Or reference `railway.worker.toml` at repo root.
3. Set `USE_EXTERNAL_BACKGROUND_WORKER=true` on the API only.
4. Confirm both services share `MONGO_URL` and can reach MongoDB.

## Verification

1. Trigger an Apply Strategy batch from the UI.
2. API returns quickly with a job id; worker logs show claim/execute.
3. `background_jobs` collection shows `completed` status after worker run.

## Local docker-compose

```bash
docker compose up -d          # mongo + API (USE_EXTERNAL_BACKGROUND_WORKER=true)
docker compose --profile worker up -d   # optional worker sidecar
curl http://localhost:8000/health
```
