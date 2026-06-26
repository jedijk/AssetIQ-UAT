"""Chat routes — service layer (state machine + handlers)."""
import base64
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from database import db
from models.api_models import (
    ChatMessageCreate, ChatResponse, VoiceTranscriptionResponse,
)
from ai_helpers import transcribe_audio_with_ai
from services.tenant_schema import merge_tenant_filter
from services.tenant_scope import scoped
from utils.text_language import detect_language
from services.chat_routes_processor import core_chat_process as _core_chat_process
from services.chat_routes_confirm import threat_to_response as _threat_to_response
from services.chat_routes_state import (
    read_conv as _read_conv,
    reset_conv as _reset_conv,
    store_assistant_msg as _store_assistant_msg,
)
from chat_handler_v2 import ChatState

logger = logging.getLogger(__name__)


# ===========================================================================
# Endpoints
# ===========================================================================

async def send_chat_message(
    current_user: dict,
    message: ChatMessageCreate,
):
    session_id = f"user_{current_user['id']}_{datetime.now(timezone.utc).strftime('%Y%m%d')}"
    detected_lang = message.language or detect_language(message.content)
    try:
        return await _core_chat_process(
            current_user["id"], message.content, session_id, detected_lang, 
            message.image_base64, message.ai_mode
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "chat/send failed for user %s: %s",
            current_user.get("id"),
            exc,
        )
        raise HTTPException(
            status_code=500,
            detail="Chat processing failed. Please try again.",
        ) from exc


async def get_chat_history(current_user: dict, limit: int = 50):
    messages = await db.chat_messages.find(
        scoped(current_user, {"user_id": current_user["id"]}),
        {"_id": 0},
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return list(reversed(messages))


async def clear_chat_history(current_user: dict):
    user_id = current_user["id"]
    result = await db.chat_messages.delete_many(
        merge_tenant_filter({"user_id": user_id}, current_user)
    )
    await db.chat_conversations.delete_many({"user_id": user_id})
    return {"success": True, "deleted_messages": result.deleted_count, "message": "Chat history cleared"}


async def cancel_chat_flow(current_user: dict):
    user_id = current_user["id"]
    conv = await _read_conv(user_id)
    ui_nl = conv.get("chat_ui_language") == "nl"
    await _reset_conv(user_id)
    msg = (
        "Geannuleerd. Wat wilt u melden?"
        if ui_nl
        else "Cancelled. What would you like to report?"
    )
    await _store_assistant_msg(user_id, msg, chat_state=ChatState.INITIAL)
    return {"success": True, "message": "Cancelled"}


# ===========================================================================
# Voice endpoints
# ===========================================================================

async def transcribe_voice(current_user: dict, audio_base64: str):
    text = await transcribe_audio_with_ai(
        audio_base64,
        user_id=current_user.get("id", "system"),
        company_id=current_user.get("company_id")
        or current_user.get("organization_id")
        or "default",
        installation_id=current_user.get("installation_id"),
        installation_name=current_user.get("installation"),
    )
    return VoiceTranscriptionResponse(text=text)


async def voice_send(
    current_user: dict,
    audio: bytes,
    language: Optional[str] = None,
    transcribe_only: Optional[str] = None,
):
    """Transcribe audio then optionally process as chat message.
    
    If transcribe_only=true, only transcribe and return the text without processing.
    This allows combining voice with typed text before sending.
    """
    user_id = current_user["id"]
    session_id = f"user_{user_id}_{datetime.now(timezone.utc).strftime('%Y%m%d')}"

    audio_b64 = base64.b64encode(audio).decode("utf-8")
    transcribed = await transcribe_audio_with_ai(
        audio_b64,
        user_id=user_id,
        company_id=current_user.get("company_id")
        or current_user.get("organization_id")
        or "default",
        installation_id=current_user.get("installation_id"),
        installation_name=current_user.get("installation"),
        language=language,
    )

    if not transcribed or not transcribed.strip():
        return {"message": "Could not transcribe voice - no text detected",
                "transcribed_text": "", "detected_language": None}

    detected_lang = language or detect_language(transcribed)

    # If transcribe_only, just return the transcription without processing
    if transcribe_only and transcribe_only.lower() == "true":
        return {
            "message": "Transcription complete",
            "transcribed_text": transcribed,
            "detected_language": detected_lang,
        }

    # Reuse the same core processing as text chat
    resp = await _core_chat_process(user_id, transcribed, session_id, detected_lang)

    return {
        "message": resp.message,
        "transcribed_text": transcribed,
        "detected_language": detected_lang,
        "follow_up_question": resp.follow_up_question,
        "question_type": resp.question_type,
        "equipment_suggestions": resp.equipment_suggestions,
        "failure_mode_suggestions": resp.failure_mode_suggestions,
        "show_new_failure_mode_option": resp.show_new_failure_mode_option,
        "threat": resp.threat,
        "issue_summary": resp.issue_summary,
        "issue_confirm_language": resp.issue_confirm_language,
    }
