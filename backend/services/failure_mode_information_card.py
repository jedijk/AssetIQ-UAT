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

_LANGUAGE_NAMES = {
    "en": "English",
    "nl": "Dutch",
    "de": "German",
}

_RISK_LEVEL_I18N = {
    "en": {
        "Low": "Low",
        "Medium": "Medium",
        "Elevated": "Elevated",
        "High": "High",
        "Critical": "Critical",
    },
    "nl": {
        "Low": "Laag",
        "Medium": "Gemiddeld",
        "Elevated": "Verhoogd",
        "High": "Hoog",
        "Critical": "Kritiek",
    },
    "de": {
        "Low": "Niedrig",
        "Medium": "Mittel",
        "Elevated": "Erhöht",
        "High": "Hoch",
        "Critical": "Kritisch",
    },
}

_LIKELIHOOD_I18N = {
    "en": {
        "Rare": "Rare",
        "Unlikely": "Unlikely",
        "Possible": "Possible",
        "Likely": "Likely",
        "Frequent": "Frequent",
    },
    "nl": {
        "Rare": "Zeldzaam",
        "Unlikely": "Onwaarschijnlijk",
        "Possible": "Mogelijk",
        "Likely": "Waarschijnlijk",
        "Frequent": "Frequent",
    },
    "de": {
        "Rare": "Selten",
        "Unlikely": "Unwahrscheinlich",
        "Possible": "Möglich",
        "Likely": "Wahrscheinlich",
        "Frequent": "Häufig",
    },
}

_MISSING_INFO_I18N = {
    "en": "Not specified in current Failure Mode record.",
    "nl": "Niet gespecificeerd in huidig faalmodusrecord.",
    "de": "Nicht im aktuellen Fehlermodus-Datensatz angegeben.",
}


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


def normalize_language_code(language: str) -> str:
    """Normalize UI language code to a supported card language."""
    code = (language or "en").strip().lower()[:2]
    return code if code in _LANGUAGE_NAMES else "en"


def localized_risk_level(rpn: int, language: str) -> str:
    """Return risk level label in the target language."""
    key = get_risk_level(rpn)
    lang = normalize_language_code(language)
    return _RISK_LEVEL_I18N[lang].get(key, key)


def localized_likelihood_label(occurrence: int, language: str) -> str:
    """Return likelihood label in the target language."""
    key = get_likelihood_label(occurrence)
    lang = normalize_language_code(language)
    return _LIKELIHOOD_I18N[lang].get(key, key)


