"""
AI-powered failure mode suggestions for equipment types.
Uses OpenAI GPT-4o with deterministic settings for consistent output.
"""

import os
import json
import hashlib
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from openai import AsyncOpenAI

from dotenv import load_dotenv
load_dotenv()

from iso14224_models import EQUIPMENT_TYPES
from database import db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai-suggestions", tags=["AI Suggestions"])

# In-memory cache (per-process). Backed by Mongo for cross-restart persistence.
_suggestion_cache: Dict[str, Any] = {}
_CACHE_COLLECTION = "ai_fm_suggestion_cache"

# Initialize OpenAI client
openai_client = None

def get_openai_client():
    global openai_client
    if openai_client is None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")
        openai_client = AsyncOpenAI(api_key=api_key)
    return openai_client

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

SYSTEM_PROMPT = """You are an industrial reliability engineer. Your task is to map failure modes to equipment types.

STRICT RULES - Follow exactly:

1. DISCIPLINE MATCHING (primary criteria):
   - Rotating equipment → ONLY failures related to: bearings, seals, vibration, imbalance, lubrication, shaft, impeller, motor
   - Static equipment → ONLY failures related to: corrosion, erosion, fatigue, cracking, fouling, leakage, blockage
   - Piping/Valves → ONLY failures related to: leakage, blockage, erosion, corrosion, valve stuck, actuator
   - Electrical → ONLY failures related to: insulation, overheating, short circuit, open circuit, contact failure
   - Instrumentation → ONLY failures related to: calibration, drift, signal loss, sensor failure, communication

2. CONFIDENCE SCORING (be conservative):
   - 0.90-0.95: Exact match (e.g., "Bearing Failure" for "Centrifugal Pump")
   - 0.80-0.89: Strong match (same equipment category)
   - 0.70-0.79: Good match (related equipment type)
   - Below 0.70: Do not include

3. OUTPUT REQUIREMENTS:
   - Return 4-6 failure modes per equipment type (no more, no less)
   - Sort by confidence descending
   - Use EXACT IDs from the input lists

Return ONLY valid JSON. No explanations outside JSON."""


def get_cache_key(equipment_ids: List[str], fm_ids: List[str]) -> str:
    """Generate a deterministic cache key."""
    key_str = f"{sorted(equipment_ids)}:{sorted(fm_ids)}"
    return hashlib.md5(key_str.encode()).hexdigest()


