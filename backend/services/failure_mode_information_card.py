"""Failure Mode Information Card generation with deterministic caching."""
from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from database import db
from services.ai_gateway import user_context
from services.failure_modes_read import get_failure_mode_by_id
from services.tenant_schema import merge_tenant_filter, with_tenant_id

logger = logging.getLogger(__name__)

GENERATOR_VERSION = "1.0.0"
STANDARDS_VERSION = "1.0.0"

_COLLECTION = "failure_mode_information_cards"

_REQUIRED_SECTIONS = (
    "header",
    "risk_summary",
    "failure_mode_overview",
    "technical_description",
    "scoring_justification",
    "likelihood",
    "potential_effects",
    "potential_causes",
    "applicable_equipment",
    "recommended_actions",
    "key_reliability_indicator",
    "risk_reduction_logic",
    "standards_alignment",
    "footer",
)

_IGNORED_HASH_FIELDS = frozenset({
    "created_at",
    "updated_at",
    "validated_at",
    "validated_by_name",
    "validated_by_position",
    "validated_by_id",
    "ai_improved_at",
    "rolled_back_from_version",
    "version",
})


def _norm_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip().lower()
    return text or None


def _norm_list(values: Any) -> List[str]:
    if values is None:
        return []
    if isinstance(values, str):
        parts = [p.strip() for p in values.replace("\n", ",").split(",") if p.strip()]
    elif isinstance(values, list):
        parts = [str(p).strip() for p in values if str(p).strip()]
    else:
        parts = [str(values).strip()] if str(values).strip() else []
    return sorted({_norm_text(p) or "" for p in parts if _norm_text(p)})


def _action_name(action: Any) -> str:
    if isinstance(action, str):
        return action.strip()
    if isinstance(action, dict):
        return (action.get("action") or action.get("description") or "").strip()
    return str(action).strip()


def _norm_actions(actions: Any) -> List[Dict[str, Any]]:
    if not actions:
        return []
    normalized: List[Dict[str, Any]] = []
    for action in actions:
        if isinstance(action, str):
            entry = {"action": _norm_text(action) or action.strip().lower()}
        elif isinstance(action, dict):
            entry = {}
            name = _action_name(action)
            if name:
                entry["action"] = _norm_text(name)
            action_type = action.get("action_type") or action.get("task_type")
            if action_type:
                entry["action_type"] = _norm_text(action_type)
            discipline = action.get("discipline")
            if discipline:
                entry["discipline"] = _norm_text(discipline)
        else:
            entry = {"action": _norm_text(action)}
        if entry:
            normalized.append(entry)
    return sorted(normalized, key=lambda a: (a.get("action") or "", a.get("action_type") or ""))


def normalize_failure_mode_for_hash(fm: Dict[str, Any], language: str) -> Dict[str, Any]:
    """Normalize failure mode fields for deterministic input hashing."""
    payload: Dict[str, Any] = {
        "failure_mode_id": str(fm.get("id") or ""),
        "failure_mode_name": _norm_text(fm.get("failure_mode")),
        "discipline": _norm_text(fm.get("category")),
        "process": _norm_text(fm.get("process")),
        "iso14224_reference": _norm_text(fm.get("iso14224_mechanism") or fm.get("mechanism")),
        "equipment_types": sorted(str(e).strip().lower() for e in (fm.get("equipment_type_ids") or []) if str(e).strip()),
        "severity": int(fm.get("severity") or 0),
        "occurrence": int(fm.get("occurrence") or 0),
        "detection": int(fm.get("detectability") or 0),
        "rpn": int(fm.get("rpn") or 0),
        "potential_effects": _norm_list(fm.get("potential_effects")),
        "potential_causes": _norm_list(fm.get("potential_causes")),
        "keywords": _norm_list(fm.get("keywords")),
        "recommended_actions": _norm_actions(fm.get("recommended_actions")),
        "validation_status": bool(fm.get("is_validated", False)),
        "language": _norm_text(language) or "en",
        "generator_version": GENERATOR_VERSION,
        "standards_version": STANDARDS_VERSION,
    }
    return {k: v for k, v in payload.items() if v not in (None, "", [], {})}


