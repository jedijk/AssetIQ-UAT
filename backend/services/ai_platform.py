"""
Unified AI platform entry point — Platform 1.0 WS5.

Provider → Prompt Registry → Context Builder → Execution → Audit

Routes and services should prefer this module (or ai_gateway for transport-only calls).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from services.ai_context_builder import build_ai_context
from services.ai_gateway import chat as ai_gateway_chat, user_context
from services.ai_prompt_registry import get_prompt, list_prompts, render_prompt

logger = logging.getLogger(__name__)

__all__ = [
    "build_ai_context",
    "execute_grounded_prompt",
    "execute_prompt",
    "get_prompt",
    "list_prompts",
    "render_prompt",
    "user_context",
]


async def execute_prompt(
    prompt_id: str,
    *,
    user: Optional[dict] = None,
    user_message: str,
    context: Optional[str] = None,
    equipment_id: Optional[str] = None,
    intent: Optional[str] = None,
    endpoint: Optional[str] = None,
    model: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: int = 1200,
    extra_messages: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    Execute a registered prompt with optional assembled context.

    Returns: {content, prompt_id, prompt_version, model, endpoint}
    """
    spec = get_prompt(prompt_id)
    uid, cid = user_context(user)
    ep = endpoint or f"ai_platform.{prompt_id}"

    system_text = spec.text
    if context:
        system_text = f"{system_text}\n\n---\nContext:\n{context}"

    messages: List[Dict[str, str]] = [{"role": "system", "content": system_text}]
    if extra_messages:
        messages.extend(extra_messages)
    messages.append({"role": "user", "content": user_message})

    content = await ai_gateway_chat(
        messages,
        user_id=uid,
        company_id=cid,
        endpoint=ep,
        model=model or spec.default_model,
        temperature=temperature,
        max_tokens=max_tokens,
    )

    return {
        "content": content,
        "prompt_id": spec.id,
        "prompt_version": spec.version,
        "model": model or spec.default_model,
        "endpoint": ep,
        "equipment_id": equipment_id,
        "intent": intent,
    }


async def execute_grounded_prompt(
    *,
    user: Optional[dict],
    intent: str,
    query: str,
    equipment_id: Optional[str] = None,
    prompt_id: str = "reliability.grounded_assistant",
    tools: Optional[List[str]] = None,
    db=None,
    copilot_service=None,
    include_fleet: bool = False,
    endpoint: str = "ai_platform.grounded",
    model: Optional[str] = None,
    temperature: float = 0.3,
    max_tokens: int = 1200,
) -> Dict[str, Any]:
    """
    Grounded execution: evidence pack + optional copilot tools + registered prompt.
    """
    from services.ai_citation import attach_citations_to_response, format_citations_for_prompt
    from services.ai_orchestrator import run_grounded_recommendation

    # Delegate to orchestrator (citations + tool loop); pass prompt_id for future registry wiring
    result = await run_grounded_recommendation(
        user=user,
        intent=intent,
        equipment_id=equipment_id,
        query=query,
        tools=tools,
        db=db,
        copilot_service=copilot_service,
        include_fleet=include_fleet,
        endpoint=endpoint,
        model=model or get_prompt(prompt_id).default_model,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    result["prompt_id"] = prompt_id
    result["prompt_version"] = get_prompt(prompt_id).version
    return result
