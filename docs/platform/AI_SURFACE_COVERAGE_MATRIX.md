# AI Surface Coverage Matrix

**Sprint 3 prep — Universal AI Contract inventory**  
**Last updated:** 2026-06-28  
**Contract:** `services/ai_recommendation_contract.py` (`finalize_ai_recommendation_response`, `validate_ai_recommendation_response`)  
**Platform entry:** `services/ai_platform.py` (required for all LLM calls)  
**Gate:** `scripts/ai_entry_point_report.py` (OpenAI import allowlist)

## Contract requirements (target)

| Requirement | Implementation |
|-------------|----------------|
| Citations array | `attach_citations_to_response` via `finalize_ai_recommendation_response` |
| `evidence_not_available` flag | Set when no citations |
| Critical recs need `confidence` + `source_refs` | `enrich_recommendations_with_evidence` |
| Grounded orchestration | `ai_orchestrator` + `execute_grounded_prompt` |
| Cost / usage tracking | `ai_platform` usage hooks |
| No direct OpenAI imports | CI gate via `ai_entry_point_report` |

**Status legend:** **Compliant** · **Partial** (ai_platform but no contract) · **Missing** (no citations contract / bypass)

## User-facing API routes

| Route | Service | ai_platform | Contract | Status | Notes |
|-------|---------|-------------|----------|--------|-------|
| `POST /ai/analyze-risk/{threat_id}` | `ai_risk_analysis` | Yes | `finalize_ai_recommendation_response` | **Compliant** | Reference implementation |
| `POST /ai/chat-analyze` | `ai_risk_service` | Yes | No | **Partial** | Chat threat creation path |
| `POST /ai/dashboard-intent` | `ai_risk_service` | Yes | No | **Partial** | Intent routing only |
| `GET /ai/risk-insights/{threat_id}` | `ai_risk_service` | Cached | No | **Partial** | Read cached insight |
| `GET /ai/top-risks` | `ai_risk_service` | Yes | No | **Partial** | Fleet ranking |
| `POST /ai/generate-causes/{threat_id}` | `ai_risk_engine` | Yes | No | **Partial** | RCA suggestions |
| `GET /ai/causal-analysis/{threat_id}` | `ai_risk_engine` | Yes | No | **Partial** | |
| `POST /ai/explain/{threat_id}` | `ai_risk_engine` | Yes | No | **Partial** | |
| `POST/GET /ai/fault-tree/{threat_id}` | `ai_risk_engine` | Yes | No | **Partial** | |
| `POST/GET /ai/bow-tie/{threat_id}` | `ai_risk_engine` | Yes | No | **Partial** | |
| `POST/GET /ai/optimize-actions/{threat_id}` | `ai_risk_engine` | Yes | No | **Partial** | Action optimization |
| `POST /ai/recommendations` | `insights_service` | Yes | `finalize_ai_recommendation_response` | **Compliant** | Fleet insights |
| `POST /{equipment_id}/ai-recommendations` | `maintenance_program_ai_recommendations` | Yes | No | **Partial** | Program suggestions |
| `POST /investigations/{id}/ai-problem-check` | investigation facade | Yes | No | **Partial** | Problem statement check |
| `GET /investigations/{id}/ai-summary` | `reports` route | Yes | No | **Partial** | Narrative summary |
| `POST /scheduler/ai-plan` | `maintenance_scheduler_ai_service` | Yes | No | **Partial** | Schedule planner |
| `POST /production/ai-insights` | `production_dashboard_ops` | Yes | No | **Partial** | Production dashboard |
| `POST /production-logs/ai-parse` | `production_logs_service` | Yes | No | **Partial** | Log parsing |
| `POST /pm-import/session/{id}/ai-review` | `pm_import_recommendation` | Yes | `attach_citations_to_response` | **Partial** | Citations on some paths |
| `POST /copilot/query` | `ril_copilot_service` | Yes | No | **Partial** | Grounded prompt in registry; uneven citation surfacing |
| `POST /ai/failure-modes/*` (fm suggestions) | `ai_fm_suggestions` routes | Yes | No | **Partial** | Large FM suggestion surface |
| `POST /ai/extract` | `ai_extract` routes | Yes | No | **Partial** | Vision extraction |
| `POST /forms/templates/{id}/document-search` | `forms` route | Yes | No | **Partial** | Template doc Q&A |
| `POST /maintenance-strategies/generate` | `maintenance_strategy_generator` | Yes (allowlisted) | No | **Partial** | Legacy allowlisted OpenAI path |
| `POST /observations/suggest-failure-modes` | observation workspace | Indirect | No | **Partial** | FM matching |
| `POST /image-analysis/*` | `image_analysis_service` | Gateway/vision | No | **Partial** | Damage detection |
| `POST /chat/*` | `chat` routes | Via risk engine | No | **Partial** | May trigger analyze-risk |
| `POST /feedback/*` (AI prompt gen) | `feedback` route | Yes | No | **Missing** | Internal admin helper |

## Service-layer AI (no dedicated route)

| Service | ai_platform | Contract | Status |
|---------|-------------|----------|--------|
| `ai_orchestrator` | Yes | Citations in orchestrator | **Compliant** (internal) |
| `ai_evidence_pack` | N/A | Citation builder | **Compliant** (internal) |
| `translation_service` | Yes | No | **Partial** |
| `process_import_vision` | Yes | No | **Partial** |
| `failure_modes/*` (consolidate, duplicate scan, etc.) | Yes | No | **Partial** |
| `threat_links` | Yes | No | **Partial** |
| `chat_central_action_service` | Indirect | No | **Partial** |

## Coverage summary

| Status | Count (routes + notable services) |
|--------|-----------------------------------|
| Compliant | 3 |
| Partial | 28+ |
| Missing | 1 |

## Sprint 3 enforcement plan

1. Add `finalize_ai_recommendation_response` wrapper in `ai_platform` for all JSON recommendation endpoints.
2. Extend `verify_uat_gates` / new `verify_ai_contract_coverage.py` to fail on user-facing routes without contract or explicit `evidence_not_available`.
3. Migrate `ai_risk_engine` endpoints to `execute_grounded_prompt` + evidence pack.
4. Surface citations in RIL copilot API response schema.
5. Document exempt routes (translation, internal admin) in allowlist.