def compute_input_hash(fm: Dict[str, Any], language: str) -> str:
    """SHA-256 hash of normalized failure mode payload."""
    normalized = normalize_failure_mode_for_hash(fm, language)
    canonical = json.dumps(normalized, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def get_risk_level(rpn: int) -> str:
    """Map RPN to overall risk level band."""
    if rpn <= 80:
        return "Low"
    if rpn <= 160:
        return "Medium"
    if rpn <= 240:
        return "Elevated"
    if rpn <= 400:
        return "High"
    return "Critical"


def get_likelihood_label(occurrence: int) -> str:
    """Map occurrence score to engineering likelihood label."""
    if occurrence <= 2:
        return "Rare"
    if occurrence <= 4:
        return "Unlikely"
    if occurrence <= 6:
        return "Possible"
    if occurrence <= 8:
        return "Likely"
    return "Frequent"


def _validate_card_json(card: Dict[str, Any]) -> None:
    missing = [s for s in _REQUIRED_SECTIONS if s not in card]
    if missing:
        raise ValueError(f"Information card missing required sections: {', '.join(missing)}")
    overview = card.get("failure_mode_overview")
    if not isinstance(overview, list) or not overview:
        raise ValueError("failure_mode_overview must be a non-empty array")
    if len(overview) > 4:
        raise ValueError("failure_mode_overview must contain at most 4 paragraphs")


async def _fm_json(user_message: str, *, user: Optional[dict]) -> Dict[str, Any]:
    from services.ai_platform import execute_json_prompt

    result = await execute_json_prompt(
        "fm.information_card",
        user=user,
        user_message=user_message,
        endpoint="failure_mode_information_card.generate",
        model="gpt-4o",
        temperature=0,
        max_tokens=6000,
        seed=42,
        response_format={"type": "json_object"},
    )
    parsed = result.get("parsed")
    if not isinstance(parsed, dict):
        raise json.JSONDecodeError(
            "Expected JSON object",
            result.get("content") or "",
            0,
        )
    return parsed


def _build_user_prompt(fm: Dict[str, Any], language: str) -> str:
    snapshot = {k: v for k, v in fm.items() if k not in _IGNORED_HASH_FIELDS}
    return f"""Generate a Failure Mode Information Card for the following record.

Language: {language}

Failure Mode JSON:
{json.dumps(snapshot, indent=2, default=str)}

Return a single JSON object with these sections:
header, risk_summary, failure_mode_overview (max 4 paragraphs), technical_description,
scoring_justification (severity, occurrence, detection), likelihood, potential_effects,
potential_causes (grouped), applicable_equipment, recommended_actions, key_reliability_indicator,
risk_reduction_logic, standards_alignment, footer.

Use overall risk level: {get_risk_level(int(fm.get('rpn') or 0))}
Use likelihood label: {get_likelihood_label(int(fm.get('occurrence') or 0))}
Do not modify any scores or actions. Use only supplied data."""


async def _log_card_event(
    event: str,
    *,
    fm_id: str,
    user: Optional[dict],
    input_hash: str,
    version: Optional[int] = None,
) -> None:
    uid, cid = user_context(user) if user else (None, None)
    logger.info(
        "Information card event: %s fm_id=%s hash=%s version=%s user=%s tenant=%s",
        event,
        fm_id,
        input_hash[:12],
        version,
        uid,
        cid,
    )


async def get_or_generate_card(
    fm_id: str,
    user: dict,
    language: str = "en",
    force: bool = False,
) -> Dict[str, Any]:
    """Load or generate a failure mode information card."""
    fm = await get_failure_mode_by_id(fm_id, current_user=user)
    input_hash = compute_input_hash(fm, language)
    query = merge_tenant_filter(
        {"failure_mode_id": str(fm_id), "is_current": True},
        user,
    )

    existing = await db[_COLLECTION].find_one(query)
    if existing and existing.get("input_hash") == input_hash and not force:
        await _log_card_event(
            "Information Card Reused",
            fm_id=fm_id,
            user=user,
            input_hash=input_hash,
            version=existing.get("version"),
        )
        return _format_response(existing, reused=True)

    if existing and existing.get("input_hash") == input_hash and force:
        event = "Manual Regeneration"
    elif existing:
        event = "Information Card Superseded"
    else:
        event = "Information Card Generated"

    try:
        card_json = await _fm_json(_build_user_prompt(fm, language), user=user)
        _validate_card_json(card_json)
    except Exception as exc:
        logger.error("Information card generation failed for %s: %s", fm_id, exc)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to generate information card: {exc}",
        ) from exc

    now = datetime.now(timezone.utc)
    next_version = 1
    if existing:
        next_version = int(existing.get("version") or 0) + 1
        await db[_COLLECTION].update_many(
            merge_tenant_filter({"failure_mode_id": str(fm_id), "is_current": True}, user),
            {"$set": {"is_current": False, "superseded_at": now}},
        )

    doc: Dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "failure_mode_id": str(fm_id),
        "input_hash": input_hash,
        "card_json": card_json,
        "language": language,
        "generator_version": GENERATOR_VERSION,
        "standards_version": STANDARDS_VERSION,
        "source_snapshot": normalize_failure_mode_for_hash(fm, language),
        "version": next_version,
        "is_current": True,
        "created_at": now,
        "generated_by_user_id": user.get("id") if user else None,
    }
    with_tenant_id(doc, user)
    await db[_COLLECTION].insert_one(doc)

    await _log_card_event(
        event,
        fm_id=fm_id,
        user=user,
        input_hash=input_hash,
        version=next_version,
    )
    if event == "Information Card Superseded":
        await _log_card_event(
            "Information Card Generated",
            fm_id=fm_id,
            user=user,
            input_hash=input_hash,
            version=next_version,
        )

    return _format_response(doc, reused=False)


def _format_response(doc: Dict[str, Any], *, reused: bool) -> Dict[str, Any]:
    created = doc.get("created_at")
    if hasattr(created, "isoformat"):
        created = created.isoformat()
    return {
        "reused": reused,
        "card": doc.get("card_json"),
        "input_hash": doc.get("input_hash"),
        "version": doc.get("version"),
        "language": doc.get("language"),
        "generator_version": doc.get("generator_version", GENERATOR_VERSION),
        "standards_version": doc.get("standards_version", STANDARDS_VERSION),
        "generated_at": created,
    }
