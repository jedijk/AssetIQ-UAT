# External Observation API — Technical Reference

Machine-to-machine ingestion endpoint for third-party systems to create observations in AssetIQ.

**Functional specification:** [`EXTERNAL_API_PLATFORM_FUNCTIONAL_SPEC.md`](./EXTERNAL_API_PLATFORM_FUNCTIONAL_SPEC.md)  
**Third-party onboarding:** Settings → External API Access → **Download integration guide** (Markdown, no secrets)

---

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
| `media_urls` | No | Related media URLs |
| `measured_values` | No | Structured readings |
| `location` | No | Location hint |
| `tags` | No | Additional labels |
| `metadata` | No | Opaque metadata stored with payload audit |
| `idempotency_mode` | No | `return_existing` (default) or `conflict` |

> **Spec note:** The functional specification lists separate *Title* and *Reported Timestamp* fields. Phase 1 uses `description` as the primary text field and sets creation time server-side. Future API versions may add explicit `title` and `reported_at` without breaking existing clients.

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

AI-assisted matching is deferred (see functional spec §15).

### Processing pipeline

1. Validate payload and authenticate API key
2. Duplicate check
3. Equipment match
4. Create observation via canonical `create_work_signal` lifecycle (`source=external_system`)
5. Store original payload in `external_observation_payloads`
6. Audit request in `external_api_requests`
7. Domain events and graph sync (automatic via lifecycle)

### Responses

| Code | Meaning |
|------|---------|
| **201** | Observation created |
| **200** | Duplicate; existing observation returned |
| **401** | Invalid/missing key |
| **403** | Missing scope or IP not allowed |
| **409** | Conflicting duplicate |
| **422** | Validation error |
| **429** | Rate limit exceeded |

Example success body:

```json
{
  "observation_id": "obs-uuid",
  "status": "open",
  "equipment_match": {
    "equipment_id": "equip-uuid",
    "tag": "P-101",
    "name": "Cooling Water Pump",
    "match_type": "tag_exact",
    "confidence": 90
  },
  "duplicate": false,
  "created_at": "2026-06-29T12:00:00+00:00"
}
```

---

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

---

## Settings UI

**Settings → External API Access** (`/settings/external-api`)

- Create API keys with scope selection (`observations:create`, `equipment:read`)
- Enable/disable, revoke, rotate
- View usage: requests, errors, observations/equipment counts, health status, **24h/7d/30d/12mo trends**
- **Download integration guide** — shareable Markdown for third-party vendors (no API keys or tenant secrets; uses current environment base URL)

---

## MongoDB collections

| Collection | Purpose |
|------------|---------|
| `external_api_keys` | Hashed keys, scopes, rate limits, usage counters |
| `external_api_requests` | Per-request audit (no plaintext keys) |
| `external_observation_payloads` | Original payloads + dedup index |

---

## OpenAPI

- `GET /api/v1/external/openapi-info` — summary document
- `GET /api/v1/external/openapi.json` — static OpenAPI 3 export (observations + equipment)
- Full route metadata is embedded on endpoints via FastAPI

---

## Equipment read APIs

### Hierarchy

```
GET /api/v1/external/installations/{installation_id}/hierarchy
```

Scope: `equipment:read`

Query: `include_inactive` (default true), `include_metadata` (default true), `max_depth`, `flat` (default false), `last_modified_after`

### Detail

```
GET /api/v1/external/equipment/{equipment_id}
```

Scope: `equipment:read`

Returns equipment object with `criticality`, `operational_summary`, optional `metadata`, and `maintenance_summary`.

---

## Example (observation)

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

Replace `$BASE` and `YOUR_KEY` with values from your AssetIQ administrator. Prefer the downloaded integration guide when sharing instructions with external teams.

---

## Deferred / future

- Additional scopes (`tasks:*`, `forms:submit`, etc.)
- Optional AI-assisted equipment matching
- Dedicated external equipment mapping admin UI
- Webhook callbacks on observation create
- Explicit `title` and `reported_at` payload fields

See [`EXTERNAL_API_PLATFORM_FUNCTIONAL_SPEC.md`](./EXTERNAL_API_PLATFORM_FUNCTIONAL_SPEC.md) for the full roadmap and acceptance criteria.
