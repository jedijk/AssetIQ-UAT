# Phase 1 — Graph, Tenancy, AI Gateway

Platform hardening after Phase 0 (strict mode on UAT). No new product modules.

**Gate:** Phase 0 complete; UAT strict-mode soak clean.

## Status

| ID | Workstream | Task | Status | Notes |
|----|------------|------|--------|-------|
| B1 | Graph | Tenant-scoped edge reads (`tenant_read_filter` on queries) | **Done** | `reliability_graph._edge_tenant_clause` |
| B2 | Graph | Tenant-scoped context assembly | **Done** | `get_equipment_reliability_context` uses `merge_tenant_filter` |
| B3 | Graph | `ensure_reliability_graph_indexes` on startup | Existing | Idempotent compound indexes |
| B4 | Graph | `GRAPH_SYNC_ASYNC` + outbox monitoring | Pending ops | Set on UAT when ready; metrics: `graph_sync_enqueued_total` |
| B5 | Graph | Backfill `tenant_id` on legacy `reliability_edges` | Pending ops | Run on UAT Mongo after B1 deploy |
| A1 | Tenancy | Service-layer filter audit script | **Done** | `scripts/tenant_service_filter_audit.py` |
| A2 | Tenancy | Fix unscoped `definitions` / `permissions` / `app_settings` | Backlog | Documented in `tenant_isolation_audit.UNSCOPED_BACKLOG` |
| A3 | Tenancy | Prod backfill + strict mode | Pending ops | After UAT soak |
| C1 | AI | Migrate `ai_helpers.py` off direct `openai` import | **Done** | Whisper + client via `ai_gateway` / `openai_service` |
| C2 | AI | Migrate `routes/feedback.py` transcribe | **Done** | `ai_gateway.transcribe_audio` |
| C3 | AI | Clear CI baseline bypass list | **Done** | `ai_entry_point_report.py` |
| D1 | Data | `phase1_data_integrity_report.py` on UAT | Pending ops | Requires `MONGO_URL` |

## Commands

```bash
# AI gateway gate (must exit 0)
cd backend && python3 scripts/ai_entry_point_report.py

# Service-layer tenant filter heuristic
cd backend && python3 scripts/tenant_service_filter_audit.py

# Phase 1 data integrity (UAT Mongo)
cd backend && MONGO_URL=... DB_NAME=assetiq-UAT python3 scripts/phase1_data_integrity_report.py

# Graph + tenant unit tests
cd backend && python3 -m pytest tests/test_reliability_graph_query.py tests/test_reliability_graph_traversal.py tests/test_tenant_isolation_audit_waves.py -q
```

## Exit criteria

- [ ] `ai_entry_point_report.py` — 0 baseline bypasses, 0 new violations
- [ ] Edge reads respect `TENANT_STRICT_MODE`
- [ ] `tenant_service_filter_audit.py` — no new high-risk unscoped services
- [ ] UAT 48h soak complete with no tenant regressions
- [ ] Prod tenant backfill + strict mode (ops)

## References

- [`PHASE_0_STABILIZATION_REPORT.md`](./PHASE_0_STABILIZATION_REPORT.md)
- [`RELIABILITY_KNOWLEDGE_GRAPH_IMPLEMENTATION_PLAN.md`](./RELIABILITY_KNOWLEDGE_GRAPH_IMPLEMENTATION_PLAN.md)
- [`RELIABILITY_GRAPH_SYNC.md`](./RELIABILITY_GRAPH_SYNC.md)
