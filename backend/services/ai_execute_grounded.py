"""
Universal AI execution entry point — AI Platform Completion.

Every user-facing AI capability should call ``execute_grounded()`` so responses
share one evidence model, audit trail, and response contract.
"""
from __future__ import annotations

import base64
import logging
import time
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from services.ai_evidence_pack import build_evidence_pack
from services.ai_execution_audit import log_ai_execution, new_execution_id
from services.ai_recommendation_contract import finalize_ai_recommendation_response
from services.ai_prompt_registry import get_prompt

logger = logging.getLogger(__name__)

UNIVERSAL_CONTRACT_FIELDS = (
    "recommendation",
    "summary",
    "confidence",
    "evidence",
    "citations",
    "related_entities",
    "graph_path",
    "assumptions",
    "limitations",
    "evidence_not_available",
    "suggested_actions",
    "generated_at",
    "ai_model",
    "prompt_version",
    "prompt_id",
    "execution_id",
)


def overlay_grounded_contract(domain: Dict[str, Any], grounded: Dict[str, Any]) -> Dict[str, Any]:
    """Merge universal contract fields from ``execute_grounded`` onto a domain payload."""
    merged = dict(domain)
    for key in UNIVERSAL_CONTRACT_FIELDS:
        if key in grounded:
            merged[key] = grounded[key]
    return merged


async def _resolve_vision_image(
    user: Optional[dict],
    *,
    image_base64: Optional[str] = None,
    file_id: Optional[str] = None,
) -> Tuple[str, str]:
    """
    Resolve vision input to base64 payload + media type.

    Prefers ``file_id`` from secure upload (``status=available``) when provided;
    falls back to inline ``image_base64`` for backward compatibility.
    """
    if file_id:
        from services.secure_upload_service import read_available_file_bytes

        data, media_type = await read_available_file_bytes(user or {}, file_id)
        return base64.b64encode(data).decode("ascii"), media_type

    if not image_base64:
        raise HTTPException(status_code=400, detail="image_base64 or file_id is required")

    clean = image_base64
    media_type = "image/jpeg"
    if "base64," in clean:
        prefix, clean = clean.split("base64,", 1)
        if prefix.startswith("data:") and ";" in prefix:
            media_type = prefix[5:].split(";", 1)[0] or media_type
    try:
        base64.b64decode(clean)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 image data") from exc
    return clean, media_type


def _graph_path_from_evidence(evidence: Dict[str, Any]) -> List[Dict[str, Any]]:
    path: List[Dict[str, Any]] = []
    for edge in (evidence.get("graph_edges") or [])[:15]:
        path.append({
            "type": edge.get("relationship") or edge.get("type") or "edge",
            "label": edge.get("label") or edge.get("target_label") or edge.get("id"),
            "entity_id": edge.get("target_id") or edge.get("id"),
        })
    for ent in (evidence.get("entities") or [])[:5]:
        path.append({
            "type": ent.get("type", "entity"),
            "label": ent.get("label") or ent.get("id"),
            "entity_id": ent.get("id"),
        })
    return path


