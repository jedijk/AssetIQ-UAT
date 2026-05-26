"""
AI-powered failure mode suggestions for equipment types.
Uses OpenAI GPT-4o to intelligently map failure modes to equipment types.
"""

import os
import json
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from openai import AsyncOpenAI

from dotenv import load_dotenv
load_dotenv()

from iso14224_models import EQUIPMENT_TYPES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai-suggestions", tags=["AI Suggestions"])

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
    confidence: float  # 0.0 - 1.0
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

SYSTEM_PROMPT = """You are an expert industrial reliability engineer with 20+ years of experience in FMEA (Failure Mode and Effects Analysis) and ISO 14224 standards for oil & gas, petrochemical, and process industries.

Your task: Map failure modes to equipment types based on technical relevance.

SCORING CRITERIA FOR CONFIDENCE:
- 0.95-1.0: Direct, well-known failure mode for this exact equipment type (e.g., "Bearing Failure" for "Centrifugal Pump")
- 0.85-0.94: Highly relevant failure mode common in this equipment category (e.g., "Seal Leakage" for pumps)
- 0.75-0.84: Relevant failure mode that can occur in this equipment type
- 0.65-0.74: Possible failure mode with some technical relevance
- Below 0.65: Do not include

DISCIPLINE MATCHING RULES:
- Rotating equipment: bearing failures, vibration, imbalance, seal issues, lubrication
- Static equipment: corrosion, erosion, fatigue, cracking, fouling
- Piping/Valves: leakage, blockage, erosion, corrosion, actuator failures
- Electrical: insulation breakdown, overheating, contact failures, motor issues
- Instrumentation: calibration drift, signal loss, sensor failures, communication errors

IMPORTANT:
- Use ONLY the failure_mode_id values provided in the input
- Match by technical relevance, not just keyword matching
- Each equipment type should have 3-8 relevant failure modes
- Provide specific technical reasoning for each suggestion

OUTPUT FORMAT: Return ONLY valid JSON, no markdown code blocks."""


async def get_ai_suggestions(
    equipment_types: List[Dict[str, Any]],
    failure_modes: List[Dict[str, Any]]
) -> List[EquipmentTypeSuggestions]:
    """Use OpenAI GPT-4o to suggest failure mode mappings for equipment types."""
    
    client = get_openai_client()
    
    # Prepare failure modes in a cleaner format
    fm_list = []
    for fm in failure_modes:
        fm_list.append({
            "id": fm.get("id"),
            "name": fm.get("failure_mode"),
            "category": fm.get("category"),
            "keywords": fm.get("keywords", [])[:3],
            "rpn": fm.get("severity", 5) * fm.get("occurrence", 5) * fm.get("detectability", 5)
        })
    
    # Prepare equipment types
    eq_list = []
    for eq in equipment_types:
        eq_list.append({
            "id": eq.get("id"),
            "name": eq.get("name"),
            "discipline": eq.get("discipline"),
            "category": eq.get("category")
        })
    
    # Build a structured prompt
    user_prompt = f"""TASK: For each equipment type below, select the most technically relevant failure modes from the provided list.

EQUIPMENT TYPES TO ANALYZE:
{json.dumps(eq_list, indent=2)}

AVAILABLE FAILURE MODES (use these exact IDs):
{json.dumps(fm_list, indent=2)}

Return JSON in this exact structure:
{{
  "suggestions": [
    {{
      "equipment_type_id": "<exact id from equipment list>",
      "equipment_type_name": "<name>",
      "discipline": "<discipline>",
      "ai_reasoning": "<1-2 sentence explanation of mapping strategy>",
      "suggested_failure_modes": [
        {{
          "failure_mode_id": "<exact id from failure modes list>",
          "failure_mode_name": "<name>",
          "category": "<category>",
          "confidence": <0.65-1.0>,
          "reasoning": "<specific technical reason why this failure applies>",
          "rpn": <rpn value>
        }}
      ]
    }}
  ]
}}

Rules:
1. Use EXACT IDs from the provided lists
2. Include 3-8 failure modes per equipment type
3. Only include if confidence >= 0.65
4. Sort by confidence descending"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.1,  # Very low temperature for consistent output
            max_tokens=4000,
            response_format={"type": "json_object"}  # Force JSON output
        )
        
        response_text = response.choices[0].message.content.strip()
        
        # Parse JSON response
        result = json.loads(response_text)
        
        suggestions = []
        for item in result.get("suggestions", []):
            fm_suggestions = []
            for fm in item.get("suggested_failure_modes", []):
                # Validate that the failure_mode_id exists in our list
                fm_id = fm.get("failure_mode_id")
                if any(f["id"] == fm_id for f in fm_list):
                    fm_suggestions.append(FailureModeSuggestion(
                        failure_mode_id=fm_id,
                        failure_mode_name=fm.get("failure_mode_name", ""),
                        category=fm.get("category", ""),
                        confidence=min(1.0, max(0.0, fm.get("confidence", 0.7))),
                        reasoning=fm.get("reasoning", ""),
                        rpn=fm.get("rpn")
                    ))
            
            if fm_suggestions:  # Only add if there are valid suggestions
                suggestions.append(EquipmentTypeSuggestions(
                    equipment_type_id=item.get("equipment_type_id"),
                    equipment_type_name=item.get("equipment_type_name", ""),
                    discipline=item.get("discipline", ""),
                    suggested_failure_modes=fm_suggestions,
                    ai_reasoning=item.get("ai_reasoning", "")
                ))
        
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
    """
    Get AI-powered suggestions for mapping failure modes to equipment types.
    """
    
    # Limit to 5 equipment types at a time for performance
    equipment_type_ids = request.equipment_type_ids[:5]
    
    # Get equipment type details from the master list
    equipment_types = []
    for eq_id in equipment_type_ids:
        eq_type = next((t for t in EQUIPMENT_TYPES if t["id"] == eq_id), None)
        if eq_type:
            equipment_types.append(eq_type)
    
    if not equipment_types:
        raise HTTPException(status_code=400, detail="No valid equipment types provided")
    
    # Limit failure modes (max 100 for context)
    failure_modes = request.existing_failure_modes[:100]
    
    # Get AI suggestions
    suggestions = await get_ai_suggestions(equipment_types, failure_modes)
    
    total = sum(len(s.suggested_failure_modes) for s in suggestions)
    
    return SuggestFailureModesResponse(
        suggestions=suggestions,
        total_suggestions=total
    )


@router.get("/equipment-types-without-fm")
async def get_equipment_types_without_failure_modes():
    """Get list of all equipment types."""
    return {
        "equipment_types": [
            {
                "id": t["id"],
                "name": t["name"],
                "discipline": t.get("discipline", ""),
                "category": t.get("category", "")
            }
            for t in EQUIPMENT_TYPES
        ]
    }
