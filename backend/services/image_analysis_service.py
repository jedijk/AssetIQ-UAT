"""
Image Analysis Service for Damage Detection
Uses OpenAI GPT Vision to analyze equipment photos for damage, wear, corrosion, and defects.
"""
import os
import logging
import json
import base64
import re
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

logger = logging.getLogger(__name__)

# System prompt for damage detection analysis
DAMAGE_ANALYSIS_PROMPT = """You are an expert industrial equipment inspector specializing in visual damage assessment. 
Analyze the provided image and identify any damage, wear, corrosion, defects, or anomalies.

Provide your analysis in the following JSON format only (no other text):
{
    "damage_detected": true/false,
    "confidence": "high"/"medium"/"low",
    "severity": "none"/"minor"/"moderate"/"severe"/"critical",
    "findings": [
        {
            "type": "damage type (e.g., corrosion, crack, wear, dent, leak, discoloration, misalignment)",
            "location": "where in the image/equipment",
            "description": "brief description of the finding",
            "severity": "minor/moderate/severe/critical"
        }
    ],
    "overall_assessment": "brief overall assessment of equipment condition",
    "recommended_actions": ["list of recommended actions"],
    "requires_immediate_attention": true/false
}

If you cannot analyze the image (e.g., it's not equipment-related, too blurry, or irrelevant), respond with:
{
    "damage_detected": false,
    "confidence": "low",
    "severity": "none",
    "findings": [],
    "overall_assessment": "Unable to analyze - [reason]",
    "recommended_actions": [],
    "requires_immediate_attention": false,
    "error": "reason for inability to analyze"
}

Focus on:
- Corrosion (rust, oxidation, pitting)
- Mechanical damage (cracks, dents, deformation)
- Wear patterns (abrasion, erosion)
- Leaks or fluid stains
- Discoloration or burn marks
- Misalignment or loose components
- Missing or damaged parts
- Surface degradation
"""


async def analyze_image_for_damage(
    image_base64: str,
    context: Optional[str] = None,
    equipment_type: Optional[str] = None
) -> Dict[str, Any]:
    """
    Analyze an image for damage detection.
    
    Args:
        image_base64: Base64 encoded image (with or without data URI prefix)
        context: Optional context about what's being inspected
        equipment_type: Optional equipment type for more specific analysis
        
    Returns:
        Dictionary with analysis results
    """
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        logger.error("EMERGENT_LLM_KEY not found in environment")
        return {
            "damage_detected": False,
            "confidence": "low",
            "severity": "none",
            "findings": [],
            "overall_assessment": "Analysis failed - API key not configured",
            "recommended_actions": [],
            "requires_immediate_attention": False,
            "error": "API configuration error"
        }
    
    try:
        # Clean base64 string - remove data URI prefix if present
        if "base64," in image_base64:
            image_base64 = image_base64.split("base64,")[1]
        
        # Validate base64
        try:
            base64.b64decode(image_base64)
        except Exception:
            return {
                "damage_detected": False,
                "confidence": "low",
                "severity": "none",
                "findings": [],
                "overall_assessment": "Invalid image data provided",
                "recommended_actions": [],
                "requires_immediate_attention": False,
                "error": "Invalid base64 image data"
            }
        
        # Build analysis prompt
        analysis_prompt = "Analyze this equipment image for any damage, wear, corrosion, or defects."
        if context:
            analysis_prompt += f"\n\nContext: {context}"
        if equipment_type:
            analysis_prompt += f"\nEquipment type: {equipment_type}"
        
        # Create image content
        image_content = ImageContent(image_base64=image_base64)
        
        # Initialize LLM chat
        chat = LlmChat(
            api_key=api_key,
            session_id=f"damage-analysis-{id(image_base64)}",
            system_message=DAMAGE_ANALYSIS_PROMPT
        ).with_model("openai", "gpt-5.2")
        
        # Create message with image
        user_message = UserMessage(
            text=analysis_prompt,
            file_contents=[image_content]
        )
        
        # Get response
        response = await chat.send_message(user_message)
        
        # Parse JSON response
        try:
            # Try to extract JSON from the response
            json_match = re.search(r'\{[\s\S]*\}', response)
            if json_match:
                result = json.loads(json_match.group())
            else:
                result = json.loads(response)
            
            # Ensure all required fields are present
            result.setdefault("damage_detected", False)
            result.setdefault("confidence", "medium")
            result.setdefault("severity", "none")
            result.setdefault("findings", [])
            result.setdefault("overall_assessment", "Analysis complete")
            result.setdefault("recommended_actions", [])
            result.setdefault("requires_immediate_attention", False)
            
            logger.info(f"Image analysis complete: damage_detected={result['damage_detected']}, severity={result['severity']}")
            return result
            
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse JSON response: {e}")
            # Return a structured response based on text analysis
            return {
                "damage_detected": "damage" in response.lower() or "defect" in response.lower(),
                "confidence": "medium",
                "severity": "unknown",
                "findings": [],
                "overall_assessment": response[:500] if len(response) > 500 else response,
                "recommended_actions": [],
                "requires_immediate_attention": "immediate" in response.lower() or "urgent" in response.lower(),
                "raw_response": response
            }
            
    except Exception as e:
        logger.error(f"Image analysis error: {str(e)}")
        return {
            "damage_detected": False,
            "confidence": "low",
            "severity": "none",
            "findings": [],
            "overall_assessment": f"Analysis failed: {str(e)}",
            "recommended_actions": [],
            "requires_immediate_attention": False,
            "error": str(e)
        }


async def analyze_multiple_images(
    images: list,
    context: Optional[str] = None,
    equipment_type: Optional[str] = None
) -> Dict[str, Any]:
    """
    Analyze multiple images and aggregate results.
    
    Args:
        images: List of base64 encoded images
        context: Optional context
        equipment_type: Optional equipment type
        
    Returns:
        Aggregated analysis results
    """
    all_findings = []
    any_damage = False
    requires_attention = False
    max_severity = "none"
    severity_order = ["none", "minor", "moderate", "severe", "critical"]
    
    for idx, image in enumerate(images):
        result = await analyze_image_for_damage(
            image_base64=image,
            context=f"{context} (Image {idx + 1})" if context else f"Image {idx + 1}",
            equipment_type=equipment_type
        )
        
        if result.get("damage_detected"):
            any_damage = True
            
        if result.get("requires_immediate_attention"):
            requires_attention = True
            
        # Track max severity
        result_severity = result.get("severity", "none")
        if result_severity in severity_order:
            if severity_order.index(result_severity) > severity_order.index(max_severity):
                max_severity = result_severity
        
        # Add findings with image index
        for finding in result.get("findings", []):
            finding["image_index"] = idx + 1
            all_findings.append(finding)
    
    return {
        "damage_detected": any_damage,
        "confidence": "high" if len(images) > 1 else "medium",
        "severity": max_severity,
        "findings": all_findings,
        "overall_assessment": f"Analyzed {len(images)} images. {'Damage detected.' if any_damage else 'No significant damage detected.'}",
        "recommended_actions": list(set([
            action 
            for result in [await analyze_image_for_damage(img, context, equipment_type) for img in images[:1]]  # Limit to first image for actions
            for action in result.get("recommended_actions", [])
        ])),
        "requires_immediate_attention": requires_attention,
        "images_analyzed": len(images)
    }
