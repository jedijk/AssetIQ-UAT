"""
Single entry point for AI chat completions — cost guard and usage logging.

Routes and services should prefer this module over direct OpenAI client usage.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from services.ai_cost_guard import guard_ai_request
from services.openai_service import chat_completion


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
