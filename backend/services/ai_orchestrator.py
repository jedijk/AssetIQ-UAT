"""
Grounded AI orchestration — Convergence Phase 4.

Flow: Evidence Pack → optional copilot tools → ai_gateway.chat with citations.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from services.ai_citation import attach_citations_to_response, format_citations_for_prompt
from services.ai_evidence_pack import build_evidence_pack
from services.ai_gateway import chat as ai_gateway_chat, user_context

logger = logging.getLogger(__name__)

_GROUNDED_SYSTEM_PROMPT = """You are an AssetIQ reliability AI assistant.

Rules:
- Answer using ONLY the provided evidence and tool results.
- Cite sources inline as [cite:<id>] when referencing specific entities, KPIs, or graph edges.
- End with a "Sources" section listing cited IDs.
- Be concise, actionable, and focused on reliability and maintenance.
- Use markdown formatting when helpful."""


async def run_grounded_recommendation(
    *,
    user: Optional[dict],
    intent: str,
    equipment_id: Optional[str] = None,
    query: Optional[str] = None,
    tools: Optional[List[str]] = None,
    db=None,
    copilot_service=None,
    include_fleet: bool = False,
    endpoint: str = "ai_orchestrator.grounded",
    model: str = "gpt-4o",
    temperature: float = 0.3,
    max_tokens: int = 1200,
    extra_context: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build evidence, optionally invoke copilot tools, and return a grounded AI response.
    """
    evidence = await build_evidence_pack(
        user=user,
        equipment_id=equipment_id,
        intent=intent,
        include_fleet=include_fleet,
        database=db,
    )

    tool_results: Dict[str, Any] = {}
    if tools and equipment_id and copilot_service is not None:
        for tool_name in tools:
            try:
                result = await copilot_service._invoke_copilot_tool(
                    tool_name,
                    equipment_id,
                    current_user=user,
                )
                if result is not None:
                    tool_results[tool_name] = result
            except Exception as exc:
                logger.warning("copilot tool %s failed: %s", tool_name, exc)

    uid, cid = user_context(user)
    citation_block = format_citations_for_prompt(evidence.get("citations") or [])
    evidence_text = evidence.get("prompt_summary") or ""
    user_parts = [
        f"Intent: {intent}",
        f"Query: {query or ''}",
        "",
        "Evidence:",
        evidence_text,
    ]
    if citation_block:
        user_parts.extend(["", citation_block])
    if tool_results:
        user_parts.extend(
            [
                "",
                "Tool results:",
                json.dumps(tool_results, default=str)[:8000],
            ]
        )
    if extra_context:
        user_parts.extend(["", "Additional context:", extra_context])

    answer = await ai_gateway_chat(
        [
            {"role": "system", "content": _GROUNDED_SYSTEM_PROMPT},
            {"role": "user", "content": "\n".join(user_parts)},
        ],
        user_id=uid,
        company_id=cid,
        endpoint=endpoint,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
    )

    base = {
        "answer": answer,
        "intent": intent,
        "tool_results": tool_results or None,
    }
    return attach_citations_to_response(
        base,
        evidence.get("citations") or [],
        evidence=evidence,
    )
