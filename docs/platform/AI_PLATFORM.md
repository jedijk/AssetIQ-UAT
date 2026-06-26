# AI Platform — Platform 1.0 WS5

**Objective:** One unified stack for every AI capability in AssetIQ.

## Architecture

```
Provider Layer (ai_gateway.py)
  → Prompt Registry (ai_prompt_registry.py)
  → Context Builder (ai_context_builder.py)
  → Evidence Builder (ai_evidence_pack.py)
  → Prompt Execution (ai_platform.py / ai_orchestrator.py)
  → Output Validation (feature-specific)
  → Audit Trail (ai_cost_guard / ai_usage_service)
```

## Entry points

| Module | Use when |
|--------|----------|
| `services.ai_platform` | **Preferred** — registered prompts + context assembly |
| `services.ai_gateway` | Transport-only chat/vision (cost guard + token logging) |
| `services.ai_orchestrator` | Grounded recommendations with citations + copilot tools |
| `services.ai_evidence_pack` | Build tenant-scoped evidence dict for prompts |

Direct `openai` imports are restricted — see `scripts/ai_entry_point_report.py`.

## Prompt registry

Prompts are versioned in `ai_prompt_registry.py`:

```python
from services.ai_prompt_registry import get_prompt, list_prompts, render_prompt

spec = get_prompt("chat.threat_extraction")
text = render_prompt("chat.threat_extraction", {"equipment": "P-101"})
```

Registered prompts (bootstrap):

| ID | Version | Purpose |
|----|---------|---------|
| `chat.threat_extraction` | 1.0 | Chat state machine threat extraction |
| `chat.image_analysis` | 1.0 | Photo damage description |
| `reliability.grounded_assistant` | 1.0 | Evidence-grounded copilot |

New AI features **must** register prompts here before shipping.

## Execution

```python
from services.ai_platform import execute_prompt, execute_grounded_prompt, build_ai_context

# Simple registered prompt
result = await execute_prompt(
    "chat.threat_extraction",
    user=current_user,
    user_message="Pump P-101 is vibrating badly",
)

# With assembled context
ctx = await build_ai_context(user=current_user, equipment_id="eq-1", intent="risk_review")
result = await execute_prompt(
    "reliability.grounded_assistant",
    user=current_user,
    user_message="What should we do next?",
    context=ctx["prompt_context"],
)

# Full grounded flow (evidence + tools + citations)
grounded = await execute_grounded_prompt(
    user=current_user,
    intent="open_signals",
    query="Summarize active threats",
    equipment_id="eq-1",
)
```

## Migration status

| Area | Status |
|------|--------|
| Provider abstraction | **Done** — `ai_gateway.py` |
| Prompt registry | **Started** — 3 bootstrap prompts |
| Context builder | **Started** — evidence + reliability chain |
| Evidence builder | **Done** — `ai_evidence_pack.py` |
| Grounded orchestration | **Done** — `ai_orchestrator.py` |
| Prompt versioning in DB | **Open** |
| Migrate scattered prompts | **Open** — `ai_risk_engine.py`, `ai_helpers.py`, routes |

## Verification

```bash
cd backend && python3 -m pytest \
  tests/test_architecture_convergence.py::test_ws5_ai_platform_modules_exist \
  tests/test_architecture_convergence.py::test_phase4_ai_convergence_modules_exist \
  tests/test_ai_orchestrator.py -q
```
