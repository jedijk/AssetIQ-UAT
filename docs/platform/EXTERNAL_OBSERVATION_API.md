# External Observation API

Machine-to-machine ingestion endpoint for third-party systems to create observations in AssetIQ.

## Endpoint

```
POST /api/v1/external/observations
```

### Authentication

Provide the tenant API key using either header:

- `Authorization: Bearer aiq_live_...`
- `X-API-Key: aiq_live_...`

Keys require scope `observations:create`. Optional IP allowlists and per-key rate limits apply.

### Request body

| Field | Required | Description |
|-------|----------|-------------|
| `source_system` | Yes | Identifier for the originating system (e.g. `cmms`, `pi-historian`) |
| `external_reference` | Yes | Unique reference within source system (dedup key) |
| `description` | Yes | Observation description |
| `equipment_id` | No | AssetIQ equipment ID (highest match priority) |
| `external_equipment_id` | No | Mapped via `equipment_nodes.external_mappings.{source_system}` |
| `equipment_tag` | No | Exact tag match |
| `equipment_name` | No | Exact or fuzzy name match |
| `severity` | No | Default `medium` |
| `observation_type` | No | Default `general` |
| `idempotency_mode` | No | `return_existing` (default) or `conflict` |

### Duplicate detection

Uniqueness: `tenant_id + source_system + external_reference`.

- **`return_existing`**: repeats return HTTP 200 with the existing observation.
- **`conflict`**: same reference with a different payload returns HTTP 409.

### Equipment matching priority

1. AssetIQ `equipment_id`
2. External mapping on equipment node
3. Exact tag
4. Exact name
5. Fuzzy name

If no match: observation is created with status `equipment_match_required`.

### Processing pipeline

1. Validate payload and authenticate API key
2. Duplicate check
3. Equipment match
4. Create observation via canonical `create_work_signal` lifecycle (`source=external_system`)
5. Store original payload in `external_observation_payloads`
6. Audit request in `external_api_requests`
7. Domain events and graph sync (automatic via lifecycle)

### Responses

- **201** — observation created
- **200** — duplicate, existing observation returned
- **401** — invalid/missing key
- **403** — missing scope or IP not allowed
- **409** — conflicting duplicate
- **429** — rate limit exceeded

## Admin API (Settings UI)

Base path: `/api/admin/external-api`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/keys` | List keys (prefix only, never plaintext) |
| POST | `/keys` | Create key (plaintext shown once) |
| GET | `/keys/{id}` | Key details |
| PATCH | `/keys/{id}` | Update name, scopes, rate limit, IP allowlist, enabled |
| POST | `/keys/{id}/revoke` | Revoke key |
| POST | `/keys/{id}/rotate` | Rotate with grace period (default 24h) |
| GET | `/keys/{id}/usage` | Usage stats and recent requests |

Requires authenticated **owner** or **admin** role.

## Settings UI

**Settings → Integrations → External API Access** (`/settings/external-api`)

- Create API keys (show once)
- Enable/disable, revoke, rotate
- View usage: requests, errors, observations created, health status

## MongoDB collections

| Collection | Purpose |
|------------|---------|
| `external_api_keys` | Hashed keys, scopes, rate limits, usage counters |
| `external_api_requests` | Per-request audit (no plaintext keys) |
| `external_observation_payloads` | Original payloads + dedup index |

## OpenAPI

`GET /api/v1/external/openapi-info` returns a summary document. Full OpenAPI metadata is embedded on the POST route via FastAPI.

## Example

```bash
curl -X POST "$BASE/api/v1/external/observations" \
  -H "Authorization: Bearer aiq_live_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source_system": "cmms",
    "external_reference": "WO-12345",
    "description": "High vibration detected on pump",
    "equipment_tag": "P-101",
    "severity": "high"
  }'
```

## Deferred / future

- Optional AI-assisted equipment matching (`ai_execute_grounded`)
- Dedicated external equipment mapping admin UI
- Webhook callbacks on observation create
- OpenAPI JSON export at `/api/v1/external/openapi.json`
