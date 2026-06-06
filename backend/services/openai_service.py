"""
Central OpenAI API integration.

All chat, vision, and Whisper calls should go through this module so token
usage is recorded consistently for the AI Usage dashboard and cost guard.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from io import BytesIO
from typing import Any, Dict, List, Optional

from openai import OpenAI

logger = logging.getLogger(__name__)

# Maps legacy model names from the app to current OpenAI model ids.
MODEL_MAPPING = {
    "gpt-5.2": "gpt-4o",
    "gpt-4o-mini": "gpt-4o-mini",
    "gpt-4o": "gpt-4o",
    "gpt-4-turbo": "gpt-4-turbo",
    "gpt-3.5-turbo": "gpt-3.5-turbo",
    "whisper-1": "whisper-1",
}


@dataclass(frozen=True)
class UsageContext:
    """Who triggered the call and where to attribute usage."""

    user_id: str = "system"
    company_id: str = "default"
    feature: Optional[str] = None
    installation_id: Optional[str] = None
    installation_name: Optional[str] = None
    endpoint: str = "openai_service"


def get_openai_client() -> OpenAI:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not configured in environment")
    return OpenAI(api_key=api_key)


def get_model_name(requested_model: str) -> str:
    return MODEL_MAPPING.get(requested_model, "gpt-4o")


def _resolve_api_key(explicit_key: Optional[str] = None) -> str:
    key = explicit_key or os.environ.get("OPENAI_API_KEY") or os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise ValueError("OPENAI_API_KEY not configured in environment")
    return key


def _record_chat_usage(response: Any, *, model: str, usage: UsageContext) -> None:
    """Write chat/vision token counts to the cost guard and MongoDB."""
    token_usage = getattr(response, "usage", None)
    if not token_usage:
        return

    from services.ai_cost_guard import record_ai_tokens

    record_ai_tokens(
        user_id=usage.user_id,
        company_id=usage.company_id,
        endpoint=usage.endpoint,
        prompt_tokens=getattr(token_usage, "prompt_tokens", 0) or 0,
        completion_tokens=getattr(token_usage, "completion_tokens", 0) or 0,
        model=model,
        feature=usage.feature or usage.endpoint,
        installation_id=usage.installation_id,
        installation_name=usage.installation_name,
    )


def _record_whisper_usage(transcript: str, *, usage: UsageContext) -> None:
    """Whisper responses do not include token usage; estimate from transcript length."""
    from services.ai_cost_guard import record_ai_tokens

    estimated_output_tokens = max(1, len(transcript or "") // 4)
    record_ai_tokens(
        user_id=usage.user_id,
        company_id=usage.company_id,
        endpoint=usage.endpoint,
        prompt_tokens=0,
        completion_tokens=estimated_output_tokens,
        model="whisper-1",
        feature=usage.feature or "voice_transcription",
        installation_id=usage.installation_id,
        installation_name=usage.installation_name,
    )


def _build_chat_kwargs(
    *,
    model: str,
    messages: List[Dict[str, Any]],
    temperature: float,
    max_tokens: Optional[int],
    response_format: Optional[Dict],
) -> Dict[str, Any]:
    kwargs: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    if max_tokens:
        kwargs["max_tokens"] = max_tokens
    if response_format:
        kwargs["response_format"] = response_format
    return kwargs


def _usage_context_from_kwargs(
    *,
    user_id: str,
    company_id: str,
    feature: Optional[str],
    installation_id: Optional[str],
    installation_name: Optional[str],
    endpoint: str,
) -> UsageContext:
    return UsageContext(
        user_id=user_id or "system",
        company_id=company_id or "default",
        feature=feature or endpoint,
        installation_id=installation_id,
        installation_name=installation_name,
        endpoint=endpoint,
    )


# Backwards-compatible alias used by tests.
_record_openai_usage = _record_chat_usage


async def chat_completion(
    messages: List[Dict[str, Any]],
    model: str = "gpt-4o",
    temperature: float = 0.7,
    max_tokens: Optional[int] = None,
    response_format: Optional[Dict] = None,
    api_key: Optional[str] = None,
    user_id: str = "system",
    company_id: str = "default",
    feature: Optional[str] = None,
    installation_id: Optional[str] = None,
    installation_name: Optional[str] = None,
    endpoint: str = "openai_service.chat_completion",
) -> str:
    """Send a chat completion request and return the assistant message text."""
    try:
        client = OpenAI(api_key=_resolve_api_key(api_key))
        resolved_model = get_model_name(model)
        usage = _usage_context_from_kwargs(
            user_id=user_id,
            company_id=company_id,
            feature=feature,
            installation_id=installation_id,
            installation_name=installation_name,
            endpoint=endpoint,
        )

        response = client.chat.completions.create(
            **_build_chat_kwargs(
                model=resolved_model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                response_format=response_format,
            )
        )
        _record_chat_usage(response, model=resolved_model, usage=usage)
        return response.choices[0].message.content
    except Exception as exc:
        logger.error("OpenAI chat completion error: %s", exc)
        raise


async def chat_completion_with_images(
    text_prompt: str,
    image_urls: List[str] = None,
    image_base64_list: List[Dict[str, str]] = None,
    model: str = "gpt-4o",
    temperature: float = 0.7,
    max_tokens: Optional[int] = None,
    user_id: str = "system",
    company_id: str = "default",
    feature: Optional[str] = None,
    installation_id: Optional[str] = None,
    installation_name: Optional[str] = None,
    endpoint: str = "openai_service.chat_completion_with_images",
) -> str:
    """Send a vision request (images + text) and return the assistant message text."""
    try:
        client = get_openai_client()
        resolved_model = get_model_name(model)
        usage = _usage_context_from_kwargs(
            user_id=user_id,
            company_id=company_id,
            feature=feature,
            installation_id=installation_id,
            installation_name=installation_name,
            endpoint=endpoint,
        )

        message_content: List[Dict[str, Any]] = []

        for url in image_urls or []:
            message_content.append({"type": "image_url", "image_url": {"url": url}})

        for image in image_base64_list or []:
            media_type = image.get("media_type", "image/jpeg")
            data = image.get("data", "")
            message_content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{media_type};base64,{data}"},
                }
            )

        message_content.append({"type": "text", "text": text_prompt})

        response = client.chat.completions.create(
            **_build_chat_kwargs(
                model=resolved_model,
                messages=[{"role": "user", "content": message_content}],
                temperature=temperature,
                max_tokens=max_tokens,
                response_format=None,
            )
        )
        _record_chat_usage(response, model=resolved_model, usage=usage)
        return response.choices[0].message.content
    except Exception as exc:
        logger.error("OpenAI vision completion error: %s", exc)
        raise


def _transcribe_with_whisper(
    audio_data: bytes,
    filename: str,
    language: Optional[str],
    usage: UsageContext,
) -> str:
    client = get_openai_client()
    audio_file = BytesIO(audio_data)
    audio_file.name = filename

    request_kwargs: Dict[str, Any] = {"model": "whisper-1", "file": audio_file}
    if language:
        request_kwargs["language"] = language

    transcript = client.audio.transcriptions.create(**request_kwargs).text
    _record_whisper_usage(transcript, usage=usage)
    return transcript


async def transcribe_audio(
    audio_data: bytes,
    filename: str = "audio.webm",
    language: Optional[str] = None,
    user_id: str = "system",
    company_id: str = "default",
    installation_id: Optional[str] = None,
    installation_name: Optional[str] = None,
) -> str:
    """Async-friendly wrapper; Whisper SDK call is synchronous."""
    usage = _usage_context_from_kwargs(
        user_id=user_id,
        company_id=company_id,
        feature="voice_transcription",
        installation_id=installation_id,
        installation_name=installation_name,
        endpoint="openai_service.transcribe_audio",
    )
    try:
        return _transcribe_with_whisper(audio_data, filename, language, usage)
    except Exception as exc:
        logger.error("OpenAI Whisper transcription error: %s", exc)
        raise


def transcribe_audio_sync(
    audio_data: bytes,
    filename: str = "audio.webm",
    language: Optional[str] = None,
    user_id: str = "system",
    company_id: str = "default",
    installation_id: Optional[str] = None,
    installation_name: Optional[str] = None,
) -> str:
    """Synchronous Whisper transcription for non-async callers."""
    usage = _usage_context_from_kwargs(
        user_id=user_id,
        company_id=company_id,
        feature="voice_transcription",
        installation_id=installation_id,
        installation_name=installation_name,
        endpoint="openai_service.transcribe_audio_sync",
    )
    try:
        return _transcribe_with_whisper(audio_data, filename, language, usage)
    except Exception as exc:
        logger.error("OpenAI Whisper transcription error: %s", exc)
        raise


class OpenAIChat:
    """
    Fluent wrapper matching the legacy LlmChat interface for gradual migration.
    """

    def __init__(self, api_key: str = None, user_id: str = "system", company_id: str = "default"):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        self.model = "gpt-4o"
        self.temperature = 0.7
        self.max_tokens: Optional[int] = None
        self.messages: List[Dict[str, Any]] = []
        self.user_id = user_id
        self.company_id = company_id

    def with_model(self, provider: str, model: str) -> "OpenAIChat":
        self.model = get_model_name(model)
        return self

    def with_params(self, temperature: float = None, max_tokens: int = None) -> "OpenAIChat":
        if temperature is not None:
            self.temperature = temperature
        if max_tokens is not None:
            self.max_tokens = max_tokens
        return self

    def with_system_prompt(self, prompt: str) -> "OpenAIChat":
        self.messages = [{"role": "system", "content": prompt}]
        return self

    def _send_messages(self, messages: List[Dict[str, Any]], *, endpoint: str, feature: str) -> str:
        client = OpenAI(api_key=self.api_key)
        usage = UsageContext(
            user_id=self.user_id,
            company_id=self.company_id,
            feature=feature,
            endpoint=endpoint,
        )
        response = client.chat.completions.create(
            **_build_chat_kwargs(
                model=self.model,
                messages=messages,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                response_format=None,
            )
        )
        _record_chat_usage(response, model=self.model, usage=usage)
        return response.choices[0].message.content

    def chat(self, user_message: str) -> str:
        messages = [*self.messages, {"role": "user", "content": user_message}]
        try:
            return self._send_messages(
                messages,
                endpoint="openai_service.OpenAIChat.chat",
                feature="openai_chat",
            )
        except Exception as exc:
            logger.error("OpenAI chat error: %s", exc)
            raise

    def chat_with_images(self, text: str, images: List[Dict] = None) -> str:
        content: List[Dict[str, Any]] = []

        for image in images or []:
            if "url" in image:
                content.append({"type": "image_url", "image_url": {"url": image["url"]}})
            elif "base64" in image:
                media_type = image.get("media_type", "image/jpeg")
                content.append(
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{media_type};base64,{image['base64']}"},
                    }
                )

        content.append({"type": "text", "text": text})
        messages = [*self.messages, {"role": "user", "content": content}]

        try:
            return self._send_messages(
                messages,
                endpoint="openai_service.OpenAIChat.chat_with_images",
                feature="openai_vision_chat",
            )
        except Exception as exc:
            logger.error("OpenAI vision chat error: %s", exc)
            raise
