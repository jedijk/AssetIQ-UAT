"""
Single entry point for AI chat completions — cost guard and usage logging.

Routes and services should prefer this module over direct OpenAI client usage.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from services.ai_cost_guard import guard_ai_request
from services.openai_service import chat_completion, chat_completion_with_images


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
