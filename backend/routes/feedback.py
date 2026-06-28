"""
Feedback routes for user feedback submission and review.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import Optional
import uuid

from auth import get_current_user, require_permission, require_roles
from services.ai_gateway import chat as ai_gateway_chat, user_context
from models.feedback_models import (
    FeedbackCreate,
    FeedbackUpdate,
    FeedbackUserUpdate,
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
    update_user_feedback,
    delete_user_feedback,
    bulk_update_status,
    get_unread_feedback_count,
    mark_feedback_as_read,
    get_unread_responses_count,
    mark_responses_as_seen,
)
from services.storage_service import MIME_TYPES

router = APIRouter(prefix="/feedback", tags=["Feedback"])


@router.post("", response_model=FeedbackResponse)
async def submit_feedback(
    feedback: FeedbackCreate,
    current_user: dict = Depends(get_current_user)
):
    """Submit new feedback."""
    from services.storage_service import put_object_async
    
    audio_url = None
    
    # Handle audio data if provided
    if feedback.audio_data:
        try:
            import base64
            # Remove data URL prefix if present
            audio_data = feedback.audio_data
            if "," in audio_data:
                audio_data = audio_data.split(",")[1]
            
            audio_bytes = base64.b64decode(audio_data)
            file_id = str(uuid.uuid4())
            path = f"feedback/audio/{current_user['id']}/{file_id}.webm"
            
            result = await put_object_async(path, audio_bytes, "audio/webm")
            audio_url = result.get("url", path)
        except Exception as e:
            import logging
            logging.error(f"Error saving audio: {e}")
            # Continue without audio if it fails
    
    message = (feedback.message or "").strip()
    has_audio = bool(feedback.audio_data)
    has_screenshot = bool(feedback.screenshot_url)
    if not message and not has_audio and not has_screenshot:
        raise HTTPException(
            status_code=400,
            detail="Feedback must include a message, voice recording, or screenshot",
        )

    result = await create_feedback(
        user_id=current_user["id"],
        user_name=current_user.get("name", "Unknown"),
        feedback_type=feedback.type,
        message=message,
        severity=feedback.severity,
        screenshot_url=feedback.screenshot_url,
        module=feedback.module,
        audio_url=audio_url,
        user=current_user,
    )
    return result


@router.post("/upload-screenshot")
async def upload_screenshot(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a screenshot for feedback. Returns the URL to use when submitting feedback."""
    from services.storage_service import put_object_async
    
    # Validate file type
    ext = file.filename.split(".")[-1].lower() if file.filename else "png"
    if ext not in ["jpg", "jpeg", "png", "gif", "webp"]:
        raise HTTPException(status_code=400, detail="Invalid image type. Allowed: jpg, jpeg, png, gif, webp")
    
    content_type = MIME_TYPES.get(ext, "image/png")
    file_content = await file.read()
    
    # Generate unique path
    file_id = str(uuid.uuid4())
    path = f"feedback/screenshots/{current_user['id']}/{file_id}.{ext}"
    
    result = await put_object_async(path, file_content, content_type)
    return {"url": result.get("url", path), "path": path}


