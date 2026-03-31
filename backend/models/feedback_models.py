"""
Pydantic models for the User Feedback system.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime


class FeedbackCreate(BaseModel):
    """Request model for creating feedback."""
    type: Literal["issue", "improvement", "general"]
    message: str = Field(default="", min_length=0)  # Allow empty message if audio is provided
    severity: Optional[Literal["low", "medium", "high", "critical"]] = None
    screenshot_url: Optional[str] = None
    module: Optional[str] = None  # Auto-captured from frontend context
    has_audio: Optional[bool] = False
    audio_data: Optional[str] = None  # Base64 encoded audio data


class FeedbackUpdate(BaseModel):
    """Request model for admin to update feedback status/response."""
    status: Optional[Literal["new", "in_review", "resolved", "planned", "wont_fix"]] = None
    user_visible_response: Optional[str] = None


class FeedbackUserUpdate(BaseModel):
    """Request model for user to update their own feedback."""
    type: Optional[Literal["issue", "improvement", "general"]] = None
    message: Optional[str] = None
    severity: Optional[Literal["low", "medium", "high", "critical"]] = None
    screenshot_url: Optional[str] = None
    status: Optional[Literal["new", "resolved", "implemented", "parked", "rejected"]] = None


class FeedbackResponse(BaseModel):
    """Response model for feedback items."""
    id: str
    type: str
    message: str
    status: str
    timestamp: str
    screenshot_url: Optional[str] = None
    severity: Optional[str] = None
    user_visible_response: Optional[str] = None
    module: Optional[str] = None
    user_id: str
    user_name: Optional[str] = None
    updated_at: Optional[str] = None
    audio_url: Optional[str] = None  # URL to audio file if voice message was recorded


class FeedbackListResponse(BaseModel):
    """Response model for list of feedback items."""
    items: List[FeedbackResponse]
    total: int
