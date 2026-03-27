"""
Image Analysis API Routes for Damage Detection
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from auth import get_current_user
from services.image_analysis_service import analyze_image_for_damage, analyze_multiple_images

router = APIRouter(prefix="/image-analysis", tags=["Image Analysis"])


class ImageAnalysisRequest(BaseModel):
    """Request model for single image analysis."""
    image_base64: str = Field(..., description="Base64 encoded image (with or without data URI prefix)")
    context: Optional[str] = Field(None, description="Context about what's being inspected")
    equipment_type: Optional[str] = Field(None, description="Type of equipment for more specific analysis")


class MultiImageAnalysisRequest(BaseModel):
    """Request model for multiple image analysis."""
    images: List[str] = Field(..., description="List of base64 encoded images")
    context: Optional[str] = Field(None, description="Context about what's being inspected")
    equipment_type: Optional[str] = Field(None, description="Type of equipment for more specific analysis")


class Finding(BaseModel):
    """Individual damage finding."""
    type: str
    location: Optional[str] = None
    description: str
    severity: str
    image_index: Optional[int] = None


class ImageAnalysisResponse(BaseModel):
    """Response model for image analysis."""
    damage_detected: bool
    confidence: str
    severity: str
    findings: List[Finding]
    overall_assessment: str
    recommended_actions: List[str]
    requires_immediate_attention: bool
    error: Optional[str] = None
    images_analyzed: Optional[int] = None


@router.post("/analyze", response_model=ImageAnalysisResponse)
async def analyze_image(
    request: ImageAnalysisRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Analyze a single image for damage detection.
    
    Uses AI vision to detect:
    - Corrosion (rust, oxidation, pitting)
    - Mechanical damage (cracks, dents, deformation)
    - Wear patterns (abrasion, erosion)
    - Leaks or fluid stains
    - Discoloration or burn marks
    - Misalignment or loose components
    """
    if not request.image_base64:
        raise HTTPException(status_code=400, detail="Image data is required")
    
    # Check if image is too small (likely invalid)
    clean_base64 = request.image_base64
    if "base64," in clean_base64:
        clean_base64 = clean_base64.split("base64,")[1]
    
    if len(clean_base64) < 100:
        raise HTTPException(status_code=400, detail="Image data appears to be invalid or too small")
    
    result = await analyze_image_for_damage(
        image_base64=request.image_base64,
        context=request.context,
        equipment_type=request.equipment_type
    )
    
    # Convert findings to proper format
    findings = []
    for f in result.get("findings", []):
        findings.append(Finding(
            type=f.get("type", "unknown"),
            location=f.get("location"),
            description=f.get("description", ""),
            severity=f.get("severity", "unknown"),
            image_index=f.get("image_index")
        ))
    
    return ImageAnalysisResponse(
        damage_detected=result.get("damage_detected", False),
        confidence=result.get("confidence", "medium"),
        severity=result.get("severity", "none"),
        findings=findings,
        overall_assessment=result.get("overall_assessment", ""),
        recommended_actions=result.get("recommended_actions", []),
        requires_immediate_attention=result.get("requires_immediate_attention", False),
        error=result.get("error")
    )


@router.post("/analyze-multiple", response_model=ImageAnalysisResponse)
async def analyze_multiple_images_endpoint(
    request: MultiImageAnalysisRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Analyze multiple images for damage detection.
    Results are aggregated across all images.
    """
    if not request.images or len(request.images) == 0:
        raise HTTPException(status_code=400, detail="At least one image is required")
    
    if len(request.images) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 images allowed per request")
    
    result = await analyze_multiple_images(
        images=request.images,
        context=request.context,
        equipment_type=request.equipment_type
    )
    
    # Convert findings to proper format
    findings = []
    for f in result.get("findings", []):
        findings.append(Finding(
            type=f.get("type", "unknown"),
            location=f.get("location"),
            description=f.get("description", ""),
            severity=f.get("severity", "unknown"),
            image_index=f.get("image_index")
        ))
    
    return ImageAnalysisResponse(
        damage_detected=result.get("damage_detected", False),
        confidence=result.get("confidence", "medium"),
        severity=result.get("severity", "none"),
        findings=findings,
        overall_assessment=result.get("overall_assessment", ""),
        recommended_actions=result.get("recommended_actions", []),
        requires_immediate_attention=result.get("requires_immediate_attention", False),
        error=result.get("error"),
        images_analyzed=result.get("images_analyzed")
    )


@router.get("/health")
async def health_check():
    """Check if image analysis service is properly configured."""
    import os
    from dotenv import load_dotenv
    load_dotenv()
    
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    
    return {
        "status": "healthy" if api_key else "unhealthy",
        "api_key_configured": bool(api_key),
        "service": "image-analysis"
    }
