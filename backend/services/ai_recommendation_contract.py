"""Lightweight AI recommendation response contract — evidence, citations, confidence."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from services.ai_citation import attach_citations_to_response

_CRITICAL_IMPACT = frozenset({"critical", "high"})
_CRITICAL_LEVELS = frozenset({"critical", "high"})


def _recommendation_items(payload: Dict[str, Any], key: str) -> List[Any]:
    items = payload.get(key)
    if isinstance(items, list):
        return items
    for alt in ("recommendations", "actions", "suggestions"):
        if alt != key and isinstance(payload.get(alt), list):
            return payload[alt]
    return []


def _is_critical_recommendation(item: Dict[str, Any]) -> bool:
    impact = str(item.get("impact") or item.get("priority") or "").lower()
    if impact in _CRITICAL_IMPACT:
        return True
    level = str(item.get("risk_level") or item.get("severity") or "").lower()
    return level in _CRITICAL_LEVELS


def enrich_recommendations_with_evidence(
    recommendations: Sequence[Any],
    citations: Sequence[Dict[str, Any]],
) -> List[Any]:
    """Attach real citation references to recommendations when evidence exists."""
    if not citations:
        return list(recommendations)

    citation_ids = [str(c.get("id")) for c in citations if c.get("id")]
    primary = citations[0]
    enriched: List[Any] = []
    for rec in recommendations:
        if not isinstance(rec, dict):
            enriched.append(rec)
            continue
        item = dict(rec)
        if citation_ids and not item.get("source_refs") and not item.get("citation_ids"):
            item["source_refs"] = list(citation_ids[:5])
        if not item.get("supporting_evidence"):
            item["supporting_evidence"] = [
                {
                    "citation_id": primary.get("id"),
                    "label": primary.get("label"),
                    "type": primary.get("type"),
                }
            ]
        if _is_critical_recommendation(item) and not item.get("confidence"):
            item["confidence"] = item.get("confidence_level") or "medium"
        enriched.append(item)
    return enriched


def finalize_ai_recommendation_response(
    response_dict: Dict[str, Any],
    *,
    citations: Optional[List[Dict[str, Any]]] = None,
    evidence: Optional[Dict[str, Any]] = None,
    recommendations_key: str = "recommendations",
) -> Dict[str, Any]:
    """
    Finalize a user-facing AI recommendation payload.

    - Attach citations/evidence metadata when available.
    - Set ``evidence_not_available=true`` when no citations were supplied.
    - Enrich recommendations with source refs only from supplied citations (never invented).
    """
    cites = list(citations or [])
    out = attach_citations_to_response(response_dict, cites, evidence=evidence)
    out["evidence_not_available"] = not bool(cites)

    if evidence and "evidence" not in out:
        out["evidence"] = evidence

    if out.get("recommendation") and not out.get("summary"):
        out["summary"] = out["recommendation"]
    elif out.get("summary") and not out.get("recommendation"):
        out["recommendation"] = out["summary"]

    suggested = out.get("suggested_actions")
    if suggested and not out.get("recommendations"):
        out["recommendations"] = suggested

    recs = _recommendation_items(out, recommendations_key)
    if recs and cites:
        enriched = enrich_recommendations_with_evidence(recs, cites)
        out[recommendations_key] = enriched
        if recommendations_key != "recommendations" and "recommendations" not in out:
            pass
        elif recommendations_key == "recommendations":
            out["recommendations"] = enriched

    return out


def validate_ai_recommendation_response(payload: Dict[str, Any]) -> List[str]:
    """Return human-readable contract violations (empty list = OK)."""
    violations: List[str] = []
    cites = payload.get("citations") or []
    evidence_flag = payload.get("evidence_not_available")

    if cites and evidence_flag is True:
        violations.append("evidence_not_available=true but citations are present")
    if not cites and evidence_flag is not True:
        violations.append("missing evidence_not_available=true when citations are empty")

    recs = _recommendation_items(payload, "recommendations")
    for idx, rec in enumerate(recs):
        if not isinstance(rec, dict):
            continue
        if _is_critical_recommendation(rec) and cites:
            if not rec.get("confidence") and not rec.get("confidence_level"):
                violations.append(f"recommendations[{idx}] missing confidence")
            if not rec.get("source_refs") and not rec.get("citation_ids"):
                violations.append(f"recommendations[{idx}] missing source_refs")
    return violations