@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Transcribe audio file to text using OpenAI Whisper.
    Supports mp3, mp4, mpeg, mpga, m4a, wav, webm formats.
    Max file size: 25 MB.
    """
    import logging

    from services.ai_gateway import transcribe_audio as gateway_transcribe

    logger = logging.getLogger(__name__)

    ext = file.filename.split(".")[-1].lower() if file.filename else "webm"
    allowed_formats = ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"]
    if ext not in allowed_formats:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid audio format. Allowed: {', '.join(allowed_formats)}"
        )

    file_content = await file.read()
    if len(file_content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 25 MB.")

    user_id, company_id = user_context(current_user)
    try:
        transcribed_text = await gateway_transcribe(
            file_content,
            filename=f"audio.{ext}",
            user_id=user_id,
            company_id=company_id,
            endpoint="feedback.transcribe_audio",
        )
        return {"text": transcribed_text, "success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


@router.get("/my", response_model=FeedbackListResponse)
async def get_my_feedback(current_user: dict = Depends(get_current_user)):
    """Get all feedback submitted by the current user."""
    items = await get_user_feedback(current_user["id"], user=current_user)
    # Enrich with user name
    for item in items:
        item["user_name"] = current_user.get("name")
    return {"items": items, "total": len(items)}


@router.post("/bulk-status")
async def bulk_update_feedback_status(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Bulk update status for multiple feedback items (user can only update their own)."""
    feedback_ids = data.get("feedback_ids", [])
    status = data.get("status")
    
    if not feedback_ids:
        raise HTTPException(status_code=400, detail="No feedback IDs provided")
    
    if not status:
        raise HTTPException(status_code=400, detail="Status is required")
    
    valid_statuses = ["new", "in_review", "resolved", "planned", "wont_fix", "implemented", "parked", "rejected"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    result = await bulk_update_status(feedback_ids, status, current_user["id"], user=current_user)
    return result


# ===== User Response Notification Endpoints =====

@router.get("/my/unread-responses-count")
async def get_my_unread_responses_count(
    current_user: dict = Depends(get_current_user)
):
    """Get count of feedback responses not yet seen by the user."""
    count = await get_unread_responses_count(current_user["id"], user=current_user)
    return {"unread_count": count}


@router.post("/my/mark-responses-seen")
async def mark_my_responses_seen(
    current_user: dict = Depends(get_current_user)
):
    """Mark all feedback responses as seen by the user."""
    count = await mark_responses_as_seen(current_user["id"], user=current_user)
    return {"marked_count": count}


# ===== Admin Endpoints =====

@router.get("/admin/unread-count")
async def admin_get_unread_count(
    current_user: dict = Depends(get_current_user)
):
    """Admin: Get count of unread feedback items."""
    if current_user.get("role") not in ["admin", "manager", "owner"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    count = await get_unread_feedback_count(user=current_user)
    return {"unread_count": count}


@router.post("/admin/mark-read")
async def admin_mark_all_read(
    current_user: dict = Depends(require_permission("settings:write"))
):
    """Admin: Mark all feedback as read."""
    if current_user.get("role") not in ["admin", "manager", "owner"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    count = await mark_feedback_as_read(user=current_user)
    return {"marked_count": count}


@router.get("/admin/all", response_model=FeedbackListResponse)
async def admin_get_all_feedback(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Admin: Get all feedback, optionally filtered by status."""
    # Check admin role (simple check - extend as needed)
    if current_user.get("role") not in ["admin", "manager", "owner"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Mark feedback as read when owner views all feedback
    await mark_feedback_as_read(user=current_user)
    
    items = await get_all_feedback(status_filter=status, user=current_user)
    return {"items": items, "total": len(items)}


@router.put("/admin/{feedback_id}", response_model=FeedbackResponse)
async def admin_update_feedback(
    feedback_id: str,
    update: FeedbackUpdate,
    current_user: dict = Depends(require_permission("settings:write"))
):
    """Admin: Update feedback status or add a response."""
    if current_user.get("role") not in ["admin", "manager", "owner"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await update_feedback_status(
        feedback_id=feedback_id,
        status=update.status,
        user_visible_response=update.user_visible_response,
        user=current_user,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return result


@router.delete("/admin/{feedback_id}")
async def admin_delete_feedback(
    feedback_id: str,
    current_user: dict = Depends(require_permission("settings:write"))
):
    """Admin: Delete a feedback item."""
    if current_user.get("role") not in ["admin", "manager", "owner"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    success = await delete_feedback(feedback_id, user=current_user)
    if not success:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return {"status": "deleted", "id": feedback_id}


@router.post("/generate-prompt")
async def generate_ai_prompt(
    data: dict,
    current_user: dict = Depends(require_permission("settings:write"))
):
    """Generate an AI prompt from selected feedback items."""
    feedback_ids = data.get("feedback_ids", [])
    if not feedback_ids:
        raise HTTPException(status_code=400, detail="No feedback items selected")
    
    # Fetch selected feedback items
    feedback_items = []
    for fid in feedback_ids:
        item = await get_feedback_by_id(fid, user=current_user)
        if item:
            feedback_items.append(item)
    
    if not feedback_items:
        raise HTTPException(status_code=404, detail="No feedback items found")
    
    # Build context from feedback items
    feedback_context = []
    for item in feedback_items:
        item_text = f"- Type: {item.get('type', 'general').upper()}"
        if item.get('severity'):
            item_text += f" | Severity: {item['severity'].upper()}"
        item_text += f"\n  Message: {item.get('message', '')}"
        feedback_context.append(item_text)
    
    combined_feedback = "\n\n".join(feedback_context)
    
    try:
        from services.ai_execute_grounded import execute_grounded, overlay_grounded_contract

        user_message = f"""Based on the following user feedback items, generate a prompt for an AI coding agent:

{combined_feedback}

Generate a clear, actionable prompt that can be directly used with an AI development agent."""

        grounded = await execute_grounded(
            user=current_user,
            intent="generate_agent_prompt",
            query=user_message,
            feature="feedback.generate_prompt",
            prompt_id="feedback.generate_agent_prompt",
            endpoint="feedback.generate_prompt",
            model="gpt-4o",
            temperature=0.5,
            use_registry_prompt=True,
        )

        return overlay_grounded_contract(
            {
                "prompt": grounded.get("summary") or grounded.get("recommendation") or "",
                "feedback_count": len(feedback_items),
            },
            grounded,
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate prompt: {str(e)}")


# Parameterized user routes — keep after all static /admin/* and /my/* paths.
@router.get("/{feedback_id}", response_model=FeedbackResponse)
async def get_feedback_detail(
    feedback_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get details of a specific feedback item (user can only see their own)."""
    item = await get_feedback_by_id(feedback_id, user_id=current_user["id"], user=current_user)
    if not item:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return item


@router.put("/{feedback_id}", response_model=FeedbackResponse)
async def update_my_feedback(
    feedback_id: str,
    update: FeedbackUserUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update user's own feedback (message, type, severity, status)."""
    result = await update_user_feedback(
        feedback_id=feedback_id,
        user_id=current_user["id"],
        message=update.message,
        feedback_type=update.type,
        severity=update.severity,
        screenshot_url=update.screenshot_url,
        status=update.status,
        user=current_user,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Feedback not found or not owned by user")
    return result


@router.delete("/{feedback_id}")
async def delete_my_feedback(
    feedback_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete user's own feedback."""
    success = await delete_user_feedback(feedback_id, current_user["id"], user=current_user)
    if not success:
        raise HTTPException(status_code=404, detail="Feedback not found or not owned by user")
    return {"status": "deleted", "id": feedback_id}
