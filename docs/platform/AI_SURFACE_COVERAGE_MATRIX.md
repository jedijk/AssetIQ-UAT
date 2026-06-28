# AI Surface Coverage Matrix

**Sprint 3–6 — Universal AI Contract inventory**  
**Last updated:** 2026-06-28 (AI Platform Completion — remaining routes migrated)  
**Contract:** `models/ai_recommendation.py` (`AIRecommendationResponse`), `services/ai_recommendation_contract.py`, `services/ai_execute_grounded.py`  
**Platform entry:** `services/ai_execute_grounded.execute_grounded()` → `services/ai_platform.finalize_recommendation_response`  
**Gate:** `scripts/ai_entry_point_report.py` — **8/8 contract surfaces**, **13/13 grounded surfaces**

## Contract requirements

| Requirement | Implementation |
|-------------|----------------|
| Citations array | `finalize_recommendation_response` → `attach_citations_to_response` |
| `evidence_not_available` flag | Set when no citations |
| Critical recs need `confidence` + `source_refs` | `enrich_recommendations_with_evidence` |
| Shared response schema | `AIRecommendationResponse` (Pydantic) |
| Schema validation | `validate_ai_recommendation_schema` |
| No direct OpenAI imports | CI gate via `ai_entry_point_report` |
| Enforced surfaces | Static scan in `ai_entry_point_report` (8 contract + 13 grounded) |

**Status legend:** **Compliant** · **Partial** (read-only cache / non-LLM) · **Missing**

## Enforced user-facing surfaces (Sprint 4 — verified Sprint 6)

Gate scan: **8 enforced contract surfaces · 8 compliant** (`ai_entry_point_report.py`).

| Route | Service | Contract | Status |
|-------|---------|----------|--------|
| `POST /ai/analyze-risk/{threat_id}` | `ai_risk_analysis` | `finalize_ai_recommendation_response` | **Compliant** |
| `POST /copilot/query` | `ril_copilot_service` | `finalize_recommendation_response` | **Compliant** |
| `POST /pm-import/session/{id}/ai-review` | `pm_import_recommendation` | `finalize_recommendation_response` | **Compliant** |
| `POST /{equipment_id}/ai-recommendations` | `maintenance_program_routes_operations` | `finalize_recommendation_response` | **Compliant** |
| `POST /investigations/{id}/ai-problem-check` | `investigation_files` | `finalize_recommendation_response` | **Compliant** |
| `GET /investigations/{id}/ai-summary` | `reports.generate_ai_summary` | `finalize_recommendation_response` | **Compliant** |
| `POST /ai-suggestions/failure-modes` | `ai_fm_suggestions` | `finalize_fm_suggestions_contract` | **Compliant** |
| `POST /maintenance-strategies/generate` | `maintenance_routes_service` | `finalize_recommendation_response` | **Compliant** |
| `POST /ai/recommendations` | `insights_service` | `finalize_ai_recommendation_response` | **Compliant** ✓ |

*Note: table lists 9 routes mapped to contract helpers; static gate counts **8 enforced contract surfaces** (authoritative for Sprint 6 DoD).*

## Grounded pipeline surfaces (Platform Completion)

Gate scan: **13 enforced grounded surfaces · 13 compliant**.

