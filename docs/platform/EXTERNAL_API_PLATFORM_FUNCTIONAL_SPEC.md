# AssetIQ Functional Specification — External API Platform

**Version:** 1.0  
**Status:** Phase 1+2 complete (observations, equipment read, key management, usage trends, OpenAPI export)  
**Module:** External Integrations  
**Last updated:** 2026-06-29  

**Related documents**

| Document | Purpose |
|----------|---------|
| [`EXTERNAL_OBSERVATION_API.md`](./EXTERNAL_OBSERVATION_API.md) | Technical reference for the observation endpoint and admin API |
| [`frontend/src/lib/externalObservationIntegrationGuide.js`](../../frontend/src/lib/externalObservationIntegrationGuide.js) | Shareable third-party integration guide (Markdown download) |

---

## Implementation snapshot (2026-06-29)

| Area | Spec section | Status |
|------|--------------|--------|
| API key authentication (`Bearer` / `X-API-Key`, hashed storage, tenant-scoped) | §5 | **Done** |
| Scope model (`observations:create`, `equipment:read`) | §6 | **Done** |
| Settings admin UI — External API Access | §7–§11 | **Done** — create with scope selection, enable/disable, rotate, revoke, usage dialog with trends |
| Shareable integration guide download (no secrets) | §30 | **Done** — Settings → External API Access → *Download integration guide* |
| Observation submission API | §12–§16 | **Done** |
| Equipment hierarchy API | §17–§23 | **Done** |
| Equipment detail API | §24 | **Done** |
| Extended scopes (`equipment:read`; `tasks:*`, etc.) | §6, §29 | **Partial** — `equipment:read` done; future scopes planned |
| Usage trends (24h / 7d / 30d / 12mo dashboards) | §11 | **Done** |
| OpenAPI JSON export | §30 | **Done** — `GET /api/v1/external/openapi.json` |
| AI equipment matching on ingest | §15 | **Deferred** |
| Webhooks / bulk import-export | §29 | **Planned** |

**Navigation (current UI):** **Settings → External API Access** (`/settings/external-api`). Owner or admin role required. Desktop only.

**Third-party onboarding:** Administrators download `AssetIQ-External-Observation-API-Integration-Guide.md` from the settings page and share it with integrators. API keys are delivered separately through a secure channel.

---

## 1. Purpose

AssetIQ shall provide a secure, enterprise-grade External API Platform that allows trusted third-party systems to integrate with AssetIQ without direct database access.

The External API Platform serves as the single integration layer for all external systems and enables both read and write access to approved business functions.

The platform is designed to position AssetIQ as the central reliability intelligence platform for industrial organizations while maintaining strict security, tenant isolation, auditability, and scalability.

All APIs shall follow a consistent authentication model, versioning strategy, permission model, response format, and audit framework.

> **Phase 1 delivered:** Machine-to-machine observation ingestion and API key lifecycle management. Read APIs and additional scopes follow the same authentication and audit patterns defined here.

---

## 2. Business Objectives

The External API Platform shall:

* Allow secure integration with third-party software.
* Eliminate duplicate master data.
* Reduce manual data entry.
* Enable machine-to-machine communication.
* Support Digital Twin platforms.
* Support SCADA and PLC integrations.
* Support BI and reporting platforms.
* Support mobile applications.
* Support MES and ERP systems.
* Provide a stable API for partners.
* Maintain complete tenant isolation.
* Integrate with the AssetIQ reactive reliability graph.

---

## 3. Supported Integrations

Examples include:

* SCADA
* PLC
* DCS
* SAP PM
* IBM Maximo
* Ultimo
* MES
* ERP
* Historian systems
* IoT Platforms
* Power BI
* Grafana
* Ignition
* Mobile Applications
* Digital Twins
* Power Automate
* Make.com
* n8n
* Custom integrations

> **Phase 1:** Observation ingest from any of the above via `POST /api/v1/external/observations`. Equipment read-back and BI export APIs are planned (§17–§24, §29).

---

## 4. API Versioning

All endpoints shall be versioned.

Example:

```
/api/v1/
```

Future versions shall not break existing integrations.

> **Implemented:** External routes are mounted under `/api/v1/external/`.

---

## 5. Authentication

Authentication uses API Keys.

Supported headers:

```
Authorization: Bearer {API_KEY}
```

or

```
X-API-Key: {API_KEY}
```

Every API key belongs to one tenant only.

API Keys are stored hashed (SHA-256).

API Keys are never recoverable.

API Keys are shown only once when created.

Key format: `aiq_live_` + URL-safe token (see `backend/services/external_api_key_service.py`).

---

## 6. API Permissions

Permissions are scope based.

Examples:

| Scope | Phase 1 | Notes |
|-------|---------|-------|
| `observations:create` | **Enforced** | Required for observation ingest |
| `equipment:read` | **Done** | Equipment hierarchy and detail APIs |
| `equipment.details:read` | Planned | Merged into `equipment:read` detail endpoint |
| `tasks:create` | Planned | |
| `tasks:read` | Planned | |
| `forms:submit` | Planned | |
| `strategies:read` | Planned | |
| `documents:read` | Planned | |

Future APIs can introduce additional scopes without changing the authentication model.

---

## 7. API Management

A new administration module shall be added.

Navigation:

```
Settings
  → External API Access
```

Only **Tenant Administrators** (owner, admin) may access this module.

> **Note:** The functional target described an *Integrations* grouping; the current product exposes External API Access as a top-level Settings section.

---

## 8. API Key Overview

The overview displays:

| Field | Phase 1 |
|-------|---------|
| Integration Name | **Done** (`name`) |
| Source System | Planned (metadata field) |
| Status | **Done** (`active`, `disabled`, `revoked`) |
| Scopes | **Done** |
| Created By | **Done** |
| Created Date | **Done** |
| Expiry Date | Planned |
| Last Used | **Done** |
| Requests Today | Planned (lifetime total available) |
| Requests This Month | Planned |
| Average Response Time | **Partial** (lifetime average in usage dialog) |
| Error Rate | **Partial** (total errors / total requests) |
| Health Status | **Partial** (`healthy`, `unused`, `degraded`, `disabled`, `revoked`) |
| Actions | **Done** (enable, rotate, revoke, usage) |

Health Status values (target):

* Healthy
* Warning
* Failing
* Disabled
* Unused

> **Phase 1 mapping:** `healthy`, `unused`, `degraded` (high error ratio), `disabled`, `revoked`. Warning/Failing trend labels are planned with time-windowed metrics (§11).

---

## 9. Create API Key

Administrators can create API keys.

Configuration includes:

| Field | Phase 1 |
|-------|---------|
| Integration Name | **Done** |
| Description | **Done** |
| Source System | Planned (use `source_system` in observation payloads today) |
| Scopes | **Done** (defaults to `observations:create`) |
| Rate Limit | **Done** (default 120/min, configurable on create) |
| Expiry Date | Planned |
| IP Allowlist | **Done** (optional CIDR list) |
| Notes | Use description field |

The generated key is displayed once only.

Example:

```
aiq_live_xxxxxxxxxxxxxxxxxxxxxxxxxx
```

The system displays:

> Copy this key now. AssetIQ will never display this key again.

---

## 10. API Key Management

Each API key supports:

| Action | Phase 1 |
|--------|---------|
| Enable | **Done** |
| Disable | **Done** |
| Rotate | **Done** (grace period default 24h) |
| Revoke | **Done** |
| Edit Metadata | **Partial** (PATCH name, scopes, rate limit, IP allowlist, description) |
| View Usage | **Done** |
| View Errors | **Partial** (recent failed requests in usage dialog) |
| View Audit History | **Partial** (`external_api_requests` collection) |

---

## 11. Usage Monitoring

AssetIQ shall monitor every request.

Metrics include:

| Metric | Phase 1 |
|--------|---------|
| Total Requests | **Done** |
| Successful Requests | **Partial** (derived) |
| Failed Requests | **Done** |
| Average Response Time | **Done** (lifetime average) |
| Error Rate | **Partial** |
| Authentication Failures | Planned (aggregate) |
| Rate Limit Violations | Planned (aggregate) |
| Last Used | **Done** |
| Observations Created | **Done** |
| Equipment Requests | N/A until read APIs ship |
| Bandwidth | Planned |
| Requests Per Endpoint | Planned |
| Usage trends (24h / 7d / 30d / 12mo) | **Done** |

---

## 12. Observation Submission API

**Endpoint**

```
POST /api/v1/external/observations
```

**Purpose**

Create a new observation inside AssetIQ.

This endpoint is intended for:

* SCADA
* PLC
* Operator Apps
* Inspection Systems
* IoT Platforms
* Production Systems
* Custom Software

> **Status:** **Implemented.** See [`EXTERNAL_OBSERVATION_API.md`](./EXTERNAL_OBSERVATION_API.md) and the downloadable integration guide in Settings.

---

## 13. Observation Payload

**Required (implemented):**

| Field | Spec name | Implementation |
|-------|-----------|----------------|
| External Reference | External Reference | `external_reference` |
| Source System | Source System | `source_system` |
| Title | Title | Use `description` (no separate title field in v1) |
| Description | Description | `description` |
| Reported Timestamp | Reported Timestamp | Set by AssetIQ at create time; optional future field |

