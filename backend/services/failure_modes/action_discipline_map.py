"""Map failure-mode recommended actions to tenant discipline taxonomy (Settings)."""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Tuple

from models.disciplines import DISCIPLINE_LIST, normalize_discipline as legacy_normalize
from services.ai_platform import execute_json_prompt

logger = logging.getLogger(__name__)

# Keep each OpenAI call small so Railway/Vercel proxy stays under ~60s.
_CLASSIFY_CHUNK_SIZE = 8

# Detailed routing guidance for the default ISO taxonomy (value-keyed).
_STANDARD_GUIDANCE: Dict[str, str] = {
    "rotating": (
        "work on rotating equipment — pumps, compressors, turbines, motors (mechanical side), "
        "fans, gearboxes, bearings, mechanical seals, alignment, vibration, lubrication"
    ),
    "static": (
        "work on static equipment — pressure vessels, heat exchangers, tanks, columns, "
        "fouling, corrosion, fatigue cracking on static metal"
    ),
    "piping": (
        "piping and valves — leak repair on pipe/flange/valve, valve overhaul, "
        "gasket replacement, pipe support, line walks"
    ),
    "electrical": (
        "motors (windings/insulation), cabling, switchgear, transformers, MCCs, "
        "grounding, megger tests, electrical isolation"
    ),
    "instrumentation": (
        "sensors, transmitters, control loops, calibration, PLCs, valve positioners, "
        "loop checks, DCS work"
    ),
    "civil": (
        "foundations, baseplates, grouting, structural steel, concrete, anchor bolts"
    ),
    "operations": (
        "operator rounds, procedure changes, training, housekeeping, setpoint changes, "
        "process-condition adjustments (NPSH, flow, temperature, dosing)"
    ),
    "laboratory": (
        "oil analysis, metallurgical testing, sampling for lab, fluid testing, NDE/UT/RT/PT/MT"
    ),
}

_LEGACY_ALIASES: Dict[str, str] = {
    "mech": "rotating",
    "mechanic": "rotating",
    "mechanical": "rotating",
    "rotating equipment": "rotating",
    "static equipment": "static",
    "pipe": "piping",
    "piping/valves": "piping",
    "valves": "piping",
    "elec": "electrical",
    "i&c": "instrumentation",
    "ic": "instrumentation",
    "instrumentation & control": "instrumentation",
    "instrument": "instrumentation",
    "ops": "operations",
    "operator": "operations",
    "process": "operations",
    "maintenance": "operations",
    "safety": "operations",
    "reliability": "operations",
    "engineering": "operations",
    "civil/structural": "civil",
    "structural": "civil",
    "lab": "laboratory",
    "inspection": "laboratory",
}


async def load_discipline_taxonomy() -> List[Dict[str, Any]]:
    """Active disciplines from Settings, falling back to built-in defaults."""
    from services.disciplines_service import list_disciplines

    data = await list_disciplines(include_inactive=False, user=None)
    items = data.get("disciplines") or []
    if items:
        return items
    return [
        {"value": v, "label": v.replace("_", " ").title(), "aliases": []}
        for v in DISCIPLINE_LIST
    ]


def _lookup_key(value: str) -> str:
    return value.strip().lower().replace(" ", "_").replace("-", "_")


def build_alias_map(taxonomy: List[Dict[str, Any]]) -> Dict[str, str]:
    """Map lowercase alias/label/value → canonical discipline value."""
    out: Dict[str, str] = dict(_LEGACY_ALIASES)
    for row in taxonomy:
        value = (row.get("value") or "").strip().lower()
        if not value:
            continue
        out[value] = value
        label = (row.get("label") or "").strip().lower()
        if label:
            out[label] = value
            out[_lookup_key(label)] = value
        for alias in row.get("aliases") or []:
            a = str(alias).strip().lower()
            if a:
                out[a] = value
                out[_lookup_key(a)] = value
    return out


def normalize_discipline_value(
    value: Optional[str],
    taxonomy: List[Dict[str, Any]],
    alias_map: Optional[Dict[str, str]] = None,
) -> str:
    if not value or not str(value).strip():
        return ""
    alias_map = alias_map or build_alias_map(taxonomy)
    raw = str(value).strip()
    for key in (_lookup_key(raw), raw.lower()):
        if key in alias_map:
            return alias_map[key]
    allowed = {d["value"].lower() for d in taxonomy if d.get("value")}
    legacy = legacy_normalize(raw)
    if legacy and legacy in allowed:
        return legacy
    return ""


def build_discipline_system_prompt(taxonomy: List[Dict[str, Any]]) -> str:
    from services.ai_prompt_registry import render_prompt

    return render_prompt(
        "fm.action_discipline_map",
        {"taxonomy_block": _taxonomy_block(taxonomy)},
    )


