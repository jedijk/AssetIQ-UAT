"""
AI-powered failure mode suggestions for equipment types.
Uses OpenAI GPT-4o with deterministic settings for consistent output.
"""

import os
import re
import json
import hashlib
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from dotenv import load_dotenv
load_dotenv()

from iso14224_models import EQUIPMENT_TYPES
from auth import require_permission, get_current_user
from services.ai_gateway import user_context, RateLimitError
from services import ai_fm_queries as fmq


async def _fm_json(
    prompt_id: str,
    *,
    user: Optional[dict],
    user_message: str,
    endpoint: str,
    max_tokens: int = 4000,
    max_retries: int = 0,
    model: str = "gpt-4o",
) -> Dict[str, Any]:
    """Run a registered FM prompt with deterministic JSON settings."""
    from services.ai_platform import execute_json_prompt

    result = await execute_json_prompt(
        prompt_id,
        user=user,
        user_message=user_message,
        endpoint=endpoint,
        model=model,
        temperature=0,
        max_tokens=max_tokens,
        seed=42,
        response_format={"type": "json_object"},
        max_retries=max_retries,
    )
    parsed = result.get("parsed")
    if not isinstance(parsed, dict):
        raise json.JSONDecodeError(
            "Expected JSON object",
            result.get("content") or "",
            0,
        )
    return parsed


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ai-suggestions",
    tags=["AI Suggestions"],
    dependencies=[Depends(require_permission("library:write"))],
)

# In-memory cache (per-process). Backed by Mongo for cross-restart persistence.
_suggestion_cache: Dict[str, Any] = {}

# ============= Models =============

class FailureModeSuggestion(BaseModel):
    failure_mode_id: str
    failure_mode_name: str
    category: str
    confidence: float
    reasoning: str
    rpn: Optional[int] = None

class EquipmentTypeSuggestions(BaseModel):
    equipment_type_id: str
    equipment_type_name: str
    discipline: str
    suggested_failure_modes: List[FailureModeSuggestion]
    ai_reasoning: str

class SuggestFailureModesRequest(BaseModel):
    equipment_type_ids: List[str]
    existing_failure_modes: List[Dict[str, Any]]

class SuggestFailureModesResponse(BaseModel):
    suggestions: List[EquipmentTypeSuggestions]
    total_suggestions: int

# ============= AI Service =============


def get_cache_key(equipment_ids: List[str], fm_ids: List[str]) -> str:
    """Generate a deterministic cache key."""
    key_str = f"{sorted(equipment_ids)}:{sorted(fm_ids)}"
    return hashlib.md5(key_str.encode()).hexdigest()