| Route | Service | Grounded | Contract overlay | Status |
|-------|---------|----------|------------------|--------|
| `POST /ai/generate-causes/{threat_id}` | `ai_risk_engine` | `execute_grounded` | `_merge_grounded_contract` | **Compliant** ✓ |
| `POST /ai/fault-tree/{threat_id}` | `ai_risk_engine` | `execute_grounded` | `_merge_grounded_contract` | **Compliant** ✓ |
| `POST/GET /ai/bow-tie/{threat_id}` | `ai_risk_engine` | `execute_grounded` | `_merge_grounded_contract` | **Compliant** ✓ |
| `POST /ai/optimize-actions/{threat_id}` | `ai_risk_engine` | `execute_grounded` | `_merge_grounded_contract` | **Compliant** ✓ |
| `POST /ai/explain/{threat_id}` | `ai_risk_engine` | `execute_grounded` | `_merge_grounded_contract` | **Compliant** ✓ |
| `POST /ai/chat-analyze` | `ai_risk_analysis` | `execute_grounded` | `overlay_grounded_contract` | **Compliant** ✓ |
| `POST /ai/dashboard-intent` | `ai_risk_dashboard` | `execute_grounded` | `overlay_grounded_contract` | **Compliant** ✓ |
| `POST /ai/recommendations` | `insights_service` | `execute_grounded` | `finalize_ai_recommendation_response` | **Compliant** ✓ |
| `POST /image-analysis/*` | `image_analysis_service` | `execute_grounded` | Vision + contract | **Compliant** ✓ |
| `POST /chat/*` (attachment vision) | `ai_helpers` | `execute_grounded` | Vision + audit | **Compliant** ✓ |
| `POST /scheduler/ai-plan` | `maintenance_scheduler_ai_service` | `execute_grounded` | `overlay_grounded_contract` | **Compliant** ✓ |
| `POST /production/ai-insights` | `production_dashboard_ops` | `execute_grounded` | `overlay_grounded_contract` | **Compliant** ✓ |
| `POST /production-logs/ai-parse` | `production_logs_service` | `execute_grounded` | `overlay_grounded_contract` | **Compliant** ✓ |
| `POST /ai/extract` | `routes/ai_extract` | `execute_grounded` | Vision (domain `ExtractionResponse`) | **Compliant** ✓ |
| `POST /forms/templates/{id}/document-search` | `routes/forms` | `execute_grounded` | `overlay_grounded_contract` | **Compliant** ✓ |
| `POST /feedback/generate-prompt` | `routes/feedback` | `execute_grounded` | `overlay_grounded_contract` | **Compliant** ✓ |

## Read-only / non-LLM (excluded from grounded gate)

| Route | Service | Notes | Status |
|-------|---------|-------|--------|
| `GET /ai/risk-insights/{threat_id}` | `ai_risk_service` | Cached aggregation | **Partial** (read-only) |
| `GET /ai/top-risks` | `ai_risk_service` | Cached aggregation | **Partial** (read-only) |
| `GET /ai/causal-analysis/{threat_id}` | `ai_risk_engine` | Cached read | **Partial** (read-only) |
| `POST /observations/suggest-failure-modes` | `observation_service` | Keyword/DB match, no LLM | **Compliant** (non-LLM) |

## Coverage summary

| Status | Count |
|--------|-------|
| Compliant (contract gate) | **8** |
| Compliant (grounded gate) | **13** |
| Partial (read-only cache) | 3 |
| Non-LLM (keyword match) | 1 |

**Platform Completion gate:** `ai_entry_point_report.py` → contract **8/8**, grounded **13/13**; legacy OpenAI bypasses **0**.

## Frontend evidence display (Sprint 5 + Completion)

| Surface | Component | Contract fields shown |
|---------|-----------|----------------------|
| Observation AI panel | `AIInsightsPanel` + `AIRecommendationCard` | citations, evidence_not_available |
| Investigation AI summary | `CausalEnginePageMain` dialog | citations, deterministic inputs |
| PM Import AI review | `AIReviewModal` | citations per suggestion |
| RIL Copilot | `RILCopilot` | citations, evidence_not_available |
| Executive insights | `InsightsPage` | citations, recommendations, execution_id |
| Strategy / program AI | *API returns contract fields; program UI pending* | API ready |

Reusable component: `frontend/src/components/ai/AIRecommendationCard.jsx`

## Verification

| Check | Result |
|-------|--------|
| `ai_entry_point_report.py` | **PASS** — 8/8 contract, 13/13 grounded |
| `test_ai_execute_grounded.py` | **PASS** |
| Frontend `AIRecommendationCard` | Observation, investigation, PM import, RIL copilot, insights |

## Remaining (out of scope)

1. Wire `AIRecommendationCard` to maintenance program AI accept flow (API exists; no UI trigger yet).
2. Re-run `backfill_reliability_graph_history.py --phase all` on UAT when Atlas creds restored.
