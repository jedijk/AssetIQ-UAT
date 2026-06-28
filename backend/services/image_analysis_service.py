"""
Image Analysis Service for Damage Detection
Uses GPT Vision via the universal ``execute_grounded`` pipeline.
"""
import logging
import os
from typing import Optional, Dict, Any

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Kept for prompt registry bootstrap (vision.damage_analysis)
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

_DEFAULT_ERROR = {
    "damage_detected": False,
    "confidence": "low",
    "severity": "none",
    "findings": [],
    "overall_assessment": "Analysis failed",
    "recommended_actions": [],
    "requires_immediate_attention": False,
}


def _normalize_damage_result(parsed: Dict[str, Any], grounded: Dict[str, Any]) -> Dict[str, Any]:
    result = dict(parsed or {})
    result.setdefault("damage_detected", False)
    result.setdefault("confidence", "medium")
    result.setdefault("severity", "none")
    result.setdefault("findings", [])
    result.setdefault("overall_assessment", grounded.get("summary") or "Analysis complete")
    result.setdefault("recommended_actions", grounded.get("suggested_actions") or [])
    result.setdefault("requires_immediate_attention", False)
    for key in (
        "execution_id",
        "ai_model",
        "prompt_version",
        "prompt_id",
        "citations",
        "evidence_not_available",
    ):
        if key in grounded:
            result[key] = grounded[key]
    return result


async def analyze_image_for_damage(
    image_base64: Optional[str] = None,
    *,
    file_id: Optional[str] = None,
    context: Optional[str] = None,
    equipment_type: Optional[str] = None,
    equipment_id: Optional[str] = None,
    user: Optional[dict] = None,
    user_id: str = "system",
    company_id: str = "default",
) -> Dict[str, Any]:
    """
    Analyze an image for damage detection.

    Prefers ``file_id`` from secure upload (``status=available``) when provided;
    falls back to inline ``image_base64`` for backward compatibility.
    """
    if not image_base64 and not file_id:
        return {
            **_DEFAULT_ERROR,
            "overall_assessment": "Image data is required",
            "error": "image_base64 or file_id is required",
        }

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        logger.error("OPENAI_API_KEY not found in environment")
        return {
            **_DEFAULT_ERROR,
            "overall_assessment": "Analysis failed - API key not configured",
            "error": "API configuration error",
        }

    actor = user or {"id": user_id, "company_id": company_id}

    analysis_prompt = "Analyze this equipment image for any damage, wear, corrosion, or defects."
    if context:
        analysis_prompt += f"\n\nContext: {context}"
    if equipment_type:
        analysis_prompt += f"\nEquipment type: {equipment_type}"

    try:
        from services.ai_execute_grounded import execute_grounded

        grounded = await execute_grounded(
            user=actor,
            intent="damage_analysis",
            query=analysis_prompt,
            feature="image_analysis.analyze_damage",
            equipment_id=equipment_id,
            prompt_id="vision.damage_analysis",
            endpoint="image_analysis.analyze_damage",
            model="gpt-4o",
            temperature=0.3,
            max_tokens=1200,
            image_base64=image_base64,
            file_id=file_id,
        )
        parsed = grounded.get("parsed") if isinstance(grounded.get("parsed"), dict) else {}
        if not parsed:
            from services.ai_output_validation import parse_json_from_llm
            import re

            content = grounded.get("summary") or ""
            json_match = re.search(r"\{[\s\S]*\}", content)
            parsed = parse_json_from_llm(json_match.group() if json_match else content)

        result = _normalize_damage_result(parsed, grounded)
        logger.info(
            "Image analysis complete: damage_detected=%s, severity=%s",
            result["damage_detected"],
            result["severity"],
        )
        return result

    except Exception as e:
        logger.error("Image analysis error: %s", e)
        return {
            **_DEFAULT_ERROR,
            "overall_assessment": f"Analysis failed: {str(e)}",
            "error": str(e),
        }


async def analyze_multiple_images(
    images: list,
    context: Optional[str] = None,
    equipment_type: Optional[str] = None,
    user: Optional[dict] = None,
) -> Dict[str, Any]:
    """Analyze multiple images and aggregate results."""
    all_findings = []
    any_damage = False
    requires_attention = False
    max_severity = "none"
    severity_order = ["none", "minor", "moderate", "severe", "critical"]

    first_actions: list = []
    for idx, image in enumerate(images):
        result = await analyze_image_for_damage(
            image_base64=image,
            context=f"{context} (Image {idx + 1})" if context else f"Image {idx + 1}",
            equipment_type=equipment_type,
            user=user,
        )

        if result.get("damage_detected"):
            any_damage = True

        if result.get("requires_immediate_attention"):
            requires_attention = True

        result_severity = result.get("severity", "none")
        if result_severity in severity_order:
            if severity_order.index(result_severity) > severity_order.index(max_severity):
                max_severity = result_severity

        for finding in result.get("findings", []):
            finding["image_index"] = idx + 1
            all_findings.append(finding)

        if idx == 0:
            first_actions = list(result.get("recommended_actions") or [])

    return {
        "damage_detected": any_damage,
        "confidence": "high" if len(images) > 1 else "medium",
        "severity": max_severity,
        "findings": all_findings,
        "overall_assessment": (
            f"Analyzed {len(images)} images. "
            f"{'Damage detected.' if any_damage else 'No significant damage detected.'}"
        ),
        "recommended_actions": first_actions,
        "requires_immediate_attention": requires_attention,
        "images_analyzed": len(images),
    }
