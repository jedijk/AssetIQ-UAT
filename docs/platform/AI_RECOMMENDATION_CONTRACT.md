# AI Recommendation Contract

**Status:** Enforced in code (2026-06-26 sprint)  
**Module:** `backend/services/ai_recommendation_contract.py`

## Purpose

User-facing AI endpoints must separate **deterministic evidence** from **AI narrative**, and must not imply grounded sources when none exist.

## Response fields

| Field | Required | Meaning |
|-------|----------|---------|
| `citations` | When evidence exists | Real entity references (`id`, `type`, `label`, `url_path`) — never invented |
| `evidence` | Optional | Structured deterministic context (counts, KPIs, entity snapshots) |
| `evidence_not_available` | Always on dict responses | `true` when no citations; `false` when citations present |
| `recommendations[].source_refs` | When citations exist + critical rec | Citation ids from supplied evidence only |
| `recommendations[].confidence` | Critical recommendations with evidence | `high` / `medium` / `low` or numeric |

## Endpoint inventory

| Endpoint | Service | Uses `ai_platform` | Citations | Deterministic vs AI |
|----------|---------|-------------------|-----------|---------------------|
| `POST /api/ai/analyze-risk/{id}` | `ai_risk_analysis.analyze_threat_risk` | Via `AIRiskEngine` | Threat, equipment, related observations | FMEA score + history deterministic; narrative from LLM |
| RIL Copilot | `ril_copilot_service` / `ai_orchestrator` | Yes | Evidence pack citations | Grounded orchestrator |
| Failure mode suggestions | `observation_service.suggest_failure_modes`, chat FM flow | Partial | Library FM ids when matched | Rule + LLM hybrid |
| PM import AI review | `pm_import_recommendation._ai_generate_recommendation` | Yes | Task, FM, equipment match | Match metadata + LLM recommendation |
| Strategy / program AI recs | `maintenance_program_ai_recommendations` | Yes | Equipment + observations (audit) | List API shape unchanged; citations logged |
| Insights AI recs | `insights_service.generate_ai_recommendations` | Yes | Fleet KPI citation | Aggregate metrics deterministic |
| Investigation AI | `investigation_files.ai_problem_check` | Yes | Evidence pack | Grounded defensive reasoning |
| Observation workspace recs | `observation_workspace_intel.get_recommended_actions` | Reads cache | FM library + cached AI risk insights | Mixed sources labeled by `source` |

## Enforcement

```python
from services.ai_recommendation_contract import finalize_ai_recommendation_response, validate_ai_recommendation_response

payload = finalize_ai_recommendation_response(raw, citations=citations, evidence=evidence)
violations = validate_ai_recommendation_response(payload)  # tests / optional runtime guard
```

**Rules:**
- Do not fabricate citation ids.
- If the model output references evidence, `source_refs` must point at supplied citations only.
- If no entity evidence was gathered, set `evidence_not_available=true`.

## Tests

- `backend/tests/test_ai_recommendation_contract.py` — contract helpers + AI risk / program shapes
- `backend/tests/test_ai_orchestrator.py` — grounded copilot smoke

## Gaps (intentional, out of sprint scope)

- List-returning endpoints (maintenance program tasks) keep legacy array shape; contract metadata is internal/audit-only until a versioned wrapper is approved.
- Failure mode chat suggestions still return suggestion objects without top-level `evidence_not_available` — add when chat v2 response schema is versioned.
