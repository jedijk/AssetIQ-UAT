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

SYSTEM_PROMPT = """You are an expert industrial reliability engineer specializing in FMEA (Failure Mode and Effects Analysis) and ISO 14224 standards for the oil & gas, petrochemical, and process industries.

Your task is to analyze equipment types and suggest which failure modes should be associated with them based on:
1. Technical knowledge of how equipment fails
2. Industry standards (ISO 14224, API standards)
3. Common failure mechanisms for each equipment category
4. The equipment's function, operating conditions, and criticality

IMPORTANT RULES:
- Only suggest failure modes that are technically relevant to the equipment type
- Consider the equipment's discipline (Rotating, Static, Piping, Electrical, Instrumentation, etc.)
- Provide confidence scores based on how certain the mapping is
- Give clear technical reasoning for each suggestion
- Be thorough but avoid false positives - quality over quantity

You must respond ONLY with valid JSON in the exact format specified. No markdown, no explanations outside JSON."""

async def get_ai_suggestions(
    equipment_types: List[Dict[str, Any]],
    failure_modes: List[Dict[str, Any]]
) -> List[EquipmentTypeSuggestions]:
    """Use OpenAI GPT-4o to suggest failure mode mappings for equipment types."""
    
    client = get_openai_client()
    
    # Prepare failure modes summary for the prompt
    fm_summary = []
    for fm in failure_modes:
        fm_summary.append({
            "id": fm.get("id"),
            "name": fm.get("failure_mode"),
            "category": fm.get("category"),
            "keywords": fm.get("keywords", [])[:5],  # Limit keywords
            "rpn": fm.get("severity", 5) * fm.get("occurrence", 5) * fm.get("detectability", 5),
            "existing_equipment_types": fm.get("equipment_type_ids", [])
        })
    
    # Prepare equipment types for the prompt
    eq_summary = []
    for eq in equipment_types:
        eq_summary.append({
            "id": eq.get("id"),
            "name": eq.get("name"),
            "discipline": eq.get("discipline"),
            "category": eq.get("category"),
            "description": eq.get("description", "")[:200]  # Limit description
        })
    
    user_prompt = f"""Analyze the following equipment types and suggest which failure modes should be mapped to each.

EQUIPMENT TYPES TO ANALYZE:
{json.dumps(eq_summary, indent=2)}

AVAILABLE FAILURE MODES:
{json.dumps(fm_summary, indent=2)}

For each equipment type, suggest the most relevant failure modes from the available list.

Respond with JSON in this exact format:
{{
    "suggestions": [
        {{
            "equipment_type_id": "equipment_id",
            "equipment_type_name": "Equipment Name",
            "discipline": "Discipline",
            "ai_reasoning": "Brief explanation of the overall mapping strategy for this equipment",
            "suggested_failure_modes": [
                {{
                    "failure_mode_id": "fm_id",
                    "failure_mode_name": "Failure Mode Name",
                    "category": "Category",
                    "confidence": 0.95,
                    "reasoning": "Technical explanation why this failure mode applies to this equipment",
                    "rpn": 125
                }}
            ]
        }}
    ]
}}

Only include failure modes with confidence >= 0.6. Order by confidence descending."""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=4000
        )
        
        response_text = response.choices[0].message.content.strip()
        
        # Clean the response - remove markdown code blocks if present
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
        response_text = response_text.strip()
        
        result = json.loads(response_text)
        
        suggestions = []
        for item in result.get("suggestions", []):
            fm_suggestions = []
            for fm in item.get("suggested_failure_modes", []):
                fm_suggestions.append(FailureModeSuggestion(
                    failure_mode_id=fm.get("failure_mode_id"),
                    failure_mode_name=fm.get("failure_mode_name"),
                    category=fm.get("category", ""),
                    confidence=fm.get("confidence", 0.7),
                    reasoning=fm.get("reasoning", ""),
                    rpn=fm.get("rpn")
                ))
            
            suggestions.append(EquipmentTypeSuggestions(
                equipment_type_id=item.get("equipment_type_id"),
                equipment_type_name=item.get("equipment_type_name"),
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
    
    - Takes a list of equipment type IDs to analyze (max 5 at a time for performance)
    - Takes the full list of available failure modes
    - Returns suggested mappings with confidence scores and reasoning
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
    
    # Limit failure modes to most relevant ones (max 100 for context)
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
    """
    Get list of equipment types that have no failure modes mapped.
    This helps identify equipment types that need AI suggestions.
    """
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
