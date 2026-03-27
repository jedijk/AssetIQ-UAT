"""
Feedback routes for user feedback submission and review.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import Optional
import uuid

from auth import get_current_user
from models.feedback_models import (
    FeedbackCreate,
    FeedbackUpdate,
    FeedbackResponse,
    FeedbackListResponse,
)
from services.feedback_service import (
    create_feedback,
    get_user_feedback,
    get_feedback_by_id,
    get_all_feedback,
    update_feedback_status,
    delete_feedback,
)
from storage import put_object, MIME_TYPES

router = APIRouter(prefix="/feedback", tags=["Feedback"])


@router.post("", response_model=FeedbackResponse)
async def submit_feedback(
    feedback: FeedbackCreate,
    current_user: dict = Depends(get_current_user)
):
    """Submit new feedback."""
    result = await create_feedback(
        user_id=current_user["id"],
        feedback_type=feedback.type,
        message=feedback.message,
        severity=feedback.severity,
        screenshot_url=feedback.screenshot_url,
        module=feedback.module,
    )
    result["user_name"] = current_user.get("name")
    return result


@router.post("/upload-screenshot")
async def upload_screenshot(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a screenshot for feedback. Returns the URL to use when submitting feedback."""
    # Validate file type
    ext = file.filename.split(".")[-1].lower() if file.filename else "png"
    if ext not in ["jpg", "jpeg", "png", "gif", "webp"]:
        raise HTTPException(status_code=400, detail="Invalid image type. Allowed: jpg, jpeg, png, gif, webp")
    
    content_type = MIME_TYPES.get(ext, "image/png")
    file_content = await file.read()
    
    # Generate unique path
    file_id = str(uuid.uuid4())
    path = f"feedback/screenshots/{current_user['id']}/{file_id}.{ext}"
    
    result = put_object(path, file_content, content_type)
    return {"url": result.get("url", path), "path": path}


@router.get("/my", response_model=FeedbackListResponse)
async def get_my_feedback(current_user: dict = Depends(get_current_user)):
    """Get all feedback submitted by the current user."""
    items = await get_user_feedback(current_user["id"])
    # Enrich with user name
    for item in items:
        item["user_name"] = current_user.get("name")
    return {"items": items, "total": len(items)}


@router.get("/{feedback_id}", response_model=FeedbackResponse)
async def get_feedback_detail(
    feedback_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get details of a specific feedback item (user can only see their own)."""
    item = await get_feedback_by_id(feedback_id, user_id=current_user["id"])
    if not item:
        raise HTTPException(status_code=404, detail="Feedback not found")
    item["user_name"] = current_user.get("name")
    return item


# ===== Admin Endpoints =====

@router.get("/admin/all", response_model=FeedbackListResponse)
async def admin_get_all_feedback(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Admin: Get all feedback, optionally filtered by status."""
    # Check admin role (simple check - extend as needed)
    if current_user.get("role") not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    items = await get_all_feedback(status_filter=status)
    return {"items": items, "total": len(items)}


@router.put("/admin/{feedback_id}", response_model=FeedbackResponse)
async def admin_update_feedback(
    feedback_id: str,
    update: FeedbackUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Admin: Update feedback status or add a response."""
    if current_user.get("role") not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await update_feedback_status(
        feedback_id=feedback_id,
        status=update.status,
        user_visible_response=update.user_visible_response,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return result


@router.delete("/admin/{feedback_id}")
async def admin_delete_feedback(
    feedback_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Admin: Delete a feedback item."""
    if current_user.get("role") not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    success = await delete_feedback(feedback_id)
    if not success:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return {"status": "deleted", "id": feedback_id}
