"""Standard API response envelopes for high-traffic routes."""
from __future__ import annotations

from typing import Any, Generic, Optional, TypeVar, Dict

from pydantic import BaseModel, Field

T = TypeVar("T")


class ApiErrorDetail(BaseModel):
    code: str = Field(..., description="Machine-readable error code")
    message: str = Field(..., description="Human-readable error message")
    field: Optional[str] = None


class ApiResponse(BaseModel, Generic[T]):
    success: bool = True
    data: Optional[T] = None
    error: Optional[ApiErrorDetail] = None


class ReliabilityProfileResponse(BaseModel):
    success: bool = True
    profile: Dict[str, Any]


class ReliabilityStateResponse(BaseModel):
    success: bool = True
    state: Dict[str, Any]


def error_response(code: str, message: str, *, field: Optional[str] = None) -> dict:
    """Build a consistent error envelope for route handlers."""
    return ApiResponse(
        success=False,
        error=ApiErrorDetail(code=code, message=message, field=field),
    ).model_dump()