def _related_entities(evidence: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for ent in evidence.get("entities") or []:
        if isinstance(ent, dict):
            out.append(ent)
    for sig in (evidence.get("open_signals") or [])[:10]:
        if isinstance(sig, dict):
            out.append({"type": "observation", **sig})
    return out


def _missing_evidence_notes(evidence: Dict[str, Any]) -> List[str]:
    missing: List[str] = []
    if not evidence.get("entities"):
        missing.append("equipment_context")
    if not evidence.get("graph_edges"):
        missing.append("graph_path")
    if not evidence.get("open_signals"):
        missing.append("recent_observations")
    if not (evidence.get("kpis") or {}):
        missing.append("executive_kpis")
    return missing


def _confidence_from_evidence(evidence: Dict[str, Any], parsed: Optional[Dict[str, Any]]) -> str:
    if parsed and parsed.get("confidence"):
        return str(parsed["confidence"])
    cites = evidence.get("citations") or []
    edges = evidence.get("graph_edges") or []
    if cites and edges:
        return "high"
    if cites or edges:
        return "medium"
    return "low"


async def execute_grounded(
    *,
    user: Optional[dict],
    intent: str,
    query: str,
    feature: str,
    equipment_id: Optional[str] = None,
    prompt_id: str = "reliability.grounded_assistant",
    tools: Optional[List[str]] = None,
    db=None,
    copilot_service=None,
    include_fleet: bool = False,
    endpoint: Optional[str] = None,
    model: Optional[str] = None,
    temperature: float = 0.3,
    max_tokens: int = 1200,
    parse_json: bool = False,
    json_default: Optional[Dict[str, Any]] = None,
    extra_context: Optional[str] = None,
    image_base64: Optional[str] = None,
    file_id: Optional[str] = None,
    media_type: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Single supported AI execution pipeline for AssetIQ.

    Flow: permission context (caller) → evidence pack → prompt registry → LLM →
    universal response → audit log.
    """
    execution_id = new_execution_id()
    started = time.perf_counter()
    ep = endpoint or f"ai_execute_grounded.{feature}"
    spec = get_prompt(prompt_id)
    ai_model = model or spec.default_model

    evidence = await build_evidence_pack(
        user=user,
        equipment_id=equipment_id,
        intent=intent,
        include_fleet=include_fleet,
        database=db,
    )

    citations = list(evidence.get("citations") or [])
    evidence_summary = evidence.get("prompt_summary") or ""
    context_parts = [evidence_summary]
    if extra_context:
        context_parts.append(extra_context)
    assembled_context = "\n\n".join(p for p in context_parts if p)

    parsed: Optional[Dict[str, Any]] = None
    summary_text = ""
    suggested_actions: List[Any] = []
    limitations: List[str] = []

    vision_image: Optional[str] = None
    vision_media_type = media_type or "image/jpeg"

    try:
        if image_base64 or file_id:
            vision_image, vision_media_type = await _resolve_vision_image(
                user,
                image_base64=image_base64,
                file_id=file_id,
            )
            if file_id:
                from services.ai_citation import make_citation

                citations.append(
                    make_citation(
                        id=file_id,
                        type="upload",
                        label="Uploaded image",
                        url_path=f"/files/{file_id}",
                    )
                )

        if vision_image:
            from services.ai_platform import execute_vision_json_prompt

            user_message = query
            if assembled_context:
                user_message = f"{assembled_context}\n\n{query}" if query else assembled_context

            result = await execute_vision_json_prompt(
                prompt_id,
                user=user,
                user_message=user_message,
                image_base64=vision_image,
                media_type=vision_media_type,
                endpoint=ep,
                model=ai_model,
                temperature=temperature,
                max_tokens=max_tokens,
                default=json_default or {},
            )
            parsed = result.get("parsed") if isinstance(result.get("parsed"), dict) else {}
            summary_text = (
                (parsed or {}).get("overall_assessment")
                or (parsed or {}).get("summary")
                or (parsed or {}).get("answer")
                or result.get("content")
                or ""
            )
            suggested_actions = (
                (parsed or {}).get("recommended_actions")
                or (parsed or {}).get("recommendations")
                or (parsed or {}).get("suggested_actions")
                or (parsed or {}).get("actions")
                or []
            )
            if (parsed or {}).get("limitations"):
                lim = parsed["limitations"]
                limitations = lim if isinstance(lim, list) else [str(lim)]
        elif parse_json:
            from services.ai_platform import execute_json_prompt

            result = await execute_json_prompt(
                prompt_id,
                user=user,
                user_message=query,
                context=assembled_context,
                endpoint=ep,
                model=ai_model,
                temperature=temperature,
                max_tokens=max_tokens,
                default=json_default or {},
            )
            parsed = result.get("parsed") if isinstance(result.get("parsed"), dict) else {}
            summary_text = (
                (parsed or {}).get("summary")
                or (parsed or {}).get("answer")
                or result.get("content")
                or ""
            )
            suggested_actions = (
                (parsed or {}).get("recommendations")
                or (parsed or {}).get("suggested_actions")
                or (parsed or {}).get("actions")
                or []
            )
            if (parsed or {}).get("limitations"):
                lim = parsed["limitations"]
                limitations = lim if isinstance(lim, list) else [str(lim)]
        else:
            from services.ai_orchestrator import run_grounded_recommendation

            grounded = await run_grounded_recommendation(
                user=user,
                intent=intent,
                equipment_id=equipment_id,
                query=query,
                tools=tools,
                db=db,
                copilot_service=copilot_service,
                include_fleet=include_fleet,
                endpoint=ep,
                model=ai_model,
                temperature=temperature,
                max_tokens=max_tokens,
                extra_context=extra_context,
            )
            summary_text = grounded.get("answer") or grounded.get("summary") or ""
            citations = list(grounded.get("citations") or citations)
            if grounded.get("evidence"):
                evidence = {**evidence, **(grounded.get("evidence") or {})}

        missing = _missing_evidence_notes(evidence)
        if missing:
            limitations = list(dict.fromkeys([*limitations, f"Missing evidence: {', '.join(missing)}"]))

        confidence = _confidence_from_evidence(evidence, parsed)
        graph_path = _graph_path_from_evidence(evidence)
        related = _related_entities(evidence)

        raw: Dict[str, Any] = {
            "recommendation": summary_text,
            "summary": summary_text,
            "confidence": confidence,
            "evidence": evidence,
            "related_entities": related,
            "graph_path": graph_path,
            "assumptions": (parsed or {}).get("assumptions") or [],
            "limitations": limitations or None,
            "evidence_not_available": not bool(citations),
            "suggested_actions": suggested_actions,
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "ai_model": ai_model,
            "prompt_version": spec.version,
            "prompt_id": prompt_id,
            "execution_id": execution_id,
            "intent": intent,
            "feature": feature,
        }
        if parsed:
            raw["parsed"] = parsed
            # Preserve domain payloads alongside universal contract
            for key in (
                "probable_causes",
                "root",
                "top_event",
                "forecasts",
                "recommendations",
                "damage_detected",
                "severity",
                "findings",
                "overall_assessment",
                "requires_immediate_attention",
            ):
                if key in parsed and key not in raw:
                    raw[key] = parsed[key]

        response = finalize_ai_recommendation_response(
            raw,
            citations=citations,
            evidence=evidence,
        )
        response["execution_id"] = execution_id
        response["ai_model"] = ai_model
        response["prompt_version"] = spec.version
        response["prompt_id"] = prompt_id
        response["generated_at"] = raw["generated_at"]
        response["graph_path"] = graph_path
        response["related_entities"] = related
        response["suggested_actions"] = suggested_actions
        response["recommendation"] = summary_text

        duration_ms = int((time.perf_counter() - started) * 1000)
        await log_ai_execution(
            execution_id=execution_id,
            feature=feature,
            intent=intent,
            user_id=(user or {}).get("id"),
            tenant_id=(user or {}).get("tenant_id") or (user or {}).get("company_id"),
            prompt_id=prompt_id,
            prompt_version=spec.version,
            ai_model=ai_model,
            duration_ms=duration_ms,
            evidence_ids=[str(c.get("id")) for c in citations if c.get("id")],
            graph_entity_ids=[str(e.get("entity_id")) for e in graph_path if e.get("entity_id")],
            equipment_id=equipment_id,
            details={
                "endpoint": ep,
                "parse_json": parse_json,
                "vision": bool(vision_image),
                "file_id": file_id,
            },
        )
        return response

    except Exception as exc:
        duration_ms = int((time.perf_counter() - started) * 1000)
        await log_ai_execution(
            execution_id=execution_id,
            feature=feature,
            intent=intent,
            user_id=(user or {}).get("id"),
            tenant_id=(user or {}).get("tenant_id") or (user or {}).get("company_id"),
            prompt_id=prompt_id,
            prompt_version=spec.version,
            ai_model=ai_model,
            duration_ms=duration_ms,
            equipment_id=equipment_id,
            result="failure",
            reason=str(exc)[:500],
        )
        logger.exception("execute_grounded failed feature=%s intent=%s", feature, intent)
        raise