def _normalize_risk_component(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip().lower()
    if "occurrence" in text:
        return "occurrence"
    if "detection" in text:
        return "detection"
    if "severity" in text:
        return "severity"
    if "consequence" in text or "exposure" in text:
        return "consequence_exposure"
    return None


def _infer_risk_component(action: Dict[str, Any]) -> str:
    explicit = _normalize_risk_component(action.get("risk_component"))
    if explicit:
        return explicit
    strategy = (
        action.get("maintenance_strategy")
        or action.get("action_type")
        or ""
    ).upper()
    if strategy in {"PDM", "INSPECTION", "TESTING"}:
        return "detection"
    if strategy == "REDESIGN":
        return "severity"
    return "occurrence"


def _rpn(severity: int, occurrence: int, detection: int) -> int:
    return max(0, severity) * max(0, occurrence) * max(0, detection)


_RISK_REDUCTION_SUMMARY_I18N = {
    "en": (
        "If all {action_count} recommended actions are implemented and verified, "
        "projected RPN reduces from {current_rpn} to {projected_rpn} "
        "({reduction_pct}% reduction)."
    ),
    "nl": (
        "Als alle {action_count} aanbevolen acties zijn geïmplementeerd en geverifieerd, "
        "daalt de verwachte RPN van {current_rpn} naar {projected_rpn} "
        "({reduction_pct}% reductie)."
    ),
    "de": (
        "Wenn alle {action_count} empfohlenen Maßnahmen umgesetzt und verifiziert sind, "
        "sinkt die projizierte RPN von {current_rpn} auf {projected_rpn} "
        "({reduction_pct}% Reduktion)."
    ),
}


def compute_risk_reduction_if_implemented(
    fm: Dict[str, Any],
    card_actions: Optional[List[Dict[str, Any]]],
    language: str,
) -> Optional[Dict[str, Any]]:
    """Project FMEA scores when every recommended action is fully implemented."""
    actions = [a for a in (card_actions or []) if isinstance(a, dict)]
    if not actions:
        raw_actions = fm.get("recommended_actions") or []
        actions = [a for a in raw_actions if isinstance(a, dict)]
    if not actions:
        return None

    severity = int(fm.get("severity") or 0)
    occurrence = int(fm.get("occurrence") or 0)
    detection = int(fm.get("detectability") or 0)
    proj_s, proj_o, proj_d = severity, occurrence, detection

    for action in actions:
        component = _infer_risk_component(action)
        if component == "occurrence":
            proj_o = max(1, proj_o - 1)
        elif component == "detection":
            proj_d = max(1, proj_d - 1)
        elif component == "severity":
            proj_s = max(1, proj_s - 1)
        elif component == "consequence_exposure":
            proj_o = max(1, proj_o - 1)

    current_rpn = _rpn(severity, occurrence, detection)
    projected_rpn = _rpn(proj_s, proj_o, proj_d)
    reduction = max(0, current_rpn - projected_rpn)
    reduction_pct = round((reduction / current_rpn) * 100, 1) if current_rpn > 0 else 0.0

    lang = normalize_language_code(language)
    template = _RISK_REDUCTION_SUMMARY_I18N.get(lang, _RISK_REDUCTION_SUMMARY_I18N["en"])
    summary = template.format(
        action_count=len(actions),
        current_rpn=current_rpn,
        projected_rpn=projected_rpn,
        reduction_pct=reduction_pct,
    )

    return {
        "current_rpn": current_rpn,
        "projected_rpn": projected_rpn,
        "rpn_reduction": reduction,
        "rpn_reduction_pct": reduction_pct,
        "current_scores": {
            "severity": severity,
            "occurrence": occurrence,
            "detection": detection,
        },
        "projected_scores": {
            "severity": proj_s,
            "occurrence": proj_o,
            "detection": proj_d,
        },
        "current_risk_level": localized_risk_level(current_rpn, lang),
        "projected_risk_level": localized_risk_level(projected_rpn, lang),
        "current_risk_level_key": get_risk_level(current_rpn),
        "projected_risk_level_key": get_risk_level(projected_rpn),
        "summary": summary,
    }


def enrich_card_json(
    fm: Dict[str, Any],
    card_json: Dict[str, Any],
    language: str,
) -> Dict[str, Any]:
    """Attach deterministic risk-reduction projection to card JSON."""
    projection = compute_risk_reduction_if_implemented(
        fm,
        card_json.get("recommended_actions"),
        language,
    )
    if not projection:
        return card_json
    enriched = dict(card_json)
    enriched["risk_reduction_if_implemented"] = projection
    return enriched


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
    lang = normalize_language_code(language)
    lang_name = _LANGUAGE_NAMES[lang]
    missing_info = _MISSING_INFO_I18N[lang]
    snapshot = {k: v for k, v in fm.items() if k not in _IGNORED_HASH_FIELDS}
    return f"""Generate a Failure Mode Information Card for the following record.

Target language: {lang} ({lang_name})
Write ALL user-facing text values in {lang_name}. Keep JSON keys in English.
If information is unavailable, write exactly: "{missing_info}"
Translate narrative content from the source record when needed; do not leave English prose in non-English cards.

Failure Mode JSON:
{json.dumps(snapshot, indent=2, default=str)}

Return a single JSON object with these sections:
header, risk_summary, failure_mode_overview (max 4 paragraphs), technical_description,
scoring_justification (severity, occurrence, detection), likelihood, potential_effects,
potential_causes (grouped), applicable_equipment, recommended_actions, key_reliability_indicator,
risk_reduction_logic, standards_alignment, footer.

Use overall risk level label: {localized_risk_level(int(fm.get('rpn') or 0), lang)}
Use likelihood label: {localized_likelihood_label(int(fm.get('occurrence') or 0), lang)}
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
    language = normalize_language_code(language)
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
        return _format_response(existing, reused=True, fm=fm, language=language)

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

    return _format_response(doc, reused=False, fm=fm, language=language)


def _format_response(
    doc: Dict[str, Any],
    *,
    reused: bool,
    fm: Optional[Dict[str, Any]] = None,
    language: str = "en",
) -> Dict[str, Any]:
    created = doc.get("created_at")
    if hasattr(created, "isoformat"):
        created = created.isoformat()
    lang = normalize_language_code(language or doc.get("language") or "en")
    card = doc.get("card_json")
    if card and fm:
        card = enrich_card_json(fm, card, lang)
    return {
        "reused": reused,
        "card": card,
        "input_hash": doc.get("input_hash"),
        "version": doc.get("version"),
        "language": doc.get("language"),
        "generator_version": doc.get("generator_version", GENERATOR_VERSION),
        "standards_version": doc.get("standards_version", STANDARDS_VERSION),
        "generated_at": created,
    }
