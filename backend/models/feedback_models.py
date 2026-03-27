"""
Pydantic models for the User Feedback system.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime


class FeedbackCreate(BaseModel):
    """Request model for creating feedback."""
    type: Literal["issue", "improvement", "general"]
    message: str = Field(..., min_length=1)
    severity: Optional[Literal["low", "medium", "high", "critical"]] = None
    screenshot_url: Optional[str] = None
    module: Optional[str] = None  # Auto-captured from frontend context


class FeedbackUpdate(BaseModel):
    """Request model for admin to update feedback status/response."""
    status: Optional[Literal["new", "in_review", "resolved", "planned", "wont_fix"]] = None
    user_visible_response: Optional[str] = None


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


class FeedbackListResponse(BaseModel):
    """Response model for list of feedback items."""
    items: List[FeedbackResponse]
    total: int
