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
from services.ai_output_validation import parse_json_from_llm
from services.ai_prompt_registry import get_prompt, list_prompts, render_prompt

logger = logging.getLogger(__name__)

__all__ = [
    "build_ai_context",
    "execute_grounded",
    "execute_grounded_prompt",
    "execute_json_prompt",
    "execute_multimodal_json_prompt",
    "execute_prompt",
    "execute_vision_json_prompt",
    "finalize_recommendation_response",
    "get_prompt",
    "list_prompts",
    "parse_json_from_llm",
    "render_prompt",
    "user_context",
]


async def execute_grounded(*args, **kwargs):
    """Lazy export — implementation lives in ``services.ai_execute_grounded``."""
    from services.ai_execute_grounded import execute_grounded as _execute_grounded

    return await _execute_grounded(*args, **kwargs)


async def _completion_content(
    messages: List[Dict[str, Any]],
    *,
    uid: str,
    cid: str,
    endpoint: str,
    model: str,
    temperature: float,
    max_tokens: int,
    gateway_kwargs: Dict[str, Any],
) -> str:
    """Run chat completion; uses retry transport when max_retries is set."""
    kwargs = dict(gateway_kwargs)
    max_retries = int(kwargs.pop("max_retries", 0) or 0)
    if max_retries > 0:
        from services.ai_gateway import chat_completion_response

        response = await chat_completion_response(
            messages,
            user_id=uid,
            company_id=cid,
            endpoint=endpoint,
            model=model,
            max_retries=max_retries,
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs,
        )
        return response.choices[0].message.content
    return await ai_gateway_chat(
        messages,
        user_id=uid,
        company_id=cid,
        endpoint=endpoint,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        **kwargs,
    )


