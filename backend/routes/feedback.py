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
from services.storage_service import put_object, MIME_TYPES

router = APIRouter(prefix="/feedback", tags=["Feedback"])


@router.post("", response_model=FeedbackResponse)
async def submit_feedback(
    feedback: FeedbackCreate,
    current_user: dict = Depends(get_current_user)
):
    """Submit new feedback."""
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
            
            result = put_object(path, audio_bytes, "audio/webm")
            audio_url = result.get("url", path)
        except Exception as e:
            import logging
            logging.error(f"Error saving audio: {e}")
            # Continue without audio if it fails
    
    result = await create_feedback(
        user_id=current_user["id"],
        user_name=current_user.get("name", "Unknown"),
        feedback_type=feedback.type,
        message=feedback.message,
        severity=feedback.severity,
        screenshot_url=feedback.screenshot_url,
        module=feedback.module,
        audio_url=audio_url,
    )
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
    import os
    import logging
    import tempfile
    from openai import OpenAI
    
    logger = logging.getLogger(__name__)
    
    # Validate file type
    ext = file.filename.split(".")[-1].lower() if file.filename else "webm"
    allowed_formats = ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"]
    if ext not in allowed_formats:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid audio format. Allowed: {', '.join(allowed_formats)}"
        )
    
    # Read file content
    file_content = await file.read()
    
    # Check file size (25 MB limit)
    if len(file_content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 25 MB.")
    
    # Get API key
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Transcription service not configured")
    
    try:
        # Create temp file for the audio
        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as temp_file:
            temp_file.write(file_content)
            temp_path = temp_file.name
        
        try:
            # Initialize OpenAI client
            client = OpenAI(api_key=api_key)
            
            # Transcribe audio
            with open(temp_path, "rb") as audio_file:
                response = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    response_format="json"
                )
            
            # Clean up temp file
            os.unlink(temp_path)
            
            transcribed_text = response.text if hasattr(response, 'text') else str(response)
            
            return {
                "text": transcribed_text,
                "success": True
            }
        except Exception as e:
            # Clean up temp file on error
            if os.path.exists(temp_path):
                os.unlink(temp_path)
            raise e
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


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
    success = await delete_user_feedback(feedback_id, current_user["id"])
    if not success:
        raise HTTPException(status_code=404, detail="Feedback not found or not owned by user")
    return {"status": "deleted", "id": feedback_id}


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
    
    result = await bulk_update_status(feedback_ids, status, current_user["id"])
    return result


# ===== User Response Notification Endpoints =====

@router.get("/my/unread-responses-count")
async def get_my_unread_responses_count(
    current_user: dict = Depends(get_current_user)
):
    """Get count of feedback responses not yet seen by the user."""
    count = await get_unread_responses_count(current_user["id"])
    return {"unread_count": count}


@router.post("/my/mark-responses-seen")
async def mark_my_responses_seen(
    current_user: dict = Depends(get_current_user)
):
    """Mark all feedback responses as seen by the user."""
    count = await mark_responses_as_seen(current_user["id"])
    return {"marked_count": count}


# ===== Admin Endpoints =====

@router.get("/admin/unread-count")
async def admin_get_unread_count(
    current_user: dict = Depends(get_current_user)
):
    """Admin: Get count of unread feedback items."""
    if current_user.get("role") not in ["admin", "manager", "owner"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    count = await get_unread_feedback_count()
    return {"unread_count": count}


@router.post("/admin/mark-read")
async def admin_mark_all_read(
    current_user: dict = Depends(get_current_user)
):
    """Admin: Mark all feedback as read."""
    if current_user.get("role") not in ["admin", "manager", "owner"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    count = await mark_feedback_as_read()
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
    await mark_feedback_as_read()
    
    items = await get_all_feedback(status_filter=status)
    return {"items": items, "total": len(items)}


@router.put("/admin/{feedback_id}", response_model=FeedbackResponse)
async def admin_update_feedback(
    feedback_id: str,
    update: FeedbackUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Admin: Update feedback status or add a response."""
    if current_user.get("role") not in ["admin", "manager", "owner"]:
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
    if current_user.get("role") not in ["admin", "manager", "owner"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    success = await delete_feedback(feedback_id)
    if not success:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return {"status": "deleted", "id": feedback_id}


@router.post("/generate-prompt")
async def generate_ai_prompt(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Generate an AI prompt from selected feedback items."""
    import os
    import uuid
    from openai import OpenAI
    
    feedback_ids = data.get("feedback_ids", [])
    if not feedback_ids:
        raise HTTPException(status_code=400, detail="No feedback items selected")
    
    # Fetch selected feedback items
    feedback_items = []
    for fid in feedback_ids:
        item = await get_feedback_by_id(fid)
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
    
    # Get API key
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    try:
        # Generate prompt using GPT
        system_prompt = """You are an expert at converting user feedback into clear, actionable prompts for a development AI agent.
Your task is to analyze the provided feedback items and generate a single, comprehensive prompt that can be directly copied and pasted to an AI coding agent.

The prompt should:
1. Start with a clear action statement (e.g., "Fix the following issues:" or "Implement the following improvements:")
2. List each issue/request as a numbered item with clear technical requirements
3. Include any relevant context from the feedback messages
4. Be specific and actionable
5. Prioritize critical issues first, then high, medium, and low severity items
6. Use professional technical language

Keep the prompt concise but complete. Do not include any preamble or explanation - just output the ready-to-use prompt."""

        user_message = f"""Based on the following user feedback items, generate a prompt for an AI coding agent:

{combined_feedback}

Generate a clear, actionable prompt that can be directly used with an AI development agent."""

        client = OpenAI(api_key=api_key)
        
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            temperature=0.5
        )
        
        generated_prompt = response.choices[0].message.content
        
        return {
            "prompt": generated_prompt,
            "feedback_count": len(feedback_items)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate prompt: {str(e)}")
