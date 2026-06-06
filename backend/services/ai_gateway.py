"""
Single entry point for AI chat completions — cost guard and usage logging.

Routes and services should prefer this module over direct OpenAI client usage.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from openai import AsyncOpenAI, RateLimitError

from services.ai_cost_guard import guard_ai_request, record_ai_tokens
from services.openai_service import chat_completion, chat_completion_with_images, get_model_name

logger = logging.getLogger(__name__)

_RETRY_AFTER_RE = re.compile(r"try again in ([\d.]+)s", re.IGNORECASE)
_async_client: Optional[AsyncOpenAI] = None


def _get_async_client() -> AsyncOpenAI:
    global _async_client
    if _async_client is None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not configured")
        _async_client = AsyncOpenAI(api_key=api_key)
    return _async_client


async def _call_openai_with_retry(*, max_retries: int = 4, **kwargs: Any) -> Any:
    """Retry chat completions on OpenAI 429 rate limits."""
    client = _get_async_client()
    delay = 2.0
    for attempt in range(max_retries):
        try:
            return await client.chat.completions.create(**kwargs)
        except RateLimitError as exc:
            wait: Optional[float] = None
            match = _RETRY_AFTER_RE.search(str(exc))
            if match:
                try:
                    wait = float(match.group(1)) + 0.5
                except ValueError:
                    wait = None
            if wait is None:
                wait = delay
                delay = min(delay * 2, 30.0)
            if attempt == max_retries - 1:
                raise
            logger.warning(
                "OpenAI 429 (attempt %s/%s); sleeping %.1fs",
                attempt + 1,
                max_retries,
                wait,
            )
            await asyncio.sleep(wait)
    raise RuntimeError("OpenAI rate-limit retries exhausted")


def _record_response_usage(
    response: Any,
    *,
    user_id: str,
    company_id: str,
    endpoint: str,
    model: str,
) -> None:
    usage = getattr(response, "usage", None)
    if not usage:
        return
    record_ai_tokens(
        user_id=user_id,
        company_id=company_id,
        endpoint=endpoint,
        prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
        completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
        model=model,
        feature=endpoint,
    )


def user_context(current_user: Optional[dict]) -> Tuple[str, str]:
    """Extract user/company ids from JWT payload for AI cost attribution."""
    if not current_user:
        return "anonymous", "default"
    uid = (
        current_user.get("id")
        or current_user.get("user_id")
        or current_user.get("email")
        or "anonymous"
    )
    cid = (
        current_user.get("company_id")
        or current_user.get("organization_id")
        or "default"
    )
    return str(uid), str(cid)


async def chat(
    messages: List[Dict[str, str]],
    *,
    user_id: Optional[str] = None,
    company_id: Optional[str] = None,
    endpoint: str = "ai_gateway.chat",
    model: Optional[str] = None,
    **kwargs: Any,
) -> str:
    """Run a guarded chat completion and record token usage."""
    uid = user_id or "anonymous"
    cid = company_id or "default"
    guard_ai_request(user_id=uid, company_id=cid, endpoint=endpoint)
    return await chat_completion(
        messages,
        model=model or "gpt-4o",
        user_id=uid,
        company_id=cid,
        endpoint=endpoint,
        **kwargs,
    )


async def chat_with_images(
    text_prompt: str,
    *,
    image_base64_list: Optional[List[Dict[str, str]]] = None,
    image_urls: Optional[List[str]] = None,
    user_id: Optional[str] = None,
    company_id: Optional[str] = None,
    endpoint: str = "ai_gateway.chat_with_images",
    model: Optional[str] = None,
    **kwargs: Any,
) -> str:
    """Run a guarded vision completion and record token usage."""
    uid = user_id or "anonymous"
    cid = company_id or "default"
    guard_ai_request(user_id=uid, company_id=cid, endpoint=endpoint)
    return await chat_completion_with_images(
        text_prompt,
        image_urls=image_urls,
        image_base64_list=image_base64_list,
        model=model or "gpt-4o",
        user_id=uid,
        company_id=cid,
        endpoint=endpoint,
        **kwargs,
    )


async def chat_completion_response(
    messages: List[Dict[str, Any]],
    *,
    user_id: Optional[str] = None,
    company_id: Optional[str] = None,
    endpoint: str = "ai_gateway.chat_completion_response",
    model: Optional[str] = None,
    max_retries: int = 4,
    **kwargs: Any,
) -> Any:
    """
    Guarded chat completion returning the full OpenAI response object.

    Use when callers need ``response.choices[0].message.content`` or usage metadata.
    """
    uid = user_id or "anonymous"
    cid = company_id or "default"
    guard_ai_request(user_id=uid, company_id=cid, endpoint=endpoint)
    resolved_model = get_model_name(model or "gpt-4o")
    response = await _call_openai_with_retry(
        max_retries=max_retries,
        model=resolved_model,
        messages=messages,
        **kwargs,
    )
    _record_response_usage(
        response,
        user_id=uid,
        company_id=cid,
        endpoint=endpoint,
        model=resolved_model,
    )
    return response
