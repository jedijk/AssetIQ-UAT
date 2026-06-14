"""Chat routes — single source of truth state machine."""
from typing import Optional

from fastapi import APIRouter, Depends, File, Form

from auth import require_permission
from models.api_models import (
    ChatMessageCreate,
    ChatResponse,
    VoiceTranscriptionResponse,
)
from services import chat_routes_service as svc

# Re-exports for unit tests and patch targets
from services.chat_routes_service import (  # noqa: F401
    _core_chat_process,
    _read_conv,
    _threat_to_response,
)

router = APIRouter(tags=["Chat"])

_tasks_read = require_permission("tasks:read")


@router.post("/chat/send", response_model=ChatResponse)
async def send_chat_message(
    message: ChatMessageCreate,
    current_user: dict = Depends(_tasks_read),
):
    return await svc.send_chat_message(current_user, message)


@router.get("/chat/history")
async def get_chat_history(
    limit: int = 50,
    current_user: dict = Depends(_tasks_read),
):
    return await svc.get_chat_history(current_user, limit=limit)


@router.delete("/chat/clear")
async def clear_chat_history(
    current_user: dict = Depends(require_permission("tasks:read")),
):
    return await svc.clear_chat_history(current_user)


@router.post("/chat/cancel")
async def cancel_chat_flow(
    current_user: dict = Depends(require_permission("tasks:read")),
):
    return await svc.cancel_chat_flow(current_user)


@router.post("/voice/transcribe", response_model=VoiceTranscriptionResponse)
async def transcribe_voice(
    audio_base64: str = Form(...),
    current_user: dict = Depends(require_permission("tasks:read")),
):
    return await svc.transcribe_voice(current_user, audio_base64)


@router.post("/chat/voice-send")
async def voice_send(
    audio: bytes = File(...),
    language: Optional[str] = Form(None),
    transcribe_only: Optional[str] = Form(None),
    current_user: dict = Depends(require_permission("tasks:read")),
):
    return await svc.voice_send(
        current_user,
        audio,
        language=language,
        transcribe_only=transcribe_only,
    )