async def execute_prompt(
    prompt_id: str,
    *,
    user: Optional[dict] = None,
    user_message: str,
    variables: Optional[Dict[str, str]] = None,
    context: Optional[str] = None,
    equipment_id: Optional[str] = None,
    intent: Optional[str] = None,
    endpoint: Optional[str] = None,
    model: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: int = 1200,
    extra_messages: Optional[List[Dict[str, str]]] = None,
    **gateway_kwargs: Any,
) -> Dict[str, Any]:
    """
    Execute a registered prompt with optional assembled context.

    Returns: {content, prompt_id, prompt_version, model, endpoint}
    """
    spec = get_prompt(prompt_id)
    uid, cid = user_context(user)
    ep = endpoint or f"ai_platform.{prompt_id}"

    system_text = render_prompt(prompt_id, variables) if variables else spec.text
    if context:
        system_text = f"{system_text}\n\n---\nContext:\n{context}"

    messages: List[Dict[str, str]] = [{"role": "system", "content": system_text}]
    if extra_messages:
        messages.extend(extra_messages)
    messages.append({"role": "user", "content": user_message})

    content = await _completion_content(
        messages,
        uid=uid,
        cid=cid,
        endpoint=ep,
        model=model or spec.default_model,
        temperature=temperature,
        max_tokens=max_tokens,
        gateway_kwargs=gateway_kwargs,
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


async def execute_json_prompt(
    prompt_id: str,
    *,
    user: Optional[dict] = None,
    user_message: str,
    variables: Optional[Dict[str, str]] = None,
    context: Optional[str] = None,
    equipment_id: Optional[str] = None,
    intent: Optional[str] = None,
    endpoint: Optional[str] = None,
    model: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: int = 1200,
    extra_messages: Optional[List[Dict[str, str]]] = None,
    default: Optional[Dict[str, Any]] = None,
    **gateway_kwargs: Any,
) -> Dict[str, Any]:
    """Execute a registered prompt and parse JSON from the model response."""
    spec = get_prompt(prompt_id)
    system_text = render_prompt(prompt_id, variables) if variables else spec.text
    if context:
        system_text = f"{system_text}\n\n---\nContext:\n{context}"

    uid, cid = user_context(user)
    ep = endpoint or f"ai_platform.{prompt_id}"

    messages: List[Dict[str, str]] = [{"role": "system", "content": system_text}]
    if extra_messages:
        messages.extend(extra_messages)
    messages.append({"role": "user", "content": user_message})

    content = await _completion_content(
        messages,
        uid=uid,
        cid=cid,
        endpoint=ep,
        model=model or spec.default_model,
        temperature=temperature,
        max_tokens=max_tokens,
        gateway_kwargs=gateway_kwargs,
    )
    parsed = parse_json_from_llm(content, default=default)

    return {
        "content": content,
        "parsed": parsed,
        "prompt_id": spec.id,
        "prompt_version": spec.version,
        "model": model or spec.default_model,
        "endpoint": ep,
        "equipment_id": equipment_id,
        "intent": intent,
    }


async def execute_vision_json_prompt(
    prompt_id: str,
    *,
    user: Optional[dict] = None,
    user_message: str,
    image_base64: str,
    media_type: str = "image/jpeg",
    variables: Optional[Dict[str, str]] = None,
    prompt_text: Optional[str] = None,
    endpoint: Optional[str] = None,
    model: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: int = 1200,
    default: Optional[Dict[str, Any]] = None,
    **gateway_kwargs: Any,
) -> Dict[str, Any]:
    """Execute a registered prompt with a single image and parse JSON from the response."""
    from services.ai_gateway import chat_with_images

    spec = get_prompt(prompt_id)
    if prompt_text is not None:
        full_prompt = f"{prompt_text}\n\n{user_message}" if user_message else prompt_text
    else:
        system_text = render_prompt(prompt_id, variables) if variables else spec.text
        full_prompt = f"{system_text}\n\n{user_message}"
    uid, cid = user_context(user)
    ep = endpoint or f"ai_platform.{prompt_id}"

    content = await chat_with_images(
        full_prompt,
        image_base64_list=[{"data": image_base64, "media_type": media_type}],
        user_id=uid,
        company_id=cid,
        endpoint=ep,
        model=model or spec.default_model,
        temperature=temperature,
        max_tokens=max_tokens,
        **gateway_kwargs,
    )
    parsed = parse_json_from_llm(content, default=default)
    return {
        "content": content,
        "parsed": parsed,
        "prompt_id": spec.id,
        "prompt_version": spec.version,
        "model": model or spec.default_model,
        "endpoint": ep,
    }


async def execute_multimodal_json_prompt(
    prompt_id: str,
    *,
    user: Optional[dict] = None,
    user_content: Any,
    variables: Optional[Dict[str, str]] = None,
    endpoint: Optional[str] = None,
    model: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: int = 1200,
    default: Optional[Dict[str, Any]] = None,
    **gateway_kwargs: Any,
) -> Dict[str, Any]:
    """Execute a registered prompt with multimodal user content (e.g. text + image)."""
    spec = get_prompt(prompt_id)
    system_text = render_prompt(prompt_id, variables) if variables else spec.text
    uid, cid = user_context(user)
    ep = endpoint or f"ai_platform.{prompt_id}"
    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": system_text},
        {"role": "user", "content": user_content},
    ]
    content = await _completion_content(
        messages,
        uid=uid,
        cid=cid,
        endpoint=ep,
        model=model or spec.default_model,
        temperature=temperature,
        max_tokens=max_tokens,
        gateway_kwargs=gateway_kwargs,
    )
    parsed = parse_json_from_llm(content, default=default)
    return {
        "content": content,
        "parsed": parsed,
        "prompt_id": spec.id,
        "prompt_version": spec.version,
        "model": model or spec.default_model,
        "endpoint": ep,
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
    feature: str = "grounded_assistant",
) -> Dict[str, Any]:
    """Grounded execution via the universal ``execute_grounded`` pipeline."""
    from services.ai_execute_grounded import execute_grounded

    return await execute_grounded(
        user=user,
        intent=intent,
        query=query,
        feature=feature,
        equipment_id=equipment_id,
        prompt_id=prompt_id,
        tools=tools,
        db=db,
        copilot_service=copilot_service,
        include_fleet=include_fleet,
        endpoint=endpoint,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        parse_json=False,
    )


def finalize_recommendation_response(
    response_dict: Dict[str, Any],
    *,
    citations: Optional[List[Dict[str, Any]]] = None,
    evidence: Optional[Dict[str, Any]] = None,
    recommendations_key: str = "recommendations",
    validate: bool = True,
) -> Dict[str, Any]:
    """
    Gateway-boundary wrapper for user-facing AI recommendation payloads.

    Attaches citations, sets evidence_not_available, and optionally validates
    against the shared AIRecommendationResponse contract.
    """
    from services.ai_recommendation_contract import finalize_ai_recommendation_response
    from services.ai_recommendation_schema import validate_ai_recommendation_schema

    out = finalize_ai_recommendation_response(
        response_dict,
        citations=citations,
        evidence=evidence,
        recommendations_key=recommendations_key,
    )
    if validate:
        violations = validate_ai_recommendation_schema(out)
        if violations:
            logger.warning(
                "AI recommendation contract violations: %s",
                "; ".join(violations),
            )
    return out
