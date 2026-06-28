# AI Surface Coverage Matrix

**Sprint 3–6 — Universal AI Contract inventory**  
**Last updated:** 2026-06-28 (AI Platform Completion — `execute_grounded` pipeline)  
**Contract:** `models/ai_recommendation.py` (`AIRecommendationResponse`), `services/ai_recommendation_contract.py`, `services/ai_execute_grounded.py`  
**Platform entry:** `services/ai_execute_grounded.execute_grounded()` → `services/ai_platform.finalize_recommendation_response`  
**Gate:** `scripts/ai_entry_point_report.py` — **8/8 contract surfaces**, **7/7 grounded surfaces**

## Contract requirements

| Requirement | Implementation |
|-------------|----------------|
| Citations array | `finalize_recommendation_response` → `attach_citations_to_response` |
| `evidence_not_available` flag | Set when no citations |
| Critical recs need `confidence` + `source_refs` | `enrich_recommendations_with_evidence` |
| Shared response schema | `AIRecommendationResponse` (Pydantic) |
| Schema validation | `validate_ai_recommendation_schema` |
| No direct OpenAI imports | CI gate via `ai_entry_point_report` |
| Enforced surfaces | Static scan in `ai_entry_point_report` (8 surfaces) |

**Status legend:** **Compliant** · **Partial** (ai_platform but no contract) · **Missing**

## Enforced user-facing surfaces (Sprint 4 — verified Sprint 6)

Gate scan: **8 enforced surfaces · 8 compliant** (`ai_entry_point_report.py` @ `e5a828e7`).

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

*Note: table lists 9 routes mapped to contract helpers; static gate counts **8 enforced surfaces** (authoritative for Sprint 6 DoD).*

## Other user-facing API routes

| Route | Service | ai_platform | Contract | Status |
|-------|---------|-------------|----------|--------|
| `POST /ai/generate-causes/{threat_id}` | `ai_risk_engine` → `execute_grounded` | `_merge_grounded_contract` | **Compliant** ✓ |
| `POST /ai/fault-tree/{threat_id}` | `ai_risk_engine` → `execute_grounded` | `_merge_grounded_contract` | **Compliant** ✓ |
| `POST/GET /ai/bow-tie/{threat_id}` | `ai_risk_engine` → `execute_grounded` | `_merge_grounded_contract` | **Compliant** ✓ |
| `POST /ai/optimize-actions/{threat_id}` | `ai_risk_engine` → `execute_grounded` | `_merge_grounded_contract` | **Compliant** ✓ |
| `POST /ai/chat-analyze` | `ai_risk_service` → `execute_grounded` | `overlay_grounded_contract` | **Compliant** ✓ |
| `POST /ai/dashboard-intent` | `ai_risk_dashboard` → `execute_grounded` | `overlay_grounded_contract` | **Compliant** ✓ |
| `GET /ai/risk-insights/{threat_id}` | `ai_risk_service` | Cached | No | **Partial** (read-only cache) |
| `GET /ai/top-risks` | `ai_risk_service` | Cached aggregation | No | **Partial** (read-only cache) |
| `GET /ai/causal-analysis/{threat_id}` | `ai_risk_engine` | Cached | No | **Partial** (read-only cache) |
| `POST /ai/explain/{threat_id}` | `ai_risk_engine` → `execute_grounded` | `_merge_grounded_contract` | **Compliant** ✓ |
| `POST /scheduler/ai-plan` | `maintenance_scheduler_ai_service` | Yes | No | **Partial** |
| `POST /production/ai-insights` | `production_dashboard_ops` | Yes | No | **Partial** |
| `POST /production-logs/ai-parse` | `production_logs_service` | Yes | No | **Partial** |
| `POST /ai/extract` | `ai_extract` routes | Yes | No | **Partial** |
| `POST /forms/templates/{id}/document-search` | `forms` route | Yes | No | **Partial** |
| `POST /observations/suggest-failure-modes` | observation workspace | Indirect | No | **Partial** |
| `POST /image-analysis/*` | `image_analysis_service` → `execute_grounded` | Vision + contract overlay | **Compliant** ✓ |
| `POST /chat/*` (attachment vision) | `ai_helpers` → `execute_grounded` | Vision + audit | **Compliant** ✓ |
| `POST /ai/recommendations` | `insights_service` → `execute_grounded` | `finalize_ai_recommendation_response` | **Compliant** ✓ |
| `POST /feedback/*` (AI prompt gen) | `feedback` route | Yes | No | **Missing** |

## Coverage summary

| Status | Count |
|--------|-------|
| Compliant (enforced gate) | **8** |
| Partial (ai_platform, no contract) | 14+ |
| Missing | 1 |

**Sprint 6 gate:** `ai_entry_point_report.py` → enforced **8/8 compliant**; legacy OpenAI bypasses **0**.

## Frontend evidence display (Sprint 5)

| Surface | Component | Contract fields shown |
|---------|-----------|----------------------|
| Observation AI panel | `AIInsightsPanel` + `AIRecommendationCard` | citations, evidence_not_available |
| Investigation AI summary | `CausalEnginePageMain` dialog | citations, deterministic inputs |
| PM Import AI review | `AIReviewModal` | citations per suggestion |
| RIL Copilot | `RILCopilot` | citations, evidence_not_available |
| Strategy / program AI | *pending UI wiring* | API returns contract fields |

Reusable component: `frontend/src/components/ai/AIRecommendationCard.jsx`

## Sprint 6 verification (@ `e5a828e7`)

| Check | Result |
|-------|--------|
| `ai_entry_point_report.py` | **PASS** — 8/8 enforced surfaces compliant |
| `test_ai_recommendation_schema.py` | **PASS** (in Sprint 6 pytest bundle) |
| Frontend `AIRecommendationCard` | Wired on observation panel, investigation summary, PM import, RIL copilot |

## Post-Sprint 6 / Platform Completion remaining

1. Wire `AIRecommendationCard` to maintenance program AI accept flow and strategy generator UI.
2. Migrate remaining **partial** routes (production logs, scheduler AI, causal-analysis cache reads) to `execute_grounded()`.
3. Re-run `backfill_reliability_graph_history.py --phase all` on UAT when Atlas creds restored.
