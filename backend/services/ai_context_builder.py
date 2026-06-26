"""
Context assembly for AI prompts — Platform 1.0 WS5.

Composes tenant-scoped operational context before prompt execution.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from services.ai_evidence_pack import build_evidence_pack
from services.reliability_context_service import (
    ReliabilityContextService,
    format_context_for_prompt,
)


async def build_ai_context(
    *,
    user: Optional[dict],
    equipment_id: Optional[str] = None,
    intent: Optional[str] = None,
    include_fleet: bool = False,
    include_reliability_chain: bool = True,
    database=None,
) -> Dict[str, Any]:
    """
    Build structured context for AI execution.

    Returns dict with: evidence, reliability_context, prompt_blocks.
    """
    evidence = await build_evidence_pack(
        user=user,
        equipment_id=equipment_id,
        intent=intent,
        include_fleet=include_fleet,
        database=database,
    )

    reliability_text = ""
    if include_reliability_chain and equipment_id and user:
        user_id = user.get("id") or user.get("user_id") or "anonymous"
        svc = ReliabilityContextService(database) if database else ReliabilityContextService()
        chain = await svc.get_context(equipment_id, user_id, user=user, use_cache=True)
        if chain and chain.get("found"):
            reliability_text = format_context_for_prompt(chain)

    prompt_blocks = []
    if evidence.get("prompt_summary"):
        prompt_blocks.append(evidence["prompt_summary"])
    if reliability_text:
        prompt_blocks.append(reliability_text)

    return {
        "evidence": evidence,
        "reliability_context": reliability_text,
        "prompt_blocks": prompt_blocks,
        "prompt_context": "\n\n".join(prompt_blocks).strip(),
    }
