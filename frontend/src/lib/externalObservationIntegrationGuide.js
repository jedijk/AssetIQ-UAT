/**
 * Generates a shareable integration guide for third-party observation ingestion.
 * Contains no API keys, tenant IDs, or other secrets — only public API contract details.
 */

const GUIDE_VERSION = "1.1";

export function buildExternalObservationIntegrationGuide(baseUrl) {
  const origin = (baseUrl || "https://your-assetiq-instance.example.com").replace(/\/$/, "");
  const endpoint = `${origin}/api/v1/external/observations`;

  return `# AssetIQ External API — Integration Guide

Version: ${GUIDE_VERSION}  
Document type: Third-party integration instructions (safe to share)

---

## 1. Overview

This guide explains how external systems (CMMS, historians, inspection apps, BI platforms, custom middleware) can integrate with AssetIQ using a machine-to-machine REST API.

**Write API:** submit **observations** into AssetIQ.  
**Read API:** retrieve **equipment hierarchy** and **equipment detail** for Digital Twin, reporting, and sync workflows.

Each observation request creates (or idempotently returns) an observation in the target tenant. Equipment read APIs return tenant-scoped hierarchy and operational summaries.

**What you need from your AssetIQ administrator**

1. The **base URL** of your AssetIQ environment (see Section 2).
2. An **API key** with the required scope(s):
   - \`observations:create\` — observation ingest
   - \`equipment:read\` — equipment hierarchy and detail
3. Optional: approved **source system** identifier and equipment mapping conventions.

> **Security:** Never embed API keys in this document, source code repositories, or email. Store keys in a secrets manager and rotate them if exposed.

---

## 2. Environment base URL

Replace the placeholder below with the URL provided by your AssetIQ administrator:

\`\`\`
${origin}
\`\`\`

All API paths in this guide are relative to this base URL.

---

## 3. Authentication

Send your API key on every request using **one** of these headers:

| Header | Example |
|--------|---------|
| \`Authorization\` | \`Bearer YOUR_API_KEY\` |
| \`X-API-Key\` | \`YOUR_API_KEY\` |

- Keys begin with \`aiq_live_\`.
- Scopes are assigned per key at creation time:
  - \`observations:create\` — required for observation ingest
  - \`equipment:read\` — required for equipment hierarchy and detail endpoints
- Keys are tenant-scoped; you cannot access other organizations with the same key.
- Your administrator may configure per-key **rate limits** and **IP allowlists**.

---

## 4. Create observation endpoint

| Method | Path |
|--------|------|
| \`POST\` | \`/api/v1/external/observations\` |

**Full URL example**

\`\`\`
${endpoint}
\`\`\`

**Required headers**

\`\`\`
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY
\`\`\`

---

## 5. Request body

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| \`source_system\` | Yes | string (1–128) | Identifier for your system, e.g. \`cmms\`, \`pi-historian\`, \`inspection-app\`. Use a stable lowercase slug. |
| \`external_reference\` | Yes | string (1–256) | Unique ID in **your** system (work order, alarm ID, inspection record). Used for deduplication. |
| \`description\` | Yes | string (1–8000) | Human-readable observation text. |
| \`equipment_id\` | No | string | AssetIQ equipment node ID (highest match priority). |
| \`external_equipment_id\` | No | string | Your equipment ID, matched via \`equipment_nodes.external_mappings.{source_system}\`. |
| \`equipment_tag\` | No | string | Exact equipment tag match in AssetIQ. |
| \`equipment_name\` | No | string | Exact or fuzzy equipment name match. |
| \`severity\` | No | string | Default \`medium\`. Common values: \`low\`, \`medium\`, \`high\`, \`critical\`. |
| \`observation_type\` | No | string | Default \`general\`. |
| \`media_urls\` | No | string[] | URLs to related images or documents (if applicable). |
| \`measured_values\` | No | object[] | Structured readings (format agreed with your administrator). |
| \`location\` | No | string | Free-text location hint. |
| \`tags\` | No | string[] | Additional labels for filtering. |
| \`metadata\` | No | object | Opaque key/value metadata stored with the payload audit record. |
| \`idempotency_mode\` | No | string | \`return_existing\` (default) or \`conflict\`. See Section 7. |

### Minimal example

\`\`\`json
{
  "source_system": "cmms",
  "external_reference": "WO-12345",
  "description": "High vibration detected on pump during routine inspection."
}
\`\`\`

### Example with equipment tag and severity

\`\`\`json
{
  "source_system": "cmms",
  "external_reference": "WO-12345",
  "description": "High vibration detected on pump P-101.",
  "equipment_tag": "P-101",
  "severity": "high",
  "tags": ["vibration", "inspection"]
}
\`\`\`

---

## 6. Equipment matching

When equipment fields are provided, AssetIQ resolves equipment in this order:

1. \`equipment_id\` — AssetIQ internal ID  
2. \`external_equipment_id\` — mapped under \`external_mappings.{source_system}\`  
3. \`equipment_tag\` — exact tag match  
4. \`equipment_name\` — exact name match  
5. \`equipment_name\` — fuzzy name match  

If no match is found, the observation is still created with status \`equipment_match_required\` so reliability staff can link it manually.

Coordinate with your AssetIQ administrator on preferred matching fields and external ID mappings.

---

## 7. Idempotency and duplicates

Uniqueness key: **tenant + source_system + external_reference**.

| \`idempotency_mode\` | Behavior |
|---------------------|----------|
| \`return_existing\` (default) | Repeat submissions with the same reference return **HTTP 200** and the existing observation. |
| \`conflict\` | Same reference with a **different** payload returns **HTTP 409 Conflict**. |

**Recommendation:** Use stable \`external_reference\` values from your source system and default idempotency mode for safe retries.

---

## 8. Success response

\`\`\`json
{
  "observation_id": "obs-uuid",
  "status": "open",
  "equipment_match": {
    "equipment_id": "equip-uuid",
    "tag": "P-101",
    "name": "Cooling Water Pump",
    "match_type": "equipment_tag",
    "confidence": 90
  },
  "duplicate": false,
  "created_at": "2026-06-29T12:00:00+00:00"
}
\`\`\`

| Field | Description |
|-------|-------------|
| \`observation_id\` | AssetIQ observation identifier — store for cross-reference. |
| \`status\` | Observation workflow status (e.g. \`open\`, \`equipment_match_required\`). |
| \`equipment_match\` | Present when equipment was resolved; otherwise \`null\`. |
| \`duplicate\` | \`true\` when an existing observation was returned (HTTP 200). |
| \`created_at\` | ISO 8601 timestamp (UTC). |

---

## 9. HTTP status codes

| Code | Meaning |
|------|---------|
| **201** | Observation created successfully. |
| **200** | Duplicate request; existing observation returned. |
| **401** | Missing or invalid API key. |
| **403** | Key disabled, missing scope, or client IP not on allowlist. |
| **409** | Duplicate \`external_reference\` with conflicting payload (\`conflict\` mode). |
| **422** | Validation error — check required fields and string lengths. |
| **429** | Rate limit exceeded — back off and retry with exponential delay. |
| **5xx** | Server error — retry with backoff; contact administrator if persistent. |

Error responses typically include a \`detail\` field describing the problem.

---

## 10. Rate limits and reliability

- Default limit is **120 requests per minute** per key (your administrator may change this).
- Implement **exponential backoff** on \`429\` and \`5xx\` responses.
- Use **idempotent** \`external_reference\` values so retries are safe.
- Log \`observation_id\` from responses in your system for support correlation.

---

## 11. cURL example

\`\`\`bash
curl -X POST "${endpoint}" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "source_system": "cmms",
    "external_reference": "WO-12345",
    "description": "High vibration detected on pump P-101.",
    "equipment_tag": "P-101",
    "severity": "high"
  }'
\`\`\`

---

## 12. Python example

\`\`\`python
import requests

BASE_URL = "${origin}"
API_KEY = "YOUR_API_KEY"  # Load from environment or secrets manager

response = requests.post(
    f"{BASE_URL}/api/v1/external/observations",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "source_system": "cmms",
        "external_reference": "WO-12345",
        "description": "High vibration detected on pump P-101.",
        "equipment_tag": "P-101",
        "severity": "high",
    },
    timeout=30,
)

response.raise_for_status()
result = response.json()
print("Observation ID:", result["observation_id"])
\`\`\`

---

## 13. Security checklist for integrators

- [ ] Store API keys in a secrets manager, not in application code or config files committed to git.
- [ ] Use HTTPS only; never send keys over unencrypted connections.
- [ ] Restrict outbound integration servers to administrator-approved IP ranges when allowlists are enabled.
- [ ] Rotate keys periodically and immediately after personnel or vendor changes.
- [ ] Do not log full API keys in application or web server logs.
- [ ] Share **this guide** with vendors; share **keys** through a separate secure channel.

---

## 14. Troubleshooting

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| 401 Unauthorized | Invalid or revoked key | Request a new key from your AssetIQ administrator. |
| 403 Forbidden | IP not allowlisted or key disabled | Confirm server egress IP and key status with administrator. |
| 422 Validation error | Missing required field or value too long | Verify \`source_system\`, \`external_reference\`, and \`description\`. |
| 409 Conflict | Same reference, different payload in \`conflict\` mode | Use a new \`external_reference\` or align payload with original. |
| Equipment not linked | No matching tag/ID/name | Provide \`equipment_id\` or ask admin to configure external mappings. |
| 429 Too many requests | Rate limit hit | Reduce send rate; implement backoff. |

---

## 16. Equipment hierarchy API (read)

| Method | Path |
|--------|------|
| \`GET\` | \`/api/v1/external/installations/{installation_id}/hierarchy\` |

**Required scope:** \`equipment:read\`

**Query parameters**

| Parameter | Default | Description |
|-----------|---------|-------------|
| \`include_inactive\` | \`true\` | Include inactive equipment nodes |
| \`include_metadata\` | \`true\` | Include metadata block on each equipment object |
| \`max_depth\` | — | Optional maximum depth from installation root |
| \`flat\` | \`false\` | Return a flat list instead of nested \`children\` |
| \`last_modified_after\` | — | ISO datetime filter on \`updated_at\` |

**Response shape**

- Nested mode (\`flat=false\`): root installation object with \`children\` arrays.
- Flat mode (\`flat=true\`): \`equipment\` is an array of objects without \`children\`.
- Each equipment object includes identification fields, \`equipment_path\`, \`depth\`, \`criticality\`, \`operational_summary\`, and optional \`metadata\`.

**Operational summary fields**

| Field | Description |
|-------|-------------|
| \`open_observation_count\` | Open observations/threats linked to the asset |
| \`open_planned_task_count\` | Open scheduled tasks and task instances |
| \`active_maintenance_program\` | Whether a maintenance program is active |
| \`last_observation_date\` | Most recent observation timestamp |

---

## 17. Equipment detail API (read)

| Method | Path |
|--------|------|
| \`GET\` | \`/api/v1/external/equipment/{equipment_id}\` |

**Required scope:** \`equipment:read\`

Returns the same equipment object shape as the hierarchy API, plus a \`maintenance_summary\` block:

| Field | Description |
|-------|-------------|
| \`active_maintenance_program\` | Active program flag |
| \`program_task_count\` | Tasks in the maintenance program |
| \`strategy_failure_mode_count\` | Failure modes in the active equipment-type strategy |

---

## 18. OpenAPI export

| Method | Path |
|--------|------|
| \`GET\` | \`/api/v1/external/openapi.json\` |

Returns a static OpenAPI 3 document listing all external endpoints (observations + equipment).

---

## 19. Change log

| Version | Date | Notes |
|---------|------|-------|
| ${GUIDE_VERSION} | 2026-06-29 | Added equipment read APIs and OpenAPI export. |
| 1.0 | 2026-06-29 | Initial third-party integration guide. |

---

*Generated from AssetIQ External API Access settings. This document contains no secrets — replace \`YOUR_API_KEY\` placeholders before testing.*
`;
}

export function downloadExternalObservationIntegrationGuide(baseUrl) {
  const content = buildExternalObservationIntegrationGuide(baseUrl);
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "AssetIQ-External-API-Integration-Guide.md";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
