"""Pydantic models for External Observation API and API key management."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class ExternalObservationCreate(BaseModel):
    """Payload for POST /api/v1/external/observations."""

    source_system: str = Field(..., min_length=1, max_length=128)
    external_reference: str = Field(..., min_length=1, max_length=256)
    description: str = Field(..., min_length=1, max_length=8000)
    equipment_id: Optional[str] = None
    external_equipment_id: Optional[str] = None
    equipment_tag: Optional[str] = None
    equipment_name: Optional[str] = None
    severity: Optional[str] = "medium"
    observation_type: Optional[str] = "general"
    media_urls: List[str] = []
    measured_values: List[dict] = []
    location: Optional[str] = None
    tags: List[str] = []
    metadata: Optional[Dict[str, Any]] = None
    idempotency_mode: Literal["return_existing", "conflict"] = "return_existing"


class ExternalObservationResponse(BaseModel):
    observation_id: str
    status: str
    equipment_match: Optional[Dict[str, Any]] = None
    duplicate: bool = False
    created_at: Optional[str] = None


class ExternalApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    scopes: List[str] = Field(default_factory=lambda: ["observations:create"])
    rate_limit_per_minute: int = Field(default=120, ge=1, le=10000)
    ip_allowlist: List[str] = Field(default_factory=list)
    description: Optional[str] = None


class ExternalApiKeyUpdate(BaseModel):
    name: Optional[str] = None
    scopes: Optional[List[str]] = None
    rate_limit_per_minute: Optional[int] = Field(default=None, ge=1, le=10000)
    ip_allowlist: Optional[List[str]] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None


class ExternalApiKeyRotate(BaseModel):
    grace_period_hours: int = Field(default=24, ge=0, le=168)


class ExternalApiKeyPublic(BaseModel):
    id: str
    name: str
    key_prefix: str
    scopes: List[str]
    enabled: bool
    rate_limit_per_minute: int
    ip_allowlist: List[str]
    description: Optional[str] = None
    created_at: str
    created_by: Optional[str] = None
    last_used_at: Optional[str] = None
    revoked_at: Optional[str] = None
    rotated_at: Optional[str] = None
    status: str


class ExternalApiKeyCreateResponse(ExternalApiKeyPublic):
    api_key: str


class ExternalApiKeyUsage(BaseModel):
    key_id: str
    total_requests: int = 0
    total_errors: int = 0
    observations_created: int = 0
    avg_response_ms: Optional[float] = None
    last_request_at: Optional[str] = None
    health_status: str = "unknown"
    recent_requests: List[Dict[str, Any]] = Field(default_factory=list)


class ExternalApiOpenApiInfo(BaseModel):
    title: str = "AssetIQ External Observation API"
    version: str = "1.0.0"
    endpoint: str = "/api/v1/external/observations"
    auth: List[str] = Field(default_factory=lambda: ["Bearer", "X-API-Key"])
    required_scope: str = "observations:create"