async def get_ai_suggestions(
    equipment_types: List[Dict[str, Any]],
    failure_modes: List[Dict[str, Any]]
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
        cached_doc = await db[_CACHE_COLLECTION].find_one({"_id": cache_key})
        if cached_doc and "suggestions" in cached_doc:
            suggestions = [EquipmentTypeSuggestions(**s) for s in cached_doc["suggestions"]]
            _suggestion_cache[cache_key] = suggestions
            logger.info(f"Returning Mongo-cached suggestions for key: {cache_key[:8]}")
            return suggestions
    except Exception as e:
        logger.warning(f"Cache lookup failed (non-fatal): {e}")

    client = get_openai_client()
    
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
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0,  # Completely deterministic
            max_tokens=4000,
            seed=42,  # Fixed seed for reproducibility
            response_format={"type": "json_object"}
        )
        
        result = json.loads(response.choices[0].message.content.strip())
        
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
            await db[_CACHE_COLLECTION].update_one(
                {"_id": cache_key},
                {"$set": {
                    "suggestions": [s.model_dump() for s in suggestions],
                    "equipment_type_ids": sorted(eq_ids),
                    "failure_mode_ids": sorted(fm_ids),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }},
                upsert=True,
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

@router.post("/failure-modes", response_model=SuggestFailureModesResponse)
async def suggest_failure_modes(request: SuggestFailureModesRequest):
    """Get deterministic AI-powered suggestions for mapping failure modes to equipment types."""
    
    # Process ALL equipment types at once (no batching)
    equipment_type_ids = request.equipment_type_ids
    
    equipment_types = []
    for eq_id in equipment_type_ids:
        eq_type = next((t for t in EQUIPMENT_TYPES if t["id"] == eq_id), None)
        if eq_type:
            equipment_types.append(eq_type)
    
    if not equipment_types:
        raise HTTPException(status_code=400, detail="No valid equipment types provided")
    
    failure_modes = request.existing_failure_modes[:150]  # Increased limit
    suggestions = await get_ai_suggestions(equipment_types, failure_modes)
    total = sum(len(s.suggested_failure_modes) for s in suggestions)
    
    return SuggestFailureModesResponse(
        suggestions=suggestions,
        total_suggestions=total
    )


@router.post("/clear-cache")
async def clear_suggestion_cache():
    """Clear both in-memory and Mongo-persisted suggestion cache."""
    global _suggestion_cache
    mem_count = len(_suggestion_cache)
    _suggestion_cache = {}
    try:
        result = await db[_CACHE_COLLECTION].delete_many({})
        mongo_count = result.deleted_count
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


EQUIPMENT_TYPE_MAPPING_SYSTEM_PROMPT = """You are an industrial reliability engineer. Your task is to map equipment instances (nodes from a plant hierarchy) to the correct equipment type from an ISO 14224-aligned catalog.

STRICT RULES:

1. NAME MATCHING (primary):
   - Use the node's name, tag and description to infer the equipment kind.
   - Examples: "P-101 Feed Pump" → Centrifugal Pump. "V-201 Knock-Out Drum" → Pressure Vessel. "E-301 Heat Exchanger" → Heat Exchanger.
   - Ignore plant codes, numbering, or unit prefixes (P-101, V-201, etc.) and focus on the descriptive words.

2. DISCIPLINE COHERENCE:
   - Rotating: pumps, compressors, fans, blowers, gearboxes, motors, turbines.
   - Static: vessels, columns/towers, drums, heat exchangers, reactors, boilers, tanks.
   - Piping: valves, piping, strainers, filters.
   - Electrical: transformers, switchgear, cables, motors (electrical view), UPS.
   - Instrumentation: transmitters, gauges, analyzers, sensors.

3. CONFIDENCE SCORING (be conservative):
   - 0.90-0.95: Exact match (the node's name unambiguously names this equipment type).
   - 0.80-0.89: Strong match (clear keywords + correct discipline).
   - 0.70-0.79: Reasonable match (related family).
   - Below 0.70: Do not return a best_match; set it to null.

4. OUTPUT REQUIREMENTS:
   - For each node: pick at most ONE best_match. Optionally include up to 2 alternatives, each with their own confidence and reasoning.
   - Use EXACT equipment_type IDs from the catalog. Never invent IDs.
   - If nothing reasonable matches (confidence < 0.70 for all), return best_match: null and alternatives: [].

Return ONLY valid JSON. No prose outside JSON."""


def get_mapping_cache_key(nodes: List[EquipmentNodeInput], et_ids: List[str]) -> str:
    """Cache key includes node descriptors so renames bust the cache."""
    node_keys = sorted([f"{n.id}|{n.name}|{n.level or ''}|{n.tag or ''}" for n in nodes])
    type_keys = sorted(et_ids)
    return hashlib.md5(f"ETMAP:{node_keys}:{type_keys}".encode()).hexdigest()


async def get_equipment_type_mapping_suggestions(
    nodes: List[EquipmentNodeInput],
    equipment_types: List[EquipmentTypeOption],
) -> List[NodeMappingSuggestion]:
    """Use OpenAI to suggest equipment_type_id per equipment node, with persistent cache."""
    et_ids = [et.id for et in equipment_types]
    cache_key = get_mapping_cache_key(nodes, et_ids)

    if cache_key in _suggestion_cache:
        logger.info(f"Returning in-memory cached equipment-type mappings: {cache_key[:8]}")
        return _suggestion_cache[cache_key]

    try:
        cached_doc = await db[_CACHE_COLLECTION].find_one({"_id": cache_key})
        if cached_doc and "mapping_suggestions" in cached_doc:
            suggestions = [NodeMappingSuggestion(**s) for s in cached_doc["mapping_suggestions"]]
            _suggestion_cache[cache_key] = suggestions
            logger.info(f"Returning Mongo-cached equipment-type mappings: {cache_key[:8]}")
            return suggestions
    except Exception as e:
        logger.warning(f"Mapping cache lookup failed (non-fatal): {e}")

    client = get_openai_client()

    et_list = [{"id": et.id, "name": et.name, "discipline": et.discipline or ""} for et in equipment_types]
    node_list = [
        {
            "id": n.id,
            "name": n.name,
            "level": n.level or "",
            "tag": n.tag or "",
            "description": (n.description or "")[:200],
            "parent": n.parent_name or "",
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
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": EQUIPMENT_TYPE_MAPPING_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0,
            max_tokens=4000,
            seed=42,
            response_format={"type": "json_object"},
        )

        result = json.loads(response.choices[0].message.content.strip())

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
            await db[_CACHE_COLLECTION].update_one(
                {"_id": cache_key},
                {"$set": {
                    "mapping_suggestions": [s.model_dump() for s in suggestions],
                    "kind": "equipment_type_mapping",
                    "node_ids": sorted([n.id for n in nodes]),
                    "equipment_type_ids": sorted(et_ids),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }},
                upsert=True,
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
async def suggest_equipment_type_mappings(request: SuggestEquipmentTypeMappingsRequest):
    """Get deterministic AI-powered equipment_type suggestions for equipment nodes."""
    if not request.nodes:
        raise HTTPException(status_code=400, detail="No equipment nodes provided")
    if not request.equipment_types:
        raise HTTPException(status_code=400, detail="No equipment types provided")

    # Cap to avoid runaway prompts. The frontend should batch if needed.
    nodes = request.nodes[:80]
    types = request.equipment_types[:300]

    suggestions = await get_equipment_type_mapping_suggestions(nodes, types)
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


NEW_EQUIPMENT_TYPE_SYSTEM_PROMPT = """You are an industrial reliability engineer building an ISO 14224-aligned equipment type catalog.

The user has provided:
1. A list of EXISTING equipment types already in the catalog.
2. A list of equipment instances (nodes) from their plant hierarchy.

Your task: identify recurring equipment KINDS in the node list that are NOT well-represented by the existing catalog, and propose NEW equipment types to add.

STRICT RULES:

1. DO NOT propose anything that is already covered by an existing type. Read the existing list carefully.
2. Group node instances by their underlying equipment kind. Ignore plant codes, tag numbers and unit prefixes (e.g. P-101, V-201, 1F-3001).
3. Only propose a new equipment type when at least 2 nodes (or 1 clearly distinct unfamiliar item) point to the same kind.
4. Each suggestion must have:
   - `suggested_id`: lowercase snake_case identifier, max 40 chars, unique, not present in existing IDs (e.g. "screw_motor_reductor").
   - `suggested_name`: human-readable Title Case name (e.g. "Screw Motor Reductor").
   - `discipline`: ONE of exactly: Rotating, Static, Piping, Electrical, Instrumentation, Civil, Operations, Laboratory.
   - `rationale`: 1 short sentence explaining what the equipment is and why it is missing.
   - `example_node_ids`: up to 5 node IDs that motivated this suggestion (use exact IDs from input).
   - `example_node_names`: matching names for those IDs.
   - `node_count`: total number of nodes you found that map to this new type.
5. Be CONSERVATIVE. Better to return fewer high-quality suggestions than many noisy ones. Return at most 15 suggestions, sorted by node_count descending.
6. Skip nodes whose names are too generic to classify ("Unit", "System", "Component", numeric-only).

Return ONLY valid JSON. No prose outside JSON."""


def get_new_types_cache_key(nodes: List[EquipmentNodeInput], et_ids: List[str]) -> str:
    """Cache key based on node descriptors + existing type IDs."""
    node_keys = sorted([f"{n.id}|{n.name}|{n.level or ''}" for n in nodes])
    type_keys = sorted(et_ids)
    return hashlib.md5(f"NEWTYPES:{node_keys}:{type_keys}".encode()).hexdigest()


async def get_new_equipment_type_suggestions(
    nodes: List[EquipmentNodeInput],
    existing_types: List[EquipmentTypeOption],
) -> List[NewEquipmentTypeSuggestion]:
    """Use OpenAI to propose new equipment types based on hierarchy nodes."""
    et_ids = [et.id for et in existing_types]
    cache_key = get_new_types_cache_key(nodes, et_ids)

    if cache_key in _suggestion_cache:
        logger.info(f"Returning in-memory cached new-type suggestions: {cache_key[:8]}")
        return _suggestion_cache[cache_key]

    try:
        cached_doc = await db[_CACHE_COLLECTION].find_one({"_id": cache_key})
        if cached_doc and "new_type_suggestions" in cached_doc:
            suggestions = [NewEquipmentTypeSuggestion(**s) for s in cached_doc["new_type_suggestions"]]
            _suggestion_cache[cache_key] = suggestions
            logger.info(f"Returning Mongo-cached new-type suggestions: {cache_key[:8]}")
            return suggestions
    except Exception as e:
        logger.warning(f"New-types cache lookup failed (non-fatal): {e}")

    client = get_openai_client()

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
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": NEW_EQUIPMENT_TYPE_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0,
            max_tokens=4000,
            seed=42,
            response_format={"type": "json_object"},
        )

        result = json.loads(response.choices[0].message.content.strip())

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
            await db[_CACHE_COLLECTION].update_one(
                {"_id": cache_key},
                {"$set": {
                    "new_type_suggestions": [s.model_dump() for s in suggestions],
                    "kind": "new_equipment_types",
                    "node_ids": sorted([n.id for n in nodes]),
                    "existing_type_ids": sorted(et_ids),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }},
                upsert=True,
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
async def suggest_new_equipment_types(request: SuggestNewEquipmentTypesRequest):
    """Get AI-suggested NEW equipment types based on the user's plant hierarchy."""
    if not request.nodes:
        raise HTTPException(status_code=400, detail="No equipment nodes provided")

    nodes = request.nodes[:200]  # accept more nodes since this is a discovery task
    existing = request.existing_equipment_types[:400]

    suggestions = await get_new_equipment_type_suggestions(nodes, existing)
    return SuggestNewEquipmentTypesResponse(
        suggestions=suggestions,
        total=len(suggestions),
    )
