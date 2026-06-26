# AI Platform — Platform 1.0 WS5

**Objective:** One unified stack for every AI capability in AssetIQ.

## Architecture

```
Provider Layer (ai_gateway.py)
  → Prompt Registry (ai_prompt_registry.py)
  → Context Builder (ai_context_builder.py)
  → Evidence Builder (ai_evidence_pack.py)
  → Prompt Execution (ai_platform.py / ai_orchestrator.py)
  → Output Validation (ai_output_validation.py)
  → Audit Trail (ai_cost_guard / ai_usage_service)
```

## Entry points

| Module | Use when |
|--------|----------|
| `services.ai_platform` | **Preferred** — registered prompts + context assembly |
| `services.ai_gateway` | Transport-only (used by `ai_platform`; do not call from routes) |
| `services.ai_orchestrator` | Grounded recommendations with citations + copilot tools |
| `services.ai_evidence_pack` | Build tenant-scoped evidence dict for prompts |

Direct `openai` imports are restricted — see `scripts/ai_entry_point_report.py`.

## Execution API

| Function | Use when |
|----------|----------|
| `execute_prompt` | Registered system prompt + user message → text |
| `execute_json_prompt` | Registered prompt → parsed JSON (dict or array); supports `max_retries`, `seed`, `response_format` |
| `execute_vision_json_prompt` | Registered prompt + single image → parsed JSON; optional `prompt_text` override |
| `execute_multimodal_json_prompt` | Registered prompt + multimodal user content (text + image) → parsed JSON |
| `execute_grounded_prompt` | Evidence pack + copilot tools + citations |

```python
from services.ai_platform import (
    execute_prompt,
    execute_json_prompt,
    execute_vision_json_prompt,
    execute_multimodal_json_prompt,
    execute_grounded_prompt,
    build_ai_context,
)

# Text completion
result = await execute_prompt(
    "chat.threat_extraction",
    user=current_user,
    user_message="Pump P-101 is vibrating badly",
)

# JSON with deterministic FM settings
fm = await execute_json_prompt(
    "fm.failure_mode_mapping",
    user=current_user,
    user_message=user_prompt,
    endpoint="ai_fm_suggestions.failure_modes",
    temperature=0,
    seed=42,
    response_format={"type": "json_object"},
    max_retries=4,
)

# Vision — registry prompt
damage = await execute_vision_json_prompt(
    "vision.damage_analysis",
    user=current_user,
    user_message="Inspect this pump seal.",
    image_base64=b64,
    media_type="image/jpeg",
)

# Vision — fully-built prompt (e.g. dynamic form extraction)
extract = await execute_vision_json_prompt(
    "vision.field_extraction",
    user=current_user,
    user_message="",
    prompt_text=rendered_prompt,
    image_base64=b64,
)

# Multimodal JSON (attachment analysis)
attachment = await execute_multimodal_json_prompt(
    "chat.attachment_analysis",
    user=current_user,
    user_content=[{"type": "text", "text": ctx}, {"type": "image_url", ...}],
)

# Grounded copilot
grounded = await execute_grounded_prompt(
    user=current_user,
    intent="open_signals",
    query="Summarize active threats",
    equipment_id="eq-1",
)
```

## Prompt registry

Prompts are versioned in `ai_prompt_registry.py` (56 registered IDs at bootstrap):

```python
from services.ai_prompt_registry import get_prompt, list_prompts, render_prompt

spec = get_prompt("chat.threat_extraction")
text = render_prompt("vision.field_extraction", {"fields_block": "..."})
```

Key prompt families:

| Family | Examples |
|--------|----------|
| Chat | `chat.threat_extraction`, `chat.data_query`, `chat.attachment_analysis`, `chat.image_analysis` |
| Risk | `risk.analysis`, `risk.cause_analysis`, `risk.fault_tree`, `risk.bow_tie`, `risk.action_optimization` |
| FM library | `fm.failure_mode_mapping`, `fm.improve_failure_mode`, `fm.downtime_classification`, `fm.action_discipline_map` |
| Vision | `vision.field_extraction`, `vision.damage_analysis` |
| Import | `pm_import.vision_ocr`, `process_import.vision_extract`, `process_import.estimate_criticality` |
| Production / RIL | `production.daily_insights`, `ril.copilot_assistant` |
| Maintenance | `maintenance.strategy_generation`, `maintenance.scheduler_plan` |

New AI features **must** register prompts here before shipping.

## Output validation

JSON responses use `services.ai_output_validation.parse_json_from_llm` (strips markdown fences; accepts dict or array).
For registered JSON prompts, prefer `execute_json_prompt` / vision/multimodal variants from `ai_platform`.

## Migration status

| Area | Status |
|------|--------|
| Provider abstraction | **Done** — `ai_gateway.py` (transport only) |
| Prompt registry | **Done** — 56 versioned prompts |
| Context builder | **Started** — evidence + reliability chain |
| Evidence builder | **Done** — `ai_evidence_pack.py` |
| Grounded orchestration | **Done** — `ai_orchestrator.py` |
| Output validation | **Done** — `ai_output_validation.py` |
| Unified execution API | **Done** — text, JSON, vision, multimodal, grounded |
| Application migration | **Done** — all routes/services use `ai_platform` |
| Prompt versioning in DB | **Open** |
| Whisper / transcription | **Gateway** — `ai_gateway.transcribe_audio` (transport) |

### Migrated callers (representative)

`ai_helpers`, `ai_risk_engine`, `ai_risk_analysis`, `routes/ai_fm_suggestions`, `routes/ai_extract`, `image_analysis_service`, `process_import_vision`, `pm_import/file_parsing`, `investigation_files`, `ril_copilot_service`, `maintenance_strategy_generator`, FM action helpers, production/insights/reports routes.

### Remaining direct `ai_gateway` usage (acceptable)

- `services/ai_platform.py` — internal transport
- `services/ai_orchestrator.py` — grounded chat loop
- Whisper transcription paths (`ai_helpers`, `routes/feedback`)
- Legacy `ai_gateway_chat` in a few services pending optional follow-up (`pm_import/task_analysis`, `production_logs_service`, etc.)

## Verification

```bash
cd backend && MONGO_URL=mongodb://localhost:27017 python3 -m pytest \
  tests/test_ai_platform.py \
  tests/test_action_downtime_suggest.py \
  tests/test_architecture_convergence.py::test_ws5_ai_platform_modules_exist \
  tests/test_architecture_convergence.py::test_phase4_ai_convergence_modules_exist \
  tests/test_ai_orchestrator.py -q
```