**Optional (implemented):**

| Field | Implementation |
|-------|----------------|
| Equipment | `equipment_id`, `external_equipment_id`, `equipment_tag`, `equipment_name` |
| Severity | `severity` (default `medium`) |
| Reporter | Derived from API key identity |
| Location | `location` |
| Measurements | `measured_values` |
| Attachments | `media_urls` |
| Metadata | `metadata` |
| Observation type | `observation_type` (default `general`) |
| Tags | `tags` |
| Idempotency | `idempotency_mode` (`return_existing` \| `conflict`) |

---

## 14. Observation Processing

AssetIQ shall:

1. Authenticate — **Done**
2. Validate — **Done**
3. Resolve Tenant — **Done** (from API key)
4. Check Duplicate — **Done**
5. Match Equipment — **Done** (rules-based; see §15)
6. Create Observation — **Done** (`create_observation`, `source=external_system`)
7. Store Original Payload — **Done** (`external_observation_payloads`)
8. Publish Domain Event — **Done** (via canonical lifecycle)
9. Update Reliability Graph — **Done** (via lifecycle graph handler)
10. Run AI Analysis — **Deferred** (same as manual observations where enabled)
11. Return Response — **Done**

Externally submitted observations shall use the same workflow as manually created observations.

---

## 15. Equipment Matching

Equipment matching priority:

1. AssetIQ Equipment ID — **Done** (`equipment_id`)
2. External Equipment ID — **Done** (`external_mappings.{source_system}`)
3. Equipment Number — **Done** via `equipment_tag` exact match
4. Equipment Name — **Done** (exact, then fuzzy)
5. AI Matching — **Deferred**
6. No Match — **Done** → status `equipment_match_required`

If equipment cannot be matched:

* Observation shall still be created.
* Workflow Status: **Equipment Match Required**

---

## 16. Duplicate Detection

Uniqueness:

* Tenant
* Source System
* External Reference

Duplicate requests shall return the existing observation (`idempotency_mode=return_existing`, HTTP 200).

Conflicting requests return HTTP 409 (`idempotency_mode=conflict`).

> **Implemented** in `backend/services/external_observation_service.py`.

---

## 17. Equipment Hierarchy API

**Purpose**

Allow external applications to retrieve the complete hierarchy of a specific installation.

The API is strictly read-only.

No modification endpoints are included.

**Endpoint**

```
GET /api/v1/external/installations/{installation_id}/hierarchy
```

**Required Scope**

`equipment:read`

> **Status:** **Implemented.** Requires scope `equipment:read`.

---

## 18. Query Options

* `include_inactive`
* `include_metadata`
* `max_depth`
* `flat`
* `last_modified_after`

These options allow synchronization and optimized responses for large installations.

> **Status:** **Planned** with hierarchy API (§17).

---

## 19. Equipment Information

Each equipment object shall include identification, hierarchy path, type/class/category, manufacturer, model, serial number, commission date, and status fields as defined in the original specification.

> **Status:** **Implemented** — returned by hierarchy and detail read APIs.

---

## 20. Criticality Information

The hierarchy API shall always include AssetIQ criticality information (rating, classification, production impact value, safety/environmental/business critical flags).

> **Status:** **Implemented** — read from `equipment_nodes.criticality` at query time.

---

## 21. Operational Information

Each equipment object shall also include operational summary information (active observations count, open planned work, active strategy/programs, last inspection/observation dates).

Detailed observation records are not exposed on the hierarchy endpoint.

> **Status:** **Implemented**.

---

## 22. Metadata

Each equipment object includes tags, custom fields, labels, integration metadata, external references, created/modified dates, and future version number.

> **Status:** **Implemented**.

---

## 23. Child Relationships

Each equipment object shall include child equipment so the complete hierarchy can be reconstructed from a single response.

Hierarchy follows:

```
Installation → Area → System → Section → Equipment → Sub Equipment → Components → Maintainable Items
```

> **Status:** **Implemented**.

---

## 24. Equipment Detail API

**Endpoint**

```
GET /api/v1/external/equipment/{equipment_id}
```

**Purpose**

Return detailed information for a single equipment object (hierarchy, criticality, metadata, status, strategies, maintenance programs, operational summary, custom fields).

Future versions may include documents, drawings, spare parts, and live status.

> **Status:** **Implemented**.

---

## 25. Security

The External API Platform shall enforce:

| Control | Phase 1 |
|---------|---------|
| Tenant Isolation | **Done** |
| API Key Authentication | **Done** |
| Scope Validation | **Done** |
| HTTPS Only | **Enforced at deployment** |
| Rate Limiting | **Done** (per-key, per-minute) |
| Payload Validation | **Done** (Pydantic) |
| Request Size Limits | **Platform default** |
| IP Allowlists | **Done** |
| Hashed API Keys | **Done** |
| Audit Logging | **Done** |
| No Cross Tenant Access | **Done** |
| Replay Protection | Planned (nonce / timestamp headers) |

---

## 26. Audit Logging

Every request shall generate an audit record.

Captured information:

| Field | Phase 1 |
|-------|---------|
| Tenant | **Done** |
| API Key | **Done** (key ID, never plaintext) |
| Endpoint | **Done** |
| Method | **Done** |
| Source System | **Done** (from payload when applicable) |
| Requester IP | **Done** |
| Timestamp | **Done** |
| HTTP Status | **Done** |
| Response Time | **Done** |
| Observation ID | **Done** |
| Equipment ID | **Done** (read APIs) |
| Rows Returned | **Done** |
| Errors | **Done** (`error_detail`) |

Raw API Keys shall never be stored.

**Collection:** `external_api_requests`

---

## 27. Reliability Graph Integration

The External API Platform integrates with the AssetIQ reactive graph.

* Observation API creates graph events — **Done** (via observation lifecycle).
* Equipment API is read-only — **Planned**.
* Future APIs may expose graph relationships without exposing internal implementation.

---

## 28. Performance

The platform shall support large installations, high request volumes, streaming, compression, incremental sync, caching, and scalable architecture.

> **Phase 1:** Observation ingest is synchronous; rate limits protect the tenant. Hierarchy streaming and caching are planned with read APIs.

---

## 29. Future API Endpoints

The platform is designed for expansion. Planned endpoints include:

* Equipment Details / Search / Types
* Failure Modes, Strategies, Maintenance Programs
* Scheduled Tasks, Task Completion
* Observation Updates, Investigation API
* Forms, Documents, Drawings, Spare Parts
* Risk Dashboard, Reliability KPIs
* Webhook Subscriptions
* Bulk Import / Bulk Export

---

## 30. OpenAPI Documentation

Every endpoint shall automatically generate OpenAPI documentation including authentication, permissions, schemas, examples, validation rules, error codes, and code samples.

| Deliverable | Phase 1 |
|-------------|---------|
| FastAPI route metadata | **Done** (observation POST) |
| `GET /api/v1/external/openapi-info` | **Done** (summary) |
| Full `/openapi.json` export | **Done** |
| Shareable Markdown integration guide | **Done** (Settings download) |
| cURL / Python examples | **Done** (in integration guide) |
| JavaScript examples | Planned |

Administrators generate the vendor-facing guide from **Settings → External API Access → Download integration guide**. The file uses `YOUR_API_KEY` placeholders and contains no tenant secrets.

---

## 31. Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| A secure External API Platform is available | **Partial** — Phase 1 live |
| API Keys are tenant-specific and scope-based | **Done** |
| API Keys can be created, enabled, disabled, rotated, and revoked | **Done** |
| API usage is monitored and auditable | **Partial** |
| Third-party systems can create observations | **Done** |
| Duplicate observations are prevented | **Done** |
| Equipment matching is performed automatically | **Done** (rules-based) |
| External observations use the standard AssetIQ workflow | **Done** |
| Complete equipment hierarchy can be retrieved | **Done** |
| Hierarchy includes criticality and operational summary | **Done** |
| Equipment data is strictly read-only via external API | **Done** |
| Equipment Detail API | **Done** |
| All requests authenticated, authorized, audited, rate-limited | **Done** (observation path) |
| All endpoints documented through OpenAPI | **Partial** |
| Platform extensible for future APIs | **Done** (architecture) |
| Shareable third-party integration instructions | **Done** |

---

## Appendix A — Code references (Phase 1)

| Component | Location |
|-----------|----------|
| Observation endpoint | `backend/routes/external_v1.py` |
| Admin key API | `backend/routes/external_api_admin.py` |
| Key service | `backend/services/external_api_key_service.py` |
| Observation ingest | `backend/services/external_observation_service.py` |
| Audit log | `backend/services/external_api_audit_service.py` |
| Models | `backend/models/external_api.py` |
| Settings UI | `frontend/src/pages/SettingsExternalApiPage.js` |
| Integration guide generator | `frontend/src/lib/externalObservationIntegrationGuide.js` |
| Tests | `backend/tests/test_external_api.py` |

## Appendix B — MongoDB collections (Phase 1)

| Collection | Purpose |
|------------|---------|
| `external_api_keys` | Hashed keys, scopes, rate limits, usage counters |
| `external_api_requests` | Per-request audit (no plaintext keys) |
| `external_observation_payloads` | Original payloads + dedup index |
