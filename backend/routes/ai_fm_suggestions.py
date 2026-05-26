"""
AI-powered failure mode suggestions for equipment types.
Uses OpenAI GPT-4o with deterministic settings for consistent output.
"""

import os
import json
import hashlib
import logging
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from openai import AsyncOpenAI

from dotenv import load_dotenv
load_dotenv()

from iso14224_models import EQUIPMENT_TYPES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai-suggestions", tags=["AI Suggestions"])

# Simple cache for deterministic results
_suggestion_cache: Dict[str, Any] = {}

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
    """Use OpenAI GPT-4o with deterministic settings."""
    
    # Check cache first
    eq_ids = [eq.get("id") for eq in equipment_types]
    fm_ids = [fm.get("id") for fm in failure_modes]
    cache_key = get_cache_key(eq_ids, fm_ids)
    
    if cache_key in _suggestion_cache:
        logger.info(f"Returning cached suggestions for key: {cache_key[:8]}")
        return _suggestion_cache[cache_key]
    
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
            for fm in item.get("suggested_failure_modes", []):
                fm_id = fm.get("failure_mode_id")
                # Validate ID exists
                if any(f["id"] == fm_id for f in fm_list):
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
        
        # Cache the result
        _suggestion_cache[cache_key] = suggestions
        
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
    
    equipment_type_ids = request.equipment_type_ids[:5]
    
    equipment_types = []
    for eq_id in equipment_type_ids:
        eq_type = next((t for t in EQUIPMENT_TYPES if t["id"] == eq_id), None)
        if eq_type:
            equipment_types.append(eq_type)
    
    if not equipment_types:
        raise HTTPException(status_code=400, detail="No valid equipment types provided")
    
    failure_modes = request.existing_failure_modes[:100]
    suggestions = await get_ai_suggestions(equipment_types, failure_modes)
    total = sum(len(s.suggested_failure_modes) for s in suggestions)
    
    return SuggestFailureModesResponse(
        suggestions=suggestions,
        total_suggestions=total
    )


@router.post("/clear-cache")
async def clear_suggestion_cache():
    """Clear the suggestion cache to force fresh AI results."""
    global _suggestion_cache
    count = len(_suggestion_cache)
    _suggestion_cache = {}
    return {"message": f"Cleared {count} cached suggestions"}


@router.get("/equipment-types-without-fm")
async def get_equipment_types_without_failure_modes():
    """Get list of all equipment types."""
    return {
        "equipment_types": [
            {"id": t["id"], "name": t["name"], "discipline": t.get("discipline", "")}
            for t in EQUIPMENT_TYPES
        ]
    }
