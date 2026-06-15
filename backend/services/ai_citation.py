"""Citation framework for grounded AI responses — Convergence Phase 4."""
from __future__ import annotations

from typing import Any, Dict, List, Optional


def make_citation(
    *,
    id: str,
    type: str,
    label: str,
    url_path: str,
) -> Dict[str, str]:
    """Build a single citation record for evidence-backed AI responses."""
    return {
        "id": str(id),
        "type": type,
        "label": label,
        "url_path": url_path,
    }


def format_citations_for_prompt(citations: List[Dict[str, Any]]) -> str:
    """Render citations as a compact block for LLM system/user prompts."""
    if not citations:
        return ""
    lines = ["Available citations (reference inline as [cite:<id>]):"]
    for cite in citations[:40]:
        lines.append(
            f"  - [{cite.get('type')}] {cite.get('id')}: "
            f"{cite.get('label')} → {cite.get('url_path')}"
        )
    return "\n".join(lines)


def attach_citations_to_response(
    response_dict: Dict[str, Any],
    citations: List[Dict[str, Any]],
    *,
    evidence: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Attach evidence metadata and citations to an AI response payload."""
    out = dict(response_dict)
    out["citations"] = citations
    if evidence is not None:
        out["evidence"] = evidence
    return out
