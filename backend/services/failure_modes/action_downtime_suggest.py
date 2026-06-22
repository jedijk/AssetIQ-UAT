"""Suggest whether failure-mode recommended actions require equipment downtime."""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List

from services.ai_gateway import chat_completion_response

logger = logging.getLogger(__name__)

_CLASSIFY_CHUNK_SIZE = 4

_SYSTEM_PROMPT = """You are a maintenance reliability engineer.
For each maintenance action, decide whether performing it requires taking the equipment or process unit out of service (shutdown / isolation / downtime).

Set requires_downtime=true when:
- Equipment must be shut down, isolated, locked out, depressurized, or drained
- Intrusive work needs internal access while the process cannot run safely
- Major component replacement, overhaul, or repair that cannot be done online

Set requires_downtime=false when:
- The action can be performed during normal operation (rounds, external inspection, lubrication while running, sampling, monitoring, minor adjustments)
- Predictive monitoring (vibration, thermography, oil analysis) without stopping equipment
- Operator or procedural changes with no physical shutdown

Return JSON only."""


async def _suggest_chunk(
    actions: List[Dict[str, Any]],
    *,
    user_id: str,
    company_id: str,
    endpoint: str,
) -> List[Dict[str, Any]]:
    payload = [
        {
            "i": idx,
            "description": (a.get("description") or "")[:320],
            "action_type": a.get("action_type") or "",
            "failure_mode": (a.get("failure_mode") or "")[:120],
            "equipment": (a.get("equipment") or "")[:120],
        }
        for idx, a in enumerate(actions)
    ]

    user_prompt = f"""For each action below, return:
- "i": same index you received
- "requires_downtime": true or false
- "reasoning": one concise sentence (<= 20 words) explaining the decision

Actions:
{json.dumps(payload, indent=2)}

Return JSON: {{"results": [{{"i": 0, "requires_downtime": false, "reasoning": "..."}}]}}"""

    max_tokens = min(1600, max(300, len(actions) * 80 + 120))
    response = await chat_completion_response(
        user_id=user_id,
        company_id=company_id,
        endpoint=endpoint,
        max_retries=2,
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0,
        max_tokens=max_tokens,
        seed=42,
        response_format={"type": "json_object"},
    )
    try:
        content = (response.choices[0].message.content or "").strip()
        data = json.loads(content)
    except (json.JSONDecodeError, AttributeError, IndexError, TypeError) as exc:
        logger.error("Downtime classifier JSON parse failed: %s", exc)
        return _fallback_results(actions)

    raw_results = data.get("results") or []

    by_index: Dict[int, Dict[str, Any]] = {}
    for r in raw_results:
        if not isinstance(r, dict):
            continue
        try:
            by_index[int(r.get("i"))] = r
        except (TypeError, ValueError):
            continue

    results: List[Dict[str, Any]] = []
    for idx, a in enumerate(actions):
        r = by_index.get(idx, {})
        suggested = bool(r.get("requires_downtime"))
        current = bool(a.get("current_requires_downtime"))
        entry: Dict[str, Any] = {
            "action_index": a.get("action_index"),
            "current_requires_downtime": current,
            "suggested_requires_downtime": suggested,
            "reasoning": (r.get("reasoning") or "").strip()[:300]
            or "Classified by AI reliability engineer.",
            "changed": suggested != current,
        }
        if a.get("fm_id"):
            entry["fm_id"] = a["fm_id"]
        if a.get("failure_mode"):
            entry["failure_mode"] = a["failure_mode"]
        results.append(entry)
    return results


def _fallback_results(actions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Safe defaults when the LLM response cannot be parsed."""
    out: List[Dict[str, Any]] = []
    for a in actions:
        current = bool(a.get("current_requires_downtime"))
        entry: Dict[str, Any] = {
            "action_index": a.get("action_index"),
            "current_requires_downtime": current,
            "suggested_requires_downtime": current,
            "reasoning": "AI response could not be parsed; kept current value.",
            "changed": False,
        }
        if a.get("fm_id"):
            entry["fm_id"] = a["fm_id"]
        if a.get("failure_mode"):
            entry["failure_mode"] = a["failure_mode"]
        out.append(entry)
    return out


async def classify_recommended_actions_downtime_batch(
    actions: List[Dict[str, Any]],
    *,
    user_id: str,
    company_id: str,
    endpoint: str = "ai_fm_suggestions.review_action_downtime",
) -> List[Dict[str, Any]]:
    """
    Classify one proxy-safe batch in a single OpenAI call.

    Railway/Vercel proxies time out around 60s; do not chain multiple LLM calls
    per HTTP request for library-wide bulk review.
    """
    if not actions:
        return []
    if len(actions) > _CLASSIFY_CHUNK_SIZE:
        raise ValueError(
            f"Send at most {_CLASSIFY_CHUNK_SIZE} actions per batch (got {len(actions)})."
        )
    return await _suggest_chunk(
        actions,
        user_id=user_id,
        company_id=company_id,
        endpoint=endpoint,
    )


async def suggest_action_downtime_requirements(
    actions: List[Dict[str, Any]],
    *,
    user_id: str,
    company_id: str,
    endpoint: str = "ai_fm_suggestions.suggest_action_downtime",
) -> List[Dict[str, Any]]:
    """
    Classify whether each action requires equipment downtime.

    Each action dict must include: action_index, description.
    Optional: action_type, current_requires_downtime, failure_mode, equipment.
    """
    if not actions:
        return []

    results: List[Dict[str, Any]] = []
    for start in range(0, len(actions), _CLASSIFY_CHUNK_SIZE):
        chunk = actions[start : start + _CLASSIFY_CHUNK_SIZE]
        chunk_results = await _suggest_chunk(
            chunk,
            user_id=user_id,
            company_id=company_id,
            endpoint=endpoint,
        )
        results.extend(chunk_results)
    return results
