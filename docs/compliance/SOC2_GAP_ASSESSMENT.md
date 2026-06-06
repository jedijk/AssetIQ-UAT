# SOC 2 Gap Assessment

Mapping of prior AssetIQ audit / stabilization findings to **AICPA Trust Services Criteria** (Security focus: CC6, CC7, CC8). Status as of UAT deploy batch.

| Control area | TSC | Finding / control | Status | Notes |
|--------------|-----|-------------------|--------|-------|
| Dual RBAC (legacy role + permission matrix) | CC6.1, CC6.3 | `require_permission` + `rbac_service` on routes | **Addressed** | Permission checks on sensitive routes; auth matrix tests |
| Tenant isolation (`tenant_id` / `company_id`) | CC6.1, CC6.6 | Tenant middleware + scoped collections | **Partial** | Pilot on `work_item_projections`, `background_jobs`, `audit_log`; domain collections not fully wired |
| JWT `is_active` enforcement | CC6.1, CC6.2 | Inactive users rejected at auth | **Addressed** | Token validation checks user active flag |
| Installation filter (data scope) | CC6.1, CC6.3 | `installation_filter` on KPIs/threats/equipment | **Addressed** | Executive KPIs and scoped queries respect installation membership |
| Background jobs (durable queue) | CC7.2, CC8.1 | `background_jobs` + external worker | **Addressed** | Job handlers registered; tenant_id on enqueue; worker deploy doc |
| AI cost guard / rate limits | CC6.1, CC7.2 | `ai_cost_guard.py` daily caps | **Addressed** | Rate limits + spend caps; Redis fallback documented |
| Security headers / body limits | CC6.6, CC7.2 | `middleware/security.py` | **Addressed** | Headers middleware; `MAX_REQUEST_BODY_BYTES` |
| OIDC SSO | CC6.1, CC6.2 | `/auth/oidc/*` spike + SPA callback | **Partial** | Backend routes live; production UI SSO button; auto-provision disabled |
| Audit logging | CC7.2, CC8.1 | `audit_log`, `security_audit_log` | **Partial** | HTTP audit + OIDC events; full SOC2 log retention policy TBD |
| Reliability graph sync audit | CC8.1 | UAT gate `verify_reliability_graph_sync` | **Addressed** | Static + optional DB sampling |
| Secret handling in logs | CC6.1 | Request log masking | **Addressed** | Secret key masking in structured logs |
| CORS allowlist | CC6.6 | `server.py` CORS config | **Addressed** | Explicit origins |
| `/my-tasks` deprecation | CC8.1 | Work Items API canonical | **Addressed** | Deprecation headers + migration doc |
| Asset health materialization | CC7.1 | Daily `asset_health_documents` refresh | **Addressed** | Job handler + indexes |
| Penetration / upload validation | CC6.6, CC7.2 | Manual input validation review | **Open** | Listed in SECURITY_REVIEW_SUMMARY as manual follow-up |
| Cookie / session hardening | CC6.1 | Cookie auth mode optional | **N/A** | Bearer default; cookie mode documented separately |

## Legend

- **Addressed** — control implemented and testable in codebase
- **Partial** — foundation in place; scope or operational policy incomplete
- **Open** — known gap requiring follow-up
- **N/A** — not applicable to current deployment model

## Recommended next steps

1. Complete tenant isolation rollout to domain collections (equipment, threats, tasks).
2. Formalize log retention and access review procedures for SOC 2 evidence.
3. Finish manual authentication / upload validation checklist from stabilization security review.
4. Enable OIDC in production with IdP provisioning runbook (no auto-provision).