def _taxonomy_block(taxonomy: List[Dict[str, Any]]) -> str:
    taxonomy_lines = []
    for row in taxonomy:
        value = row.get("value", "")
        label = row.get("label", value)
        aliases = [a for a in (row.get("aliases") or []) if a]
        guidance = _STANDARD_GUIDANCE.get(value, "")
        alias_text = f" Aliases: {', '.join(aliases)}." if aliases else ""
        if guidance:
            taxonomy_lines.append(f"- {value} ({label}): {guidance}{alias_text}")
        else:
            taxonomy_lines.append(
                f"- {value} ({label}): assign work performed by this crew.{alias_text}"
            )
    return "\n".join(taxonomy_lines)


async def _classify_action_chunk(
    actions: List[Dict[str, Any]],
    *,
    taxonomy: List[Dict[str, Any]],
    allowed_values: List[str],
    alias_map: Dict[str, str],
    default_value: str,
    user_id: str,
    company_id: str,
    endpoint: str,
) -> List[Dict[str, Any]]:
    allowed_set = set(allowed_values)
    payload = [
        {
            "i": idx,
            "description": (a.get("description") or "")[:280],
            "action_type": a.get("action_type") or "",
            "current_discipline": normalize_discipline_value(
                a.get("current_discipline"), taxonomy, alias_map
            ),
            "failure_mode": (a.get("failure_mode") or "")[:120],
            "fm_discipline": a.get("fm_discipline") or "",
        }
        for idx, a in enumerate(actions)
    ]

    user_prompt = f"""Allowed discipline values: {", ".join(allowed_values)}

For each action below, return:
- "i": same index you received
- "discipline": one of the allowed values
- "reason": <= 14 words, why this discipline fits

Actions:
{json.dumps(payload, indent=2)}

Return JSON: {{"results": [{{"i": 0, "discipline": "rotating", "reason": "..."}}]}}"""

    max_tokens = min(1800, max(400, len(actions) * 90 + 120))
    result = await execute_json_prompt(
        "fm.action_discipline_map",
        user={"id": user_id, "company_id": company_id},
        user_message=user_prompt,
        variables={"taxonomy_block": _taxonomy_block(taxonomy)},
        endpoint=endpoint,
        model="gpt-4o-mini",
        temperature=0,
        max_tokens=max_tokens,
        seed=42,
        response_format={"type": "json_object"},
    )
    data = result["parsed"] or {}
    raw_results = data.get("results") or []

    by_index: Dict[int, Dict[str, Any]] = {}
    for r in raw_results:
        if not isinstance(r, dict):
            continue
        try:
            by_index[int(r.get("i"))] = r
        except (TypeError, ValueError):
            continue

    results: List[Dict[str, Any]] = []
    for idx, a in enumerate(actions):
        r = by_index.get(idx, {})
        suggested = normalize_discipline_value(r.get("discipline"), taxonomy, alias_map)
        if suggested not in allowed_set:
            suggested = (
                normalize_discipline_value(a.get("current_discipline"), taxonomy, alias_map)
                or default_value
            )
        raw_current = (a.get("current_discipline") or "").strip().lower()
        results.append(
            {
                "fm_id": a.get("fm_id"),
                "action_index": a.get("action_index"),
                "current_discipline": raw_current or None,
                "suggested_discipline": suggested,
                "reason": (r.get("reason") or "").strip()[:200]
                or "Classified by AI reliability engineer.",
                "changed": suggested != raw_current,
            }
        )
    return results


async def classify_recommended_actions(
    actions: List[Dict[str, Any]],
    *,
    user_id: str,
    company_id: str,
    endpoint: str = "ai_fm_suggestions.classify_action_disciplines",
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Classify action rows into tenant disciplines.

    Each action dict must include: fm_id, action_index, description.
    Optional: action_type, current_discipline, failure_mode, fm_discipline.

    Returns (results, taxonomy) where each result has fm_id, action_index,
    current_discipline, suggested_discipline, reason, changed.
    """
    if not actions:
        taxonomy = await load_discipline_taxonomy()
        return [], taxonomy

    taxonomy = await load_discipline_taxonomy()
    allowed_values = [d["value"] for d in taxonomy if d.get("value")]
    alias_map = build_alias_map(taxonomy)
    default_value = allowed_values[0] if allowed_values else "rotating"

    results: List[Dict[str, Any]] = []
    for start in range(0, len(actions), _CLASSIFY_CHUNK_SIZE):
        chunk = actions[start : start + _CLASSIFY_CHUNK_SIZE]
        chunk_results = await _classify_action_chunk(
            chunk,
            taxonomy=taxonomy,
            allowed_values=allowed_values,
            alias_map=alias_map,
            default_value=default_value,
            user_id=user_id,
            company_id=company_id,
            endpoint=endpoint,
        )
        results.extend(chunk_results)

    return results, taxonomy
