"""
OpenAI Service - Centralized OpenAI API integration
Replaces emergentintegrations with direct OpenAI SDK calls
"""
import os
import logging
import base64
from typing import Optional, List, Dict, Any
from openai import OpenAI

logger = logging.getLogger(__name__)

# Initialize OpenAI client
def get_openai_client() -> OpenAI:
    """Get OpenAI client with API key from environment."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not configured in environment")
    return OpenAI(api_key=api_key)


# Model mapping - map old model names to current OpenAI models
MODEL_MAPPING = {
    "gpt-5.2": "gpt-4o",  # Map to latest GPT-4o
    "gpt-4o-mini": "gpt-4o-mini",
    "gpt-4o": "gpt-4o",
    "gpt-4-turbo": "gpt-4-turbo",
    "gpt-3.5-turbo": "gpt-3.5-turbo",
    "whisper-1": "whisper-1",
}


def get_model_name(requested_model: str) -> str:
    """Map requested model to actual OpenAI model name."""
    return MODEL_MAPPING.get(requested_model, "gpt-4o")


async def chat_completion(
    messages: List[Dict[str, Any]],
    model: str = "gpt-4o",
    temperature: float = 0.7,
    max_tokens: Optional[int] = None,
    response_format: Optional[Dict] = None,
) -> str:
    """
    Send a chat completion request to OpenAI.
    
    Args:
        messages: List of message dicts with 'role' and 'content'
        model: Model name (will be mapped to actual OpenAI model)
        temperature: Sampling temperature
        max_tokens: Maximum tokens in response
        response_format: Optional response format (e.g., {"type": "json_object"})
    
    Returns:
        The assistant's response text
    """
    try:
        client = get_openai_client()
        actual_model = get_model_name(model)
        
        kwargs = {
            "model": actual_model,
            "messages": messages,
            "temperature": temperature,
        }
        
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
            
        if response_format:
            kwargs["response_format"] = response_format
        
        response = client.chat.completions.create(**kwargs)
        return response.choices[0].message.content
        
    except Exception as e:
        logger.error(f"OpenAI chat completion error: {str(e)}")
        raise


async def chat_completion_with_images(
    text_prompt: str,
    image_urls: List[str] = None,
    image_base64_list: List[Dict[str, str]] = None,
    model: str = "gpt-4o",
    temperature: float = 0.7,
    max_tokens: Optional[int] = None,
) -> str:
    """
    Send a chat completion request with images to OpenAI.
    
    Args:
        text_prompt: The text prompt
        image_urls: List of image URLs
        image_base64_list: List of dicts with 'data' (base64) and 'media_type'
        model: Model name
        temperature: Sampling temperature
        max_tokens: Maximum tokens in response
    
    Returns:
        The assistant's response text
    """
    try:
        client = get_openai_client()
        actual_model = get_model_name(model)
        
        # Build content array
        content = []
        
        # Add images first
        if image_urls:
            for url in image_urls:
                content.append({
                    "type": "image_url",
                    "image_url": {"url": url}
                })
        
        if image_base64_list:
            for img in image_base64_list:
                data = img.get("data", "")
                media_type = img.get("media_type", "image/jpeg")
                content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{media_type};base64,{data}"
                    }
                })
        
        # Add text prompt
        content.append({
            "type": "text",
            "text": text_prompt
        })
        
        kwargs = {
            "model": actual_model,
            "messages": [{"role": "user", "content": content}],
            "temperature": temperature,
        }
        
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
        
        response = client.chat.completions.create(**kwargs)
        return response.choices[0].message.content
        
    except Exception as e:
        logger.error(f"OpenAI vision completion error: {str(e)}")
        raise


async def transcribe_audio(
    audio_data: bytes,
    filename: str = "audio.webm",
    language: Optional[str] = None,
) -> str:
    """
    Transcribe audio using OpenAI Whisper.
    
    Args:
        audio_data: Raw audio bytes
        filename: Filename with extension for format detection
        language: Optional language code (e.g., 'en', 'nl')
    
    Returns:
        Transcribed text
    """
    try:
        client = get_openai_client()
        
        # Create a file-like object for the API
        from io import BytesIO
        audio_file = BytesIO(audio_data)
        audio_file.name = filename
        
        kwargs = {
            "model": "whisper-1",
            "file": audio_file,
        }
        
        if language:
            kwargs["language"] = language
        
        response = client.audio.transcriptions.create(**kwargs)
        return response.text
        
    except Exception as e:
        logger.error(f"OpenAI Whisper transcription error: {str(e)}")
        raise


def transcribe_audio_sync(
    audio_data: bytes,
    filename: str = "audio.webm",
    language: Optional[str] = None,
) -> str:
    """
    Synchronous version of transcribe_audio for use in sync contexts.
    """
    try:
        client = get_openai_client()
        
        from io import BytesIO
        audio_file = BytesIO(audio_data)
        audio_file.name = filename
        
        kwargs = {
            "model": "whisper-1",
            "file": audio_file,
        }
        
        if language:
            kwargs["language"] = language
        
        response = client.audio.transcriptions.create(**kwargs)
        return response.text
        
    except Exception as e:
        logger.error(f"OpenAI Whisper transcription error: {str(e)}")
        raise


# Helper class to mimic the old LlmChat interface for easier migration
class OpenAIChat:
    """
    A wrapper class that provides a similar interface to the old emergentintegrations LlmChat.
    This makes migration easier by maintaining similar method signatures.
    """
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        self.model = "gpt-4o"
        self.temperature = 0.7
        self.max_tokens = None
        self.messages = []
        
    def with_model(self, provider: str, model: str) -> "OpenAIChat":
        """Set the model to use."""
        self.model = get_model_name(model)
        return self
    
    def with_params(self, temperature: float = None, max_tokens: int = None) -> "OpenAIChat":
        """Set generation parameters."""
        if temperature is not None:
            self.temperature = temperature
        if max_tokens is not None:
            self.max_tokens = max_tokens
        return self
    
    def with_system_prompt(self, prompt: str) -> "OpenAIChat":
        """Add a system prompt."""
        self.messages = [{"role": "system", "content": prompt}]
        return self
    
    def chat(self, user_message: str) -> str:
        """Send a chat message and get a response."""
        try:
            client = OpenAI(api_key=self.api_key)
            
            messages = self.messages.copy()
            messages.append({"role": "user", "content": user_message})
            
            kwargs = {
                "model": self.model,
                "messages": messages,
                "temperature": self.temperature,
            }
            
            if self.max_tokens:
                kwargs["max_tokens"] = self.max_tokens
            
            response = client.chat.completions.create(**kwargs)
            return response.choices[0].message.content
            
        except Exception as e:
            logger.error(f"OpenAI chat error: {str(e)}")
            raise
    
    def chat_with_images(self, text: str, images: List[Dict] = None) -> str:
        """Send a chat message with images."""
        try:
            client = OpenAI(api_key=self.api_key)
            
            content = []
            
            # Add images
            if images:
                for img in images:
                    if "url" in img:
                        content.append({
                            "type": "image_url",
                            "image_url": {"url": img["url"]}
                        })
                    elif "base64" in img:
                        media_type = img.get("media_type", "image/jpeg")
                        content.append({
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{media_type};base64,{img['base64']}"
                            }
                        })
            
            # Add text
            content.append({"type": "text", "text": text})
            
            messages = self.messages.copy()
            messages.append({"role": "user", "content": content})
            
            kwargs = {
                "model": self.model,
                "messages": messages,
                "temperature": self.temperature,
            }
            
            if self.max_tokens:
                kwargs["max_tokens"] = self.max_tokens
            
            response = client.chat.completions.create(**kwargs)
            return response.choices[0].message.content
            
        except Exception as e:
            logger.error(f"OpenAI vision chat error: {str(e)}")
            raise