def finalize_fm_suggestions_contract(
    payload: Dict[str, Any],
    *,
    failure_modes: List[Dict[str, Any]],
    equipment_types: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Apply universal AI contract to failure-mode suggestion responses."""
    from services.ai_citation import make_citation
    from services.ai_platform import finalize_recommendation_response

    citations = []
    for fm in failure_modes[:20]:
        fm_id = fm.get("id")
        if fm_id:
            citations.append(
                make_citation(
                    id=str(fm_id),
                    type="failure_mode",
                    label=fm.get("failure_mode") or str(fm_id),
                    url_path=f"/failure-modes/{fm_id}",
                )
            )
    for eq in (equipment_types or [])[:10]:
        eq_id = eq.get("id")
        if eq_id:
            citations.append(
                make_citation(
                    id=str(eq_id),
                    type="equipment_type",
                    label=eq.get("name") or str(eq_id),
                    url_path=f"/library/equipment-types/{eq_id}",
                )
            )

    recs = payload.get("suggestions") or payload.get("recommendations") or []
    contract_payload = dict(payload)
    contract_payload.setdefault("recommendations", recs)
    contract_payload.setdefault(
        "summary",
        f"Failure mode mapping suggestions ({payload.get('total_suggestions', len(recs))} total)",
    )
    return finalize_recommendation_response(
        contract_payload,
        citations=citations,
        evidence={
            "deterministic": {
                "failure_mode_count": len(failure_modes),
                "equipment_type_count": len(equipment_types or []),
            }
        },
    )


async def get_ai_suggestions(
    equipment_types: List[Dict[str, Any]],
    failure_modes: List[Dict[str, Any]],
    current_user: Optional[dict] = None,
) -> List[EquipmentTypeSuggestions]:
    """Use OpenAI GPT-4o with deterministic settings and persistent cache."""

    # Build cache key from equipment + failure mode IDs (order-independent).
    eq_ids = [eq.get("id") for eq in equipment_types]
    fm_ids = [fm.get("id") for fm in failure_modes]
    cache_key = get_cache_key(eq_ids, fm_ids)

    # 1) In-memory cache (fastest)
    if cache_key in _suggestion_cache:
        logger.info(f"Returning in-memory cached suggestions for key: {cache_key[:8]}")
        return _suggestion_cache[cache_key]

    # 2) MongoDB-persisted cache (survives restarts -> consistent results forever)
    try:
        cached_doc = await fmq.find_cache_doc(current_user, cache_key)
        if cached_doc and "suggestions" in cached_doc:
            suggestions = [EquipmentTypeSuggestions(**s) for s in cached_doc["suggestions"]]
            _suggestion_cache[cache_key] = suggestions
            logger.info(f"Returning Mongo-cached suggestions for key: {cache_key[:8]}")
            return suggestions
    except Exception as e:
        logger.warning(f"Cache lookup failed (non-fatal): {e}")

    # Prepare data in minimal format
    fm_list = [
        {"id": fm.get("id"), "name": fm.get("failure_mode"), "category": fm.get("category")}
        for fm in failure_modes
    ]
    
    eq_list = [
        {"id": eq.get("id"), "name": eq.get("name"), "discipline": eq.get("discipline")}
        for eq in equipment_types
    ]
    
    user_prompt = f"""Map failure modes to equipment types.

EQUIPMENT TYPES:
{json.dumps(eq_list, indent=2)}

FAILURE MODES (use exact IDs):
{json.dumps(fm_list, indent=2)}

Return JSON:
{{
  "suggestions": [
    {{
      "equipment_type_id": "<id>",
      "equipment_type_name": "<name>",
      "discipline": "<discipline>",
      "ai_reasoning": "<1 sentence>",
      "suggested_failure_modes": [
        {{"failure_mode_id": "<id>", "failure_mode_name": "<name>", "category": "<cat>", "confidence": 0.85, "reasoning": "<why>"}}
      ]
    }}
  ]
}}"""

    try:
        result = await _fm_json(
            "fm.failure_mode_mapping",
            user=current_user,
            user_message=user_prompt,
            endpoint="ai_fm_suggestions.failure_modes",
        )
        
        suggestions = []
        for item in result.get("suggestions", []):
            fm_suggestions = []
            seen_fm_ids = set()  # deduplicate within a single equipment type
            for fm in item.get("suggested_failure_modes", []):
                fm_id = fm.get("failure_mode_id")
                if not fm_id or fm_id in seen_fm_ids:
                    continue
                # Validate ID exists in input
                if any(f["id"] == fm_id for f in fm_list):
                    seen_fm_ids.add(fm_id)
                    fm_suggestions.append(FailureModeSuggestion(
                        failure_mode_id=fm_id,
                        failure_mode_name=fm.get("failure_mode_name", ""),
                        category=fm.get("category", ""),
                        confidence=min(0.95, max(0.70, fm.get("confidence", 0.8))),
                        reasoning=fm.get("reasoning", ""),
                        rpn=fm.get("rpn")
                    ))
            
            if fm_suggestions:
                suggestions.append(EquipmentTypeSuggestions(
                    equipment_type_id=item.get("equipment_type_id"),
                    equipment_type_name=item.get("equipment_type_name", ""),
                    discipline=item.get("discipline", ""),
                    suggested_failure_modes=fm_suggestions[:6],  # Limit to 6
                    ai_reasoning=item.get("ai_reasoning", "")
                ))
        
        # Cache the result (in-memory + Mongo)
        _suggestion_cache[cache_key] = suggestions
        try:
            await fmq.upsert_cache_doc(
                current_user,
                cache_key,
                {
                    "suggestions": [s.model_dump() for s in suggestions],
                    "equipment_type_ids": sorted(eq_ids),
                    "failure_mode_ids": sorted(fm_ids),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
            )
        except Exception as e:
            logger.warning(f"Failed to persist suggestions to Mongo cache (non-fatal): {e}")

        return suggestions
        
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse AI response")
    except Exception as e:
        logger.error(f"AI suggestion error: {e}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


# ============= API Endpoints =============

@router.post("/failure-modes")
async def suggest_failure_modes(
    request: SuggestFailureModesRequest,
    current_user: dict = Depends(get_current_user),
):
    """Get deterministic AI-powered suggestions for mapping failure modes to equipment types."""

    # Process ALL equipment types at once (no batching)
    equipment_type_ids = request.equipment_type_ids

    # 1) Resolve from built-in catalog
    equipment_types = []
    resolved_ids = set()
    for eq_id in equipment_type_ids:
        eq_type = next((t for t in EQUIPMENT_TYPES if t["id"] == eq_id), None)
        if eq_type:
            equipment_types.append(eq_type)
            resolved_ids.add(eq_id)

    # 2) Resolve any remaining IDs from user-custom equipment types in Mongo
    missing_ids = [i for i in equipment_type_ids if i not in resolved_ids]
    if missing_ids:
        try:
            custom_cursor = fmq.find_custom_equipment_types(
                current_user,
                {"id": {"$in": missing_ids}},
                {"_id": 0},
            )
            async for ct in custom_cursor:
                equipment_types.append({
                    "id": ct.get("id"),
                    "name": ct.get("name"),
                    "discipline": ct.get("discipline", ""),
                })
        except Exception as e:
            logger.warning(f"Failed to resolve custom equipment types (non-fatal): {e}")

    if not equipment_types:
        raise HTTPException(status_code=400, detail="No valid equipment types provided")

    failure_modes = request.existing_failure_modes[:150]  # Increased limit
    suggestions = await get_ai_suggestions(equipment_types, failure_modes, current_user)
    total = sum(len(s.suggested_failure_modes) for s in suggestions)

    response = SuggestFailureModesResponse(
        suggestions=suggestions,
        total_suggestions=total
    )
    return finalize_fm_suggestions_contract(
        response.model_dump(),
        failure_modes=failure_modes,
        equipment_types=equipment_types,
    )


@router.post("/clear-cache")
async def clear_suggestion_cache(current_user: dict = Depends(get_current_user)):
    """Clear both in-memory and Mongo-persisted suggestion cache."""
    global _suggestion_cache
    mem_count = len(_suggestion_cache)
    _suggestion_cache = {}
    try:
        mongo_count = await fmq.clear_cache_docs(current_user)
    except Exception as e:
        logger.warning(f"Failed to clear Mongo cache (non-fatal): {e}")
        mongo_count = 0
    return {"message": f"Cleared {mem_count} in-memory and {mongo_count} persisted suggestions"}


@router.get("/equipment-types-without-fm")
async def get_equipment_types_without_failure_modes():
    """Get list of all equipment types."""
    return {
        "equipment_types": [
            {"id": t["id"], "name": t["name"], "discipline": t.get("discipline", "")}
            for t in EQUIPMENT_TYPES
        ]
    }


# =============================================================================
# Equipment Type Mapping Suggestions (for Equipment Manager)
# =============================================================================

class EquipmentNodeInput(BaseModel):
    id: str
    name: str
    level: Optional[str] = None
    description: Optional[str] = None
    tag: Optional[str] = None
    parent_name: Optional[str] = None


class EquipmentTypeOption(BaseModel):
    id: str
    name: str
    discipline: Optional[str] = None


class EquipmentTypeMatch(BaseModel):
    equipment_type_id: str
    equipment_type_name: str
    discipline: Optional[str] = None
    confidence: float
    reasoning: str


class NodeMappingSuggestion(BaseModel):
    node_id: str
    node_name: str
    node_level: Optional[str] = None
    best_match: Optional[EquipmentTypeMatch] = None
    alternatives: List[EquipmentTypeMatch] = []


class SuggestEquipmentTypeMappingsRequest(BaseModel):
    nodes: List[EquipmentNodeInput]
    equipment_types: List[EquipmentTypeOption]


class SuggestEquipmentTypeMappingsResponse(BaseModel):
    suggestions: List[NodeMappingSuggestion]
    total_matched: int



# Strips a leading plant-tag-like prefix from an equipment node name so the AI
# never sees codes such as "1C-1005-0031" in the descriptive name.
# Matches:
#   - Tokens whose first char is a digit and contains at least one '-', '.' or '/'
#   - Short uppercase-letter+digit codes joined by '-' or '.' (e.g. "P-101", "V-201")
_TAG_PREFIX_RE = re.compile(
    r"^\s*(?:"
    r"[0-9][A-Za-z0-9]*(?:[-./][A-Za-z0-9]+)+"      # 1C-1005-0031, 12.5-PR-001
    r"|[A-Za-z]{1,3}[-.][0-9][A-Za-z0-9-./]*"        # P-101, V-201, E-301, TI-1234A
    r")\s+"
)


def strip_tag_prefix(name: str) -> str:
    """Remove any leading plant-tag-like prefix from a node name."""
    if not name:
        return name
    cleaned = _TAG_PREFIX_RE.sub("", name, count=1).strip()
    # Safety: never return an empty string — if stripping consumed the whole name,
    # fall back to the original.
    return cleaned or name.strip()


def get_mapping_cache_key(nodes: List[EquipmentNodeInput], et_ids: List[str]) -> str:
    """Cache key includes the *cleaned* node descriptors so renames bust the cache,
    but plant-tag changes alone (which are ignored by the AI) do NOT."""
    node_keys = sorted([
        f"{n.id}|{strip_tag_prefix(n.name)}|{n.level or ''}"
        for n in nodes
    ])
    type_keys = sorted(et_ids)
    # Bump the namespace prefix to invalidate caches built with the old tag-aware key.
    return hashlib.md5(f"ETMAP_V2:{node_keys}:{type_keys}".encode()).hexdigest()


async def get_equipment_type_mapping_suggestions(
    nodes: List[EquipmentNodeInput],
    equipment_types: List[EquipmentTypeOption],
    current_user: Optional[dict] = None,
) -> List[NodeMappingSuggestion]:
    """Use OpenAI to suggest equipment_type_id per equipment node, with persistent cache."""
    et_ids = [et.id for et in equipment_types]
    cache_key = get_mapping_cache_key(nodes, et_ids)

    if cache_key in _suggestion_cache:
        logger.info(f"Returning in-memory cached equipment-type mappings: {cache_key[:8]}")
        return _suggestion_cache[cache_key]

    try:
        cached_doc = await fmq.find_cache_doc(current_user, cache_key)
        if cached_doc and "mapping_suggestions" in cached_doc:
            suggestions = [NodeMappingSuggestion(**s) for s in cached_doc["mapping_suggestions"]]
            _suggestion_cache[cache_key] = suggestions
            logger.info(f"Returning Mongo-cached equipment-type mappings: {cache_key[:8]}")
            return suggestions
    except Exception as e:
        logger.warning(f"Mapping cache lookup failed (non-fatal): {e}")

    et_list = [{"id": et.id, "name": et.name, "discipline": et.discipline or ""} for et in equipment_types]
    node_list = [
        {
            "id": n.id,
            # Strip leading plant-tag prefixes so the AI cannot be confused
            # by codes like "1C-1005-0031 Pump" → seen as "Pump".
            "name": strip_tag_prefix(n.name),
            "level": n.level or "",
            "description": strip_tag_prefix(n.description or "")[:200],
            "parent": strip_tag_prefix(n.parent_name or ""),
        }
        for n in nodes
    ]

    user_prompt = f"""Map each equipment node to the correct equipment type from the catalog.

EQUIPMENT TYPE CATALOG (use exact IDs):
{json.dumps(et_list, indent=2)}

EQUIPMENT NODES TO CLASSIFY:
{json.dumps(node_list, indent=2)}

Return JSON:
{{
  "suggestions": [
    {{
      "node_id": "<exact node id>",
      "node_name": "<name>",
      "node_level": "<level>",
      "best_match": {{
        "equipment_type_id": "<id from catalog>",
        "equipment_type_name": "<name>",
        "discipline": "<discipline>",
        "confidence": 0.92,
        "reasoning": "<1 short sentence>"
      }},
      "alternatives": [
        {{"equipment_type_id": "<id>", "equipment_type_name": "<name>", "discipline": "<disc>", "confidence": 0.78, "reasoning": "<why>"}}
      ]
    }}
  ]
}}

If no equipment_type fits a node with confidence >= 0.70, set its best_match to null and alternatives to []."""

    try:
        result = await _fm_json(
            "fm.equipment_type_mapping",
            user=current_user,
            user_message=user_prompt,
            endpoint="ai_fm_suggestions.equipment_type_mappings",
        )

        valid_ids = {et.id for et in equipment_types}
        valid_node_ids = {n.id for n in nodes}
        node_lookup = {n.id: n for n in nodes}

        suggestions: List[NodeMappingSuggestion] = []
        for item in result.get("suggestions", []):
            node_id = item.get("node_id")
            if not node_id or node_id not in valid_node_ids:
                continue

            def _coerce_match(m: Dict[str, Any]) -> Optional[EquipmentTypeMatch]:
                if not m:
                    return None
                et_id = m.get("equipment_type_id")
                if not et_id or et_id not in valid_ids:
                    return None
                conf = m.get("confidence", 0.0)
                try:
                    conf = float(conf)
                except (TypeError, ValueError):
                    conf = 0.0
                if conf < 0.70:
                    return None
                return EquipmentTypeMatch(
                    equipment_type_id=et_id,
                    equipment_type_name=m.get("equipment_type_name", ""),
                    discipline=m.get("discipline", ""),
                    confidence=min(0.95, max(0.70, conf)),
                    reasoning=m.get("reasoning", ""),
                )

            best = _coerce_match(item.get("best_match"))
            alts: List[EquipmentTypeMatch] = []
            seen = {best.equipment_type_id} if best else set()
            for a in item.get("alternatives", []) or []:
                coerced = _coerce_match(a)
                if coerced and coerced.equipment_type_id not in seen:
                    seen.add(coerced.equipment_type_id)
                    alts.append(coerced)
                if len(alts) >= 2:
                    break

            node = node_lookup[node_id]
            suggestions.append(NodeMappingSuggestion(
                node_id=node_id,
                node_name=item.get("node_name") or node.name,
                node_level=item.get("node_level") or node.level,
                best_match=best,
                alternatives=alts,
            ))

        _suggestion_cache[cache_key] = suggestions
        try:
            await fmq.upsert_cache_doc(
                current_user,
                cache_key,
                {
                    "mapping_suggestions": [s.model_dump() for s in suggestions],
                    "kind": "equipment_type_mapping",
                    "node_ids": sorted([n.id for n in nodes]),
                    "equipment_type_ids": sorted(et_ids),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
            )
        except Exception as e:
            logger.warning(f"Failed to persist mapping cache (non-fatal): {e}")

        return suggestions

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI mapping response: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse AI response")
    except Exception as e:
        logger.error(f"AI mapping error: {e}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@router.post("/equipment-type-mappings", response_model=SuggestEquipmentTypeMappingsResponse)
async def suggest_equipment_type_mappings(
    request: SuggestEquipmentTypeMappingsRequest,
    current_user: dict = Depends(get_current_user),
):
    """Get deterministic AI-powered equipment_type suggestions for equipment nodes."""
    if not request.nodes:
        raise HTTPException(status_code=400, detail="No equipment nodes provided")
    if not request.equipment_types:
        raise HTTPException(status_code=400, detail="No equipment types provided")

    # Cap to avoid runaway prompts. The frontend batches in chunks of 25.
    # Keep this small so the per-request latency stays well under proxy timeouts.
    nodes = request.nodes[:30]
    types = request.equipment_types[:300]

    suggestions = await get_equipment_type_mapping_suggestions(nodes, types, current_user)
    total_matched = sum(1 for s in suggestions if s.best_match is not None)

    return SuggestEquipmentTypeMappingsResponse(
        suggestions=suggestions,
        total_matched=total_matched,
    )


# =============================================================================
# New Equipment Type Suggestions (from Equipment Hierarchy)
# =============================================================================

VALID_DISCIPLINES = [
    "Rotating", "Static", "Piping", "Electrical",
    "Instrumentation", "Civil", "Operations", "Laboratory",
]


class NewEquipmentTypeSuggestion(BaseModel):
    suggested_id: str
    suggested_name: str
    discipline: str
    rationale: str
    example_node_ids: List[str] = []
    example_node_names: List[str] = []
    node_count: int = 0


class SuggestNewEquipmentTypesRequest(BaseModel):
    nodes: List[EquipmentNodeInput]
    existing_equipment_types: List[EquipmentTypeOption]


class SuggestNewEquipmentTypesResponse(BaseModel):
    suggestions: List[NewEquipmentTypeSuggestion]
    total: int



def get_new_types_cache_key(nodes: List[EquipmentNodeInput], et_ids: List[str]) -> str:
    """Cache key based on node descriptors + existing type IDs."""
    node_keys = sorted([f"{n.id}|{n.name}|{n.level or ''}" for n in nodes])
    type_keys = sorted(et_ids)
    return hashlib.md5(f"NEWTYPES:{node_keys}:{type_keys}".encode()).hexdigest()


async def get_new_equipment_type_suggestions(
    nodes: List[EquipmentNodeInput],
    existing_types: List[EquipmentTypeOption],
    current_user: Optional[dict] = None,
) -> List[NewEquipmentTypeSuggestion]:
    """Use OpenAI to propose new equipment types based on hierarchy nodes."""
    et_ids = [et.id for et in existing_types]
    cache_key = get_new_types_cache_key(nodes, et_ids)

    if cache_key in _suggestion_cache:
        logger.info(f"Returning in-memory cached new-type suggestions: {cache_key[:8]}")
        return _suggestion_cache[cache_key]

    try:
        cached_doc = await fmq.find_cache_doc(current_user, cache_key)
        if cached_doc and "new_type_suggestions" in cached_doc:
            suggestions = [NewEquipmentTypeSuggestion(**s) for s in cached_doc["new_type_suggestions"]]
            _suggestion_cache[cache_key] = suggestions
            logger.info(f"Returning Mongo-cached new-type suggestions: {cache_key[:8]}")
            return suggestions
    except Exception as e:
        logger.warning(f"New-types cache lookup failed (non-fatal): {e}")

    existing_list = [
        {"id": et.id, "name": et.name, "discipline": et.discipline or ""}
        for et in existing_types
    ]
    node_list = [
        {
            "id": n.id,
            "name": n.name,
            "level": n.level or "",
            "tag": n.tag or "",
        }
        for n in nodes
    ]

    user_prompt = f"""EXISTING EQUIPMENT TYPES (do NOT re-propose these):
{json.dumps(existing_list, indent=2)}

EQUIPMENT NODES FROM PLANT HIERARCHY:
{json.dumps(node_list, indent=2)}

Return JSON:
{{
  "suggestions": [
    {{
      "suggested_id": "snake_case_id",
      "suggested_name": "Title Case Name",
      "discipline": "Rotating",
      "rationale": "1 short sentence",
      "example_node_ids": ["<id>", "<id>"],
      "example_node_names": ["<name>", "<name>"],
      "node_count": 3
    }}
  ]
}}"""

    try:
        result = await _fm_json(
            "fm.new_equipment_type",
            user=current_user,
            user_message=user_prompt,
            endpoint="ai_fm_suggestions.new_equipment_types",
        )

        existing_ids_lower = {et.id.lower() for et in existing_types}
        existing_names_lower = {et.name.lower() for et in existing_types}
        valid_node_ids = {n.id for n in nodes}
        node_name_by_id = {n.id: n.name for n in nodes}

        suggestions: List[NewEquipmentTypeSuggestion] = []
        seen_ids = set()
        seen_names = set()
        for item in result.get("suggestions", []):
            sid = (item.get("suggested_id") or "").strip().lower()
            sname = (item.get("suggested_name") or "").strip()
            if not sid or not sname:
                continue
            # Skip if duplicate of existing or already seen in this batch
            if sid in existing_ids_lower or sid in seen_ids:
                continue
            if sname.lower() in existing_names_lower or sname.lower() in seen_names:
                continue

            discipline = (item.get("discipline") or "").strip()
            if discipline not in VALID_DISCIPLINES:
                # Try case-insensitive match
                match = next((d for d in VALID_DISCIPLINES if d.lower() == discipline.lower()), None)
                discipline = match or "Operations"

            example_ids = [eid for eid in (item.get("example_node_ids") or []) if eid in valid_node_ids][:5]
            example_names = item.get("example_node_names") or []
            # Backfill names from input data when missing/mismatched
            if not example_names or len(example_names) != len(example_ids):
                example_names = [node_name_by_id.get(eid, "") for eid in example_ids]

            try:
                node_count = int(item.get("node_count") or len(example_ids))
            except (TypeError, ValueError):
                node_count = len(example_ids)

            seen_ids.add(sid)
            seen_names.add(sname.lower())
            suggestions.append(NewEquipmentTypeSuggestion(
                suggested_id=sid,
                suggested_name=sname,
                discipline=discipline,
                rationale=(item.get("rationale") or "").strip(),
                example_node_ids=example_ids,
                example_node_names=example_names[:5],
                node_count=max(node_count, len(example_ids)),
            ))

        # Sort by node_count desc and cap at 15
        suggestions.sort(key=lambda s: s.node_count, reverse=True)
        suggestions = suggestions[:15]

        _suggestion_cache[cache_key] = suggestions
        try:
            await fmq.upsert_cache_doc(
                current_user,
                cache_key,
                {
                    "new_type_suggestions": [s.model_dump() for s in suggestions],
                    "kind": "new_equipment_types",
                    "node_ids": sorted([n.id for n in nodes]),
                    "existing_type_ids": sorted(et_ids),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
            )
        except Exception as e:
            logger.warning(f"Failed to persist new-types cache (non-fatal): {e}")

        return suggestions

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI new-types response: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse AI response")
    except Exception as e:
        logger.error(f"AI new-types error: {e}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@router.post("/new-equipment-types", response_model=SuggestNewEquipmentTypesResponse)
async def suggest_new_equipment_types(
    request: SuggestNewEquipmentTypesRequest,
    current_user: dict = Depends(get_current_user),
):
    """Get AI-suggested NEW equipment types based on the user's plant hierarchy."""
    if not request.nodes:
        raise HTTPException(status_code=400, detail="No equipment nodes provided")

    nodes = request.nodes[:200]  # accept more nodes since this is a discovery task
    existing = request.existing_equipment_types[:400]

    suggestions = await get_new_equipment_type_suggestions(nodes, existing, current_user)
    return SuggestNewEquipmentTypesResponse(
        suggestions=suggestions,
        total=len(suggestions),
    )


# =============================================================================
# New Failure Mode Suggestions (Reliability Engineer persona)
# =============================================================================

class ExistingFailureModeBrief(BaseModel):
    failure_mode: str
    category: Optional[str] = None
    equipment_type_ids: List[str] = []


class NewFailureModeSuggestion(BaseModel):
    failure_mode: str
    category: str
    mechanism: Optional[str] = None   # ISO 14224 short code, e.g. "BRD", "LKG"
    severity: int
    occurrence: int
    detectability: int
    rpn: int
    equipment_type_ids: List[str] = []
    equipment_type_names: List[str] = []
    keywords: List[str] = []
    potential_effects: List[str] = []
    potential_causes: List[str] = []
    recommended_actions: List[str] = []
    rationale: str


class SuggestNewFailureModesRequest(BaseModel):
    equipment_types: List[EquipmentTypeOption]
    existing_failure_modes: List[ExistingFailureModeBrief]


class SuggestNewFailureModesResponse(BaseModel):
    suggestions: List[NewFailureModeSuggestion]
    total: int



def get_new_fms_cache_key(eq_types: List[EquipmentTypeOption], existing: List[ExistingFailureModeBrief]) -> str:
    et_keys = sorted([f"{et.id}|{et.discipline or ''}" for et in eq_types])
    fm_keys = sorted([f"{(fm.failure_mode or '').lower()}|{(fm.category or '').lower()}" for fm in existing])
    return hashlib.md5(f"NEWFMS:{et_keys}:{fm_keys}".encode()).hexdigest()


async def get_new_failure_mode_suggestions(
    equipment_types: List[EquipmentTypeOption],
    existing_failure_modes: List[ExistingFailureModeBrief],
    current_user: Optional[dict] = None,
) -> List[NewFailureModeSuggestion]:
    """Propose NEW failure modes that should be added to the library."""
    cache_key = get_new_fms_cache_key(equipment_types, existing_failure_modes)

    if cache_key in _suggestion_cache:
        logger.info(f"Returning in-memory cached new-FM suggestions: {cache_key[:8]}")
        return _suggestion_cache[cache_key]

    try:
        cached_doc = await fmq.find_cache_doc(current_user, cache_key)
        if cached_doc and "new_fm_suggestions" in cached_doc:
            suggestions = [NewFailureModeSuggestion(**s) for s in cached_doc["new_fm_suggestions"]]
            _suggestion_cache[cache_key] = suggestions
            logger.info(f"Returning Mongo-cached new-FM suggestions: {cache_key[:8]}")
            return suggestions
    except Exception as e:
        logger.warning(f"New-FM cache lookup failed (non-fatal): {e}")

    et_list = [
        {"id": et.id, "name": et.name, "discipline": et.discipline or ""}
        for et in equipment_types
    ]
    existing_list = [
        {
            "failure_mode": fm.failure_mode,
            "category": fm.category or "",
            "equipment_type_ids": fm.equipment_type_ids or [],
        }
        for fm in existing_failure_modes
    ]

    user_prompt = f"""EQUIPMENT TYPE CATALOG (use exact IDs in your output):
{json.dumps(et_list, indent=2)}

EXISTING FAILURE MODES (do NOT re-propose these):
{json.dumps(existing_list, indent=2)}

Return JSON:
{{
  "suggestions": [
    {{
      "failure_mode": "Mechanical Seal Face Wear",
      "category": "Rotating",
      "mechanism": "WEA",
      "severity": 7,
      "occurrence": 5,
      "detectability": 6,
      "rpn": 210,
      "equipment_type_ids": ["pump_centrifugal"],
      "equipment_type_names": ["Centrifugal Pump"],
      "keywords": ["seal wear", "mechanical seal", "face wear"],
      "potential_effects": ["Process leak", "Loss of containment"],
      "potential_causes": ["Abrasive particles", "Dry running"],
      "recommended_actions": ["Vibration trend monitoring (PDM)", "Replace seal at planned shutdown (PM)"],
      "rationale": "Mechanical seal wear is a top-cause pump failure not present in the library."
    }}
  ]
}}"""

    try:
        result = await _fm_json(
            "fm.new_failure_mode",
            user=current_user,
            user_message=user_prompt,
            endpoint="ai_fm_suggestions.new_failure_modes",
            max_tokens=4500,
        )

        existing_names = {(fm.failure_mode or "").strip().lower() for fm in existing_failure_modes}
        valid_et_ids = {et.id for et in equipment_types}
        et_name_by_id = {et.id: et.name for et in equipment_types}

        suggestions: List[NewFailureModeSuggestion] = []
        seen_names = set()

        def _clip(v, lo, hi, default):
            try:
                v = int(v)
            except (TypeError, ValueError):
                v = default
            return max(lo, min(hi, v))

        for item in result.get("suggestions", []):
            name = (item.get("failure_mode") or "").strip()
            if not name:
                continue
            low = name.lower()
            if low in existing_names or low in seen_names:
                continue

            sev = _clip(item.get("severity"), 1, 10, 5)
            occ = _clip(item.get("occurrence"), 1, 10, 5)
            det = _clip(item.get("detectability"), 1, 10, 5)
            rpn = sev * occ * det

            raw_ids = item.get("equipment_type_ids") or []
            et_ids = [i for i in raw_ids if i in valid_et_ids][:5]
            if not et_ids:
                # Without a valid equipment_type mapping, the suggestion is not actionable.
                continue
            et_names = [et_name_by_id[i] for i in et_ids]

            def _str_list(v, cap):
                if isinstance(v, str):
                    parts = [p.strip() for p in v.split(",") if p.strip()]
                elif isinstance(v, list):
                    parts = [str(p).strip() for p in v if str(p).strip()]
                else:
                    parts = []
                return parts[:cap]

            seen_names.add(low)
            suggestions.append(NewFailureModeSuggestion(
                failure_mode=name,
                category=(item.get("category") or "").strip() or "General",
                mechanism=(item.get("mechanism") or "").strip() or "UNK",
                severity=sev,
                occurrence=occ,
                detectability=det,
                rpn=rpn,
                equipment_type_ids=et_ids,
                equipment_type_names=et_names,
                keywords=_str_list(item.get("keywords"), 6),
                potential_effects=_str_list(item.get("potential_effects"), 6),
                potential_causes=_str_list(item.get("potential_causes"), 6),
                recommended_actions=_str_list(item.get("recommended_actions"), 6),
                rationale=(item.get("rationale") or "").strip(),
            ))

        # Sort by RPN desc, cap at 15
        suggestions.sort(key=lambda s: s.rpn, reverse=True)
        suggestions = suggestions[:15]

        _suggestion_cache[cache_key] = suggestions
        try:
            await fmq.upsert_cache_doc(
                current_user,
                cache_key,
                {
                    "new_fm_suggestions": [s.model_dump() for s in suggestions],
                    "kind": "new_failure_modes",
                    "equipment_type_ids": sorted([et.id for et in equipment_types]),
                    "existing_fm_count": len(existing_failure_modes),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
            )
        except Exception as e:
            logger.warning(f"Failed to persist new-FM cache (non-fatal): {e}")

        return suggestions

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI new-FM response: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse AI response")
    except Exception as e:
        logger.error(f"AI new-FM error: {e}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@router.post("/new-failure-modes", response_model=SuggestNewFailureModesResponse)
async def suggest_new_failure_modes(
    request: SuggestNewFailureModesRequest,
    current_user: dict = Depends(get_current_user),
):
    """Get AI-suggested NEW failure modes based on the user's equipment type catalog."""
    if not request.equipment_types:
        raise HTTPException(status_code=400, detail="No equipment types provided")

    eq_types = request.equipment_types[:120]

    # Build a complete dedup set by pulling ALL failure mode names directly from Mongo.
    # The client-side list may be paginated/truncated; we must guarantee no duplicates.
    full_existing_names = set()
    full_existing_briefs: List[ExistingFailureModeBrief] = []
    try:
        cursor = fmq.find_failure_modes(
            current_user,
            {},
            {"_id": 0, "failure_mode": 1, "category": 1, "equipment_type_ids": 1},
        )
        async for fm in cursor:
            name = (fm.get("failure_mode") or "").strip()
            if not name:
                continue
            full_existing_names.add(name.lower())
            full_existing_briefs.append(ExistingFailureModeBrief(
                failure_mode=name,
                category=fm.get("category") or "",
                equipment_type_ids=fm.get("equipment_type_ids") or [],
            ))
    except Exception as e:
        logger.warning(f"Failed to load full FM library for dedup (falling back to request payload): {e}")
        full_existing_briefs = list(request.existing_failure_modes)
        for fm in full_existing_briefs:
            full_existing_names.add((fm.failure_mode or "").lower())

    # Cap prompt size: most recent / most representative. We send up to 600 names so
    # the AI has solid context, but dedup runs against the FULL set below.
    prompt_existing = full_existing_briefs[:600]

    raw_suggestions = await get_new_failure_mode_suggestions(eq_types, prompt_existing, current_user)

    # Hard dedup against the full Mongo library — drop any name that already exists
    # even if it slipped past the AI prompt (e.g. user lib > 600 FMs).
    suggestions = [
        s for s in raw_suggestions
        if (s.failure_mode or "").strip().lower() not in full_existing_names
    ]

    return SuggestNewFailureModesResponse(
        suggestions=suggestions,
        total=len(suggestions),
    )


# =============================================================================
# Improve a single Failure Mode (Reliability Engineer)
# =============================================================================

class ExistingFailureModeFull(BaseModel):
    id: Optional[str] = None
    failure_mode: str
    category: Optional[str] = None
    mechanism: Optional[str] = None
    severity: Optional[int] = None
    occurrence: Optional[int] = None
    detectability: Optional[int] = None
    keywords: List[str] = []
    potential_effects: List[str] = []
    potential_causes: List[str] = []
    recommended_actions: List[str] = []
    equipment_type_ids: List[str] = []


class ImproveFailureModeRequest(BaseModel):
    failure_mode: ExistingFailureModeFull
    equipment_types: List[EquipmentTypeOption] = []


class ImprovedFailureMode(BaseModel):
    failure_mode: str
    category: str
    mechanism: str
    severity: int
    occurrence: int
    detectability: int
    rpn: int
    keywords: List[str] = []
    potential_effects: List[str] = []
    potential_causes: List[str] = []
    recommended_actions: List[str] = []
    equipment_type_ids: List[str] = []
    equipment_type_names: List[str] = []
    improvements_summary: List[str] = []
    # Per-field explanations: key = field name, value = 1-sentence reason.
    # Only populated for fields that were actually changed. Untouched fields are omitted.
    field_explanations: Dict[str, str] = {}
    rationale: str = ""



def _improve_cache_key(fm: ExistingFailureModeFull, et_ids: List[str]) -> str:
    fingerprint = json.dumps({
        "name": fm.failure_mode,
        "category": fm.category or "",
        "mechanism": fm.mechanism or "",
        "sod": [fm.severity, fm.occurrence, fm.detectability],
        "kw": sorted(fm.keywords or []),
        "eff": sorted(fm.potential_effects or []),
        "cau": sorted(fm.potential_causes or []),
        "act": sorted(fm.recommended_actions or []),
        "eq": sorted(fm.equipment_type_ids or []),
        "catalog": sorted(et_ids),
    }, sort_keys=True)
    # Bump version when prompt schema changes so stale cached responses are not reused.
    return hashlib.md5(f"IMPROVEFM_V4:{fingerprint}".encode()).hexdigest()


async def improve_failure_mode_with_ai(
    fm: ExistingFailureModeFull,
    equipment_types: List[EquipmentTypeOption],
    current_user: Optional[dict] = None,
) -> ImprovedFailureMode:
    """Use OpenAI to produce an improved version of a single failure mode."""
    et_ids = [et.id for et in equipment_types]
    cache_key = _improve_cache_key(fm, et_ids)

    if cache_key in _suggestion_cache:
        logger.info(f"Returning in-memory cached improved FM: {cache_key[:8]}")
        return _suggestion_cache[cache_key]

    try:
        cached_doc = await fmq.find_cache_doc(current_user, cache_key)
        if cached_doc and "improved_fm" in cached_doc:
            improved = ImprovedFailureMode(**cached_doc["improved_fm"])
            _suggestion_cache[cache_key] = improved
            logger.info(f"Returning Mongo-cached improved FM: {cache_key[:8]}")
            return improved
    except Exception as e:
        logger.warning(f"Improve-FM cache lookup failed (non-fatal): {e}")

    # Shrink the catalog so each request stays under ~3k prompt tokens (vs ~5k before).
    # Priority: 1) existing ET ids already on the FM, 2) ETs sharing the FM's discipline.
    fm_discipline = (fm.category or "").strip().lower()
    existing_ids = set(fm.equipment_type_ids or [])
    primary = [et for et in equipment_types if et.id in existing_ids]
    secondary = [
        et for et in equipment_types
        if et.id not in existing_ids and (et.discipline or "").strip().lower() == fm_discipline
    ]
    fallback = [
        et for et in equipment_types
        if et.id not in existing_ids and (et.discipline or "").strip().lower() != fm_discipline
    ]
    trimmed_types = (primary + secondary + fallback)[:40]

    et_list = [
        {"id": et.id, "name": et.name, "discipline": et.discipline or ""}
        for et in trimmed_types
    ]
    fm_payload = {
        "failure_mode": fm.failure_mode,
        "category": fm.category or "",
        "mechanism": fm.mechanism or "",
        "severity": fm.severity,
        "occurrence": fm.occurrence,
        "detectability": fm.detectability,
        "keywords": fm.keywords or [],
        "potential_effects": fm.potential_effects or [],
        "potential_causes": fm.potential_causes or [],
        "recommended_actions": fm.recommended_actions or [],
        "equipment_type_ids": fm.equipment_type_ids or [],
    }

    user_prompt = f"""CURRENT FAILURE MODE:
{json.dumps(fm_payload, indent=2)}

EQUIPMENT TYPE CATALOG (use exact IDs only):
{json.dumps(et_list, indent=2)}

Return JSON:
{{
  "failure_mode": "string",
  "category": "string",
  "mechanism": "string",
  "severity": 7,
  "occurrence": 4,
  "detectability": 6,
  "keywords": ["..."],
  "potential_effects": ["..."],
  "potential_causes": ["..."],
  "recommended_actions": ["..."],
  "equipment_type_ids": ["..."],
  "equipment_type_names": ["..."],
  "improvements_summary": ["..."],
  "field_explanations": {{
    "severity": "Lowered from 9 to 7 — typical for non-safety bearing wear.",
    "keywords": "Added 'mechanical seal' to improve search recall."
  }},
  "rationale": "1 short sentence — if nothing changed, say 'Record is already strong; no changes needed.'"
}}"""

    try:
        result = await _fm_json(
            "fm.improve_failure_mode",
            user=current_user,
            user_message=user_prompt,
            endpoint="ai_fm_suggestions.improve_failure_mode",
            max_tokens=3500,
            max_retries=4,
        )

        valid_et_ids = {et.id for et in equipment_types}
        et_name_by_id = {et.id: et.name for et in equipment_types}

        def _clip(v, lo, hi, default):
            try:
                v = int(v)
            except (TypeError, ValueError):
                v = default
            return max(lo, min(hi, v))

        def _str_list(v, cap):
            if isinstance(v, str):
                parts = [p.strip() for p in v.split(",") if p.strip()]
            elif isinstance(v, list):
                parts = [str(p).strip() for p in v if str(p).strip()]
            else:
                parts = []
            seen = set()
            out = []
            for p in parts:
                key = p.lower()
                if key in seen:
                    continue
                seen.add(key)
                out.append(p)
            return out[:cap]

        sev = _clip(result.get("severity"), 1, 10, fm.severity or 5)
        occ = _clip(result.get("occurrence"), 1, 10, fm.occurrence or 5)
        det = _clip(result.get("detectability"), 1, 10, fm.detectability or 5)

        # ---- Discipline tag normalisation for recommended_actions ----
        # Even with an updated prompt, the model occasionally returns legacy
        # discipline labels like "[Mechanical]" or "[Process]". Rewrite those
        # to the 8 canonical disciplines so the FM library never persists a
        # non-standard tag.
        _DISC_FIX = {
            "mechanical": "Rotating",
            "process": "Operations",
            "i&c": "Instrumentation",
            "ic": "Instrumentation",
            "instrument": "Instrumentation",
            "elec": "Electrical",
            "ops": "Operations",
            "operator": "Operations",
            "structural": "Civil",
            "civil/structural": "Civil",
            "lab": "Laboratory",
            "inspection": "Laboratory",
            "maintenance": "Operations",
            "safety": "Operations",
            "reliability": "Operations",
            "engineering": "Operations",
        }
        _CANONICAL = {"Rotating", "Static", "Piping", "Electrical",
                      "Instrumentation", "Civil", "Operations", "Laboratory"}

        def _fix_action(text: str) -> str:
            """Replace any [Discipline] tag inside an action string with a canonical value."""
            if not isinstance(text, str):
                return text
            import re
            def _repl(m):
                raw = m.group(1).strip()
                if raw in _CANONICAL:
                    return f"[{raw}]"
                fixed = _DISC_FIX.get(raw.lower())
                if fixed:
                    return f"[{fixed}]"
                # Title-cased close match
                title = raw.title()
                if title in _CANONICAL:
                    return f"[{title}]"
                # Unknown — coerce to Operations rather than leaving an invalid tag
                return "[Operations]"
            return re.sub(r"\[([^\]]+)\]", _repl, text)

        raw_ids = result.get("equipment_type_ids") or []
        et_ids_out = [i for i in raw_ids if i in valid_et_ids]
        # Always preserve existing valid IDs even if AI dropped them
        for eid in (fm.equipment_type_ids or []):
            if eid in valid_et_ids and eid not in et_ids_out:
                et_ids_out.append(eid)
        et_ids_out = et_ids_out[:8]
        et_names_out = [et_name_by_id[i] for i in et_ids_out]

        # Whitelist of allowed explanation keys (must match the diff fields)
        ALLOWED_EXPL_KEYS = {
            "failure_mode", "category", "mechanism",
            "severity", "occurrence", "detectability",
            "keywords", "potential_effects", "potential_causes",
            "recommended_actions", "equipment_type_ids",
        }

        def _no_category_word(text: str) -> str:
            """Rewrite any literal mention of 'category' in human-readable text
            to 'discipline'. The JSON key stays `category` (legacy schema) but
            the prose the user reads should consistently say 'discipline'."""
            if not isinstance(text, str):
                return text
            import re
            return re.sub(r"\bcategor(y|ies)\b", lambda m: "discipline" + ("" if m.group(1) == "y" else "s"), text, flags=re.IGNORECASE)

        raw_expls = result.get("field_explanations") or {}
        field_explanations: Dict[str, str] = {}
        if isinstance(raw_expls, dict):
            for k, v in raw_expls.items():
                if k in ALLOWED_EXPL_KEYS and isinstance(v, str) and v.strip():
                    field_explanations[k] = _no_category_word(v.strip())

        improved = ImprovedFailureMode(
            failure_mode=(result.get("failure_mode") or fm.failure_mode).strip(),
            category=(result.get("category") or fm.category or "General").strip(),
            mechanism=(result.get("mechanism") or fm.mechanism or "UNK").strip().upper(),
            severity=sev,
            occurrence=occ,
            detectability=det,
            rpn=sev * occ * det,
            keywords=_str_list(result.get("keywords"), 8),
            potential_effects=_str_list(result.get("potential_effects"), 6),
            potential_causes=_str_list(result.get("potential_causes"), 6),
            recommended_actions=[_fix_action(a) for a in _str_list(result.get("recommended_actions"), 8)],
            equipment_type_ids=et_ids_out,
            equipment_type_names=et_names_out,
            improvements_summary=[_no_category_word(s) for s in _str_list(result.get("improvements_summary"), 6)],
            field_explanations=field_explanations,
            rationale=_no_category_word((result.get("rationale") or "").strip()),
        )

        _suggestion_cache[cache_key] = improved
        try:
            await fmq.upsert_cache_doc(
                current_user,
                cache_key,
                {
                    "improved_fm": improved.model_dump(),
                    "kind": "improve_failure_mode",
                    "fm_id": fm.id,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
            )
        except Exception as e:
            logger.warning(f"Failed to persist improved-FM cache (non-fatal): {e}")

        return improved

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI improve-FM response: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse AI response")
    except RateLimitError as e:
        logger.error(f"AI improve-FM rate limit exhausted: {e}")
        raise HTTPException(
            status_code=429,
            detail="OpenAI rate limit. Please slow the bulk run or try again in a minute.",
        )
    except Exception as e:
        logger.error(f"AI improve-FM error: {e}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@router.post("/improve-failure-mode", response_model=ImprovedFailureMode)
async def improve_failure_mode_endpoint(
    request: ImproveFailureModeRequest,
    current_user: dict = Depends(get_current_user),
):
    """Have an AI reliability engineer improve a single failure mode record."""
    if not request.failure_mode or not request.failure_mode.failure_mode:
        raise HTTPException(status_code=400, detail="No failure mode provided")
    eq_types = request.equipment_types[:200]
    return await improve_failure_mode_with_ai(request.failure_mode, eq_types, current_user)


# ============= Action Discipline Review =============
#
# Classifies recommended-action disciplines using the tenant taxonomy from
# Settings → Disciplines (with built-in fallback).

from services.failure_modes.action_discipline_map import classify_recommended_actions


class ActionDisciplineInput(BaseModel):
    fm_id: str
    action_index: int
    description: str
    action_type: Optional[str] = None
    current_discipline: Optional[str] = None
    failure_mode: Optional[str] = None
    fm_discipline: Optional[str] = None


class ActionDisciplineResult(BaseModel):
    fm_id: str
    action_index: int
    current_discipline: Optional[str] = None
    suggested_discipline: str
    reason: str
    changed: bool


class ReviewActionDisciplinesRequest(BaseModel):
    actions: List[ActionDisciplineInput]


class ReviewActionDisciplinesResponse(BaseModel):
    results: List[ActionDisciplineResult]


@router.post("/review-action-disciplines", response_model=ReviewActionDisciplinesResponse)
async def review_action_disciplines(
    request: ReviewActionDisciplinesRequest,
    current_user: dict = Depends(get_current_user),
):
    """Classify a batch of recommended actions into Settings disciplines."""
    if not request.actions:
        return ReviewActionDisciplinesResponse(results=[])
    if len(request.actions) > 16:
        raise HTTPException(status_code=400, detail="Send at most 16 actions per batch.")

    uid, cid = user_context(current_user)
    try:
        raw_results, _taxonomy = await classify_recommended_actions(
            [a.model_dump() for a in request.actions],
            user_id=uid,
            company_id=cid,
            endpoint="ai_fm_suggestions.review_action_disciplines",
        )
    except json.JSONDecodeError as e:
        logger.error("Action-discipline classifier JSON parse failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to parse AI response") from e
    except RateLimitError as e:
        logger.error("Action-discipline classifier rate limit: %s", e)
        raise HTTPException(status_code=429, detail="OpenAI rate limit — try again in a moment.") from e
    except Exception as e:
        logger.error("Action-discipline classifier error: %s", e)
        raise HTTPException(status_code=500, detail=f"AI service error: {e}") from e

    results = [
        ActionDisciplineResult(
            fm_id=r["fm_id"],
            action_index=r["action_index"],
            current_discipline=r.get("current_discipline"),
            suggested_discipline=r["suggested_discipline"],
            reason=r["reason"],
            changed=r["changed"],
        )
        for r in raw_results
    ]
    return ReviewActionDisciplinesResponse(results=results)


class MapFailureModeActionDisciplinesRequest(BaseModel):
    failure_mode_id: str
    apply: bool = False


class MapFailureModeActionDisciplinesResponse(BaseModel):
    failure_mode_id: str
    failure_mode: str
    actions_before: int
    changes_suggested: int
    results: List[ActionDisciplineResult]
    applied: bool = False
    disciplines: List[Dict[str, Any]] = Field(default_factory=list)


@router.post(
    "/map-failure-mode-action-disciplines",
    response_model=MapFailureModeActionDisciplinesResponse,
)
async def map_failure_mode_action_disciplines(
    request: MapFailureModeActionDisciplinesRequest,
    current_user: dict = Depends(get_current_user),
):
    """Map recommended actions for one failure mode to Settings disciplines."""
    from database import failure_modes_service

    fm_id = (request.failure_mode_id or "").strip()
    if not fm_id:
        raise HTTPException(status_code=400, detail="failure_mode_id is required")

    fm = await failure_modes_service.get_by_id(fm_id)
    if not fm:
        raise HTTPException(status_code=404, detail="Failure mode not found")

    actions_in = []
    for idx, act in enumerate(fm.get("recommended_actions") or []):
        if not act:
            continue
        if isinstance(act, str):
            description = act
            action_type = ""
            current_discipline = ""
        else:
            description = act.get("action") or act.get("description") or ""
            action_type = act.get("action_type") or ""
            current_discipline = act.get("discipline") or ""
        if not description:
            continue
        actions_in.append(
            {
                "fm_id": fm_id,
                "action_index": idx,
                "description": description,
                "action_type": action_type,
                "current_discipline": current_discipline,
                "failure_mode": fm.get("failure_mode") or "",
                "fm_discipline": fm.get("discipline") or fm.get("category") or "",
            }
        )

    if not actions_in:
        raise HTTPException(status_code=400, detail="No recommended actions to classify.")

    uid, cid = user_context(current_user)
    try:
        raw_results, taxonomy = await classify_recommended_actions(
            actions_in,
            user_id=uid,
            company_id=cid,
            endpoint="ai_fm_suggestions.map_failure_mode_action_disciplines",
        )
    except RateLimitError as e:
        raise HTTPException(status_code=429, detail="OpenAI rate limit — try again in a moment.") from e
    except Exception as e:
        logger.error("map-failure-mode-action-disciplines error: %s", e)
        raise HTTPException(status_code=500, detail=f"AI service error: {e}") from e

    results = [ActionDisciplineResult(**r) for r in raw_results]
    changes = [r for r in results if r.changed]

    applied = False
    if request.apply and changes:
        next_actions = [
            dict(a) if isinstance(a, dict) else {"action": a}
            for a in (fm.get("recommended_actions") or [])
        ]
        for r in changes:
            if 0 <= r.action_index < len(next_actions):
                next_actions[r.action_index] = {
                    **next_actions[r.action_index],
                    "discipline": r.suggested_discipline,
                }
        await failure_modes_service.update(
            fm_id,
            {"recommended_actions": next_actions},
            updated_by=current_user.get("email") or current_user.get("id") or "AI",
            change_reason="AI mapped action disciplines to Settings taxonomy",
        )
        applied = True

    return MapFailureModeActionDisciplinesResponse(
        failure_mode_id=fm_id,
        failure_mode=fm.get("failure_mode") or "",
        actions_before=len(actions_in),
        changes_suggested=len(changes),
        results=results,
        applied=applied,
        disciplines=[
            {"value": d.get("value"), "label": d.get("label")}
            for d in taxonomy
            if d.get("value")
        ],
    )


# ============= Action Downtime Requirement (AI) =============

from services.failure_modes.action_downtime_suggest import (
    classify_recommended_actions_downtime_batch,
    suggest_action_downtime_requirements,
)


class CheckActionDowntimeRequest(BaseModel):
    failure_mode_id: str
    apply: bool = False


class ActionDowntimeResult(BaseModel):
    action_index: int
    current_requires_downtime: bool = False
    suggested_requires_downtime: bool
    reasoning: str
    changed: bool


class CheckActionDowntimeResponse(BaseModel):
    failure_mode_id: str
    failure_mode: str
    actions_before: int
    changes_suggested: int
    results: List[ActionDowntimeResult]
    applied: bool = False


class SuggestActionDowntimeRequest(BaseModel):
    description: str
    action_type: Optional[str] = None
    failure_mode: Optional[str] = None
    equipment: Optional[str] = None


class SuggestActionDowntimeResponse(BaseModel):
    requires_downtime: bool
    reasoning: str


@router.post(
    "/check-failure-mode-action-downtime",
    response_model=CheckActionDowntimeResponse,
)
async def check_failure_mode_action_downtime(
    request: CheckActionDowntimeRequest,
    current_user: dict = Depends(get_current_user),
):
    """Use AI to suggest whether each recommended action requires equipment downtime."""
    from database import failure_modes_service

    fm_id = (request.failure_mode_id or "").strip()
    if not fm_id:
        raise HTTPException(status_code=400, detail="failure_mode_id is required")

    fm = await failure_modes_service.get_by_id(fm_id)
    if not fm:
        raise HTTPException(status_code=404, detail="Failure mode not found")

    actions_in = []
    for idx, act in enumerate(fm.get("recommended_actions") or []):
        if not act:
            continue
        if isinstance(act, str):
            description = act
            action_type = ""
            current_downtime = False
        else:
            description = act.get("action") or act.get("description") or ""
            action_type = act.get("action_type") or ""
            current_downtime = bool(act.get("requires_downtime"))
        if not description:
            continue
        actions_in.append(
            {
                "action_index": idx,
                "description": description,
                "action_type": action_type,
                "current_requires_downtime": current_downtime,
                "failure_mode": fm.get("failure_mode") or "",
                "equipment": fm.get("equipment") or "",
            }
        )

    if not actions_in:
        raise HTTPException(status_code=400, detail="No recommended actions to classify.")

    uid, cid = user_context(current_user)
    try:
        raw_results = await suggest_action_downtime_requirements(
            actions_in,
            user_id=uid,
            company_id=cid,
            endpoint="ai_fm_suggestions.check_failure_mode_action_downtime",
        )
    except RateLimitError as e:
        raise HTTPException(status_code=429, detail="OpenAI rate limit — try again in a moment.") from e
    except Exception as e:
        logger.error("check-failure-mode-action-downtime error: %s", e)
        raise HTTPException(status_code=500, detail=f"AI service error: {e}") from e

    results = [ActionDowntimeResult(**r) for r in raw_results]
    changes = [r for r in results if r.changed]

    applied = False
    if request.apply and changes:
        next_actions = [
            dict(a) if isinstance(a, dict) else {"action": a}
            for a in (fm.get("recommended_actions") or [])
        ]
        for r in changes:
            if 0 <= r.action_index < len(next_actions):
                next_actions[r.action_index] = {
                    **next_actions[r.action_index],
                    "requires_downtime": r.suggested_requires_downtime,
                }
        await failure_modes_service.update(
            fm_id,
            {"recommended_actions": next_actions},
            updated_by=current_user.get("email") or current_user.get("id") or "AI",
            change_reason="AI classified action downtime requirements",
        )
        applied = True

    return CheckActionDowntimeResponse(
        failure_mode_id=fm_id,
        failure_mode=fm.get("failure_mode") or "",
        actions_before=len(actions_in),
        changes_suggested=len(changes),
        results=results,
        applied=applied,
    )


class ActionDowntimeInput(BaseModel):
    fm_id: str
    action_index: int
    description: str
    action_type: Optional[str] = None
    current_requires_downtime: bool = False
    failure_mode: Optional[str] = None
    equipment: Optional[str] = None


class ActionDowntimeBulkResult(ActionDowntimeResult):
    fm_id: str
    failure_mode: Optional[str] = None


class ReviewActionDowntimeRequest(BaseModel):
    actions: List[ActionDowntimeInput]


class ReviewActionDowntimeResponse(BaseModel):
    results: List[ActionDowntimeBulkResult]


@router.post("/review-action-downtime", response_model=ReviewActionDowntimeResponse)
async def review_action_downtime(
    request: ReviewActionDowntimeRequest,
    current_user: dict = Depends(get_current_user),
):
    """Classify a batch of recommended actions for equipment downtime requirement."""
    if not request.actions:
        return ReviewActionDowntimeResponse(results=[])
    if len(request.actions) > 8:
        raise HTTPException(status_code=400, detail="Send at most 8 actions per batch.")

    uid, cid = user_context(current_user)
    actions_in = [
        {
            "fm_id": a.fm_id,
            "action_index": a.action_index,
            "description": a.description,
            "action_type": str(a.action_type or ""),
            "current_requires_downtime": a.current_requires_downtime,
            "failure_mode": a.failure_mode or "",
            "equipment": a.equipment or "",
        }
        for a in request.actions
    ]
    try:
        raw_results = await classify_recommended_actions_downtime_batch(
            actions_in,
            user_id=uid,
            company_id=cid,
            endpoint="ai_fm_suggestions.review_action_downtime",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except json.JSONDecodeError as e:
        logger.error("review-action-downtime JSON parse failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to parse AI response") from e
    except RateLimitError as e:
        raise HTTPException(status_code=429, detail="OpenAI rate limit — try again in a moment.") from e
    except Exception as e:
        logger.error("review-action-downtime error: %s", e)
        raise HTTPException(status_code=500, detail=f"AI service error: {e}") from e

    results = [
        ActionDowntimeBulkResult(
            fm_id=r.get("fm_id") or inp["fm_id"],
            action_index=r["action_index"],
            failure_mode=r.get("failure_mode") or inp.get("failure_mode"),
            current_requires_downtime=r.get("current_requires_downtime", False),
            suggested_requires_downtime=r["suggested_requires_downtime"],
            reasoning=r.get("reasoning") or "",
            changed=r.get("changed", False),
        )
        for inp, r in zip(actions_in, raw_results)
    ]
    return ReviewActionDowntimeResponse(results=results)


@router.post(
    "/suggest-action-downtime",
    response_model=SuggestActionDowntimeResponse,
)
async def suggest_action_downtime(
    request: SuggestActionDowntimeRequest,
    current_user: dict = Depends(get_current_user),
):
    """Suggest downtime requirement for a single action description."""
    description = (request.description or "").strip()
    if not description:
        raise HTTPException(status_code=400, detail="description is required")

    uid, cid = user_context(current_user)
    try:
        raw_results = await suggest_action_downtime_requirements(
            [
                {
                    "action_index": 0,
                    "description": description,
                    "action_type": request.action_type or "",
                    "current_requires_downtime": False,
                    "failure_mode": request.failure_mode or "",
                    "equipment": request.equipment or "",
                }
            ],
            user_id=uid,
            company_id=cid,
            endpoint="ai_fm_suggestions.suggest_action_downtime",
        )
    except RateLimitError as e:
        raise HTTPException(status_code=429, detail="OpenAI rate limit — try again in a moment.") from e
    except Exception as e:
        logger.error("suggest-action-downtime error: %s", e)
        raise HTTPException(status_code=500, detail=f"AI service error: {e}") from e

    if not raw_results:
        raise HTTPException(status_code=500, detail="AI returned no result")

    first = raw_results[0]
    return SuggestActionDowntimeResponse(
        requires_downtime=bool(first.get("suggested_requires_downtime")),
        reasoning=first.get("reasoning") or "",
    )


# ============= Find Similar Failure Modes (semantic dedupe) =============
#
# For ONE equipment type at a time, accepts the list of failure modes attached
# to it, runs token-overlap + Levenshtein clustering locally to shortlist
# candidates, then asks GPT-4o-mini to confirm which clusters are genuine
# semantic duplicates. Returns the confirmed groups for the frontend to show
# to the user for review-then-merge.

from difflib import SequenceMatcher  # noqa: E402

_SIM_STOPWORDS = {
    "the", "a", "an", "of", "in", "on", "and", "or", "by", "to", "for",
    "from", "with", "without", "due", "failure", "fault", "issue", "problem",
}


def _sim_tokens(s: str) -> set:
    raw = [t for t in "".join(ch if ch.isalnum() else " " for ch in (s or "").lower()).split() if t]
    return {t for t in raw if t not in _SIM_STOPWORDS and len(t) > 2}


def _sim_jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _sim_ratio(a: str, b: str) -> float:
    return SequenceMatcher(None, (a or "").lower(), (b or "").lower()).ratio()


class SimilarFmItem(BaseModel):
    id: str  # Mongo id as string (str(ObjectId)) or legacy_id stringified — frontend sends what it already has
    failure_mode: str


class FindSimilarFailureModesRequest(BaseModel):
    equipment_type_id: str
    equipment_type_name: Optional[str] = None
    failure_modes: List[SimilarFmItem]


class SimilarGroup(BaseModel):
    member_ids: List[str]
    canonical_name: str
    reason: str


class FindSimilarFailureModesResponse(BaseModel):
    equipment_type_id: str
    groups: List[SimilarGroup]
    skipped_reason: Optional[str] = None  # e.g. "no candidate clusters"


@router.post("/find-similar-failure-modes", response_model=FindSimilarFailureModesResponse)
async def find_similar_failure_modes(
    request: FindSimilarFailureModesRequest,
    current_user: dict = Depends(get_current_user),
):
    """Identify groups of near-duplicate failure modes in the submitted set (library-wide).

    Equipment type is not used for clustering — pass all failure modes to scan the library.
    Pipeline:
    1. Build single-link clusters via Jaccard ≥0.5 OR Levenshtein ≥0.8 on names.
    2. For each cluster ≥2 members, ask GPT to confirm which sub-groups are
       genuine duplicates (NOT mechanism differences like wear vs seizure).
    3. Return the confirmed groups.
    """
    fms = request.failure_modes or []
    if len(fms) < 2:
        return FindSimilarFailureModesResponse(
            equipment_type_id=request.equipment_type_id,
            groups=[],
            skipped_reason="less than 2 failure modes",
        )

    n = len(fms)
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    tokens_cache = [_sim_tokens(fm.failure_mode) for fm in fms]
    for i in range(n):
        for j in range(i + 1, n):
            a_name = (fms[i].failure_mode or "").strip().lower()
            b_name = (fms[j].failure_mode or "").strip().lower()
            if a_name == b_name:
                union(i, j)
                continue
            jacc = _sim_jaccard(tokens_cache[i], tokens_cache[j])
            ratio = _sim_ratio(fms[i].failure_mode, fms[j].failure_mode)
            if (jacc >= 0.45 and ratio >= 0.72) or ratio >= 0.86:
                union(i, j)

    cluster_map: Dict[int, List[SimilarFmItem]] = {}
    for i, fm in enumerate(fms):
        cluster_map.setdefault(find(i), []).append(fm)
    candidate_clusters = [c for c in cluster_map.values() if len(c) >= 2]

    if not candidate_clusters:
        return FindSimilarFailureModesResponse(
            equipment_type_id=request.equipment_type_id,
            groups=[],
            skipped_reason="no candidate clusters",
        )

    et_label = request.equipment_type_name or request.equipment_type_id

    all_groups: List[SimilarGroup] = []
    valid_ids_overall = {fm.id for fm in fms}
    used_ids: set = set()  # Prevent overlapping groups across clusters

    for cluster in candidate_clusters:
        items = [{"id": fm.id, "name": fm.failure_mode} for fm in cluster]
        user_msg = (
            f"Equipment type: {et_label}\n\n"
            f"Candidate failure modes:\n{json.dumps(items, indent=2)}\n\n"
            "Return JSON: {\"groups\": [{\"member_ids\": [\"...\", \"...\"], "
            "\"canonical_name\": \"...\", \"reason\": \"<= 12 words\"}]}. "
            "Only include groups with 2+ members that are truly duplicates "
            "(same mechanism, different wording). Use the cleanest / most "
            "ISO-14224-aligned name as canonical. A failure mode may appear "
            "in at most ONE group — never overlap."
        )
        try:
            data = await _fm_json(
                "fm.similar_failure_modes",
                user=current_user,
                user_message=user_msg,
                endpoint="ai_fm_suggestions.find_similar_failure_modes",
                max_tokens=600,
                max_retries=4,
                model="gpt-4o-mini",
            )
            groups = data.get("groups") or []
        except RateLimitError:
            raise HTTPException(status_code=429, detail="OpenAI rate limit — try again in a moment.")
        except json.JSONDecodeError:
            continue
        except Exception as e:
            logger.warning(f"find-similar GPT call failed on ET {et_label}: {e}")
            continue

        for g in groups:
            if not isinstance(g, dict):
                continue
            members = [
                m for m in (g.get("member_ids") or [])
                if isinstance(m, str) and m in valid_ids_overall and m not in used_ids
            ]
            if len(members) < 2:
                continue
            used_ids.update(members)
            all_groups.append(SimilarGroup(
                member_ids=members,
                canonical_name=(g.get("canonical_name") or "").strip()[:200] or "",
                reason=(g.get("reason") or "").strip()[:240],
            ))

    return FindSimilarFailureModesResponse(
        equipment_type_id=request.equipment_type_id,
        groups=all_groups,
    )


# ============= Consolidate recommended actions (per failure mode) =============


class ConsolidateFailureModeActionsRequest(BaseModel):
    failure_mode_id: str
    target_min: int = 3
    target_max: int = 5
    apply: bool = False


class ConsolidatedActionPreview(BaseModel):
    description: str
    action_type: Optional[str] = None
    discipline: Optional[str] = None
    estimated_minutes: Optional[int] = None
    auto_create: Optional[bool] = None
    merged_from_indices: List[int] = []
    consolidation_rationale: Optional[str] = None


class OriginalActionPreview(BaseModel):
    index: int
    label: str
    action_type: Optional[str] = None
    discipline: Optional[str] = None


class ConsolidateFailureModeActionsResponse(BaseModel):
    failure_mode_id: str
    failure_mode: str
    equipment: Optional[str] = None
    actions_before: int
    actions_after: int
    target_min: int
    target_max: int
    summary: Optional[str] = None
    original_actions: List[OriginalActionPreview]
    consolidated_actions: List[ConsolidatedActionPreview]
    applied: bool = False


@router.post(
    "/consolidate-failure-mode-actions",
    response_model=ConsolidateFailureModeActionsResponse,
)
async def consolidate_failure_mode_actions_endpoint(
    request: ConsolidateFailureModeActionsRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    AI-merge duplicate/overlapping recommended actions within one failure mode
    down to a concise set (default 3–5 distinct maintenance tasks).
    """
    from database import failure_modes_service

    fm_id = (request.failure_mode_id or "").strip()
    if not fm_id:
        raise HTTPException(status_code=400, detail="failure_mode_id is required")

    user_id, company_id = user_context(current_user)
    try:
        result = await failure_modes_service.consolidate_recommended_actions_with_ai(
            fm_id,
            target_min=request.target_min,
            target_max=request.target_max,
            apply=request.apply,
            updated_by=current_user.get("email") or current_user.get("id") or "AI",
            user_id=user_id,
            company_id=company_id,
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.error("consolidate-failure-mode-actions error: %s", e)
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}") from e

    return ConsolidateFailureModeActionsResponse(**result)

