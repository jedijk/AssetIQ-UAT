"""Pydantic models for External Observation API and API key management."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


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
    equipment_requests: int = 0
    avg_response_ms: Optional[float] = None
    last_request_at: Optional[str] = None
    health_status: str = "unknown"
    recent_requests: List[Dict[str, Any]] = Field(default_factory=list)
    usage_trends: Dict[str, Any] = Field(default_factory=dict)


class ExternalEquipmentCriticality(BaseModel):
    rating: Optional[str] = None
    classification: Optional[str] = None
    safety_impact: Optional[int] = None
    production_impact: Optional[int] = None
    environmental_impact: Optional[int] = None
    reputation_impact: Optional[int] = None
    total_score: int = 0
    business_critical: bool = False
    safety_critical: bool = False
    environmental_critical: bool = False


class ExternalEquipmentOperationalSummary(BaseModel):
    open_observation_count: int = 0
    open_planned_task_count: int = 0
    active_maintenance_program: bool = False
    last_observation_date: Optional[str] = None


class ExternalEquipmentMaintenanceSummary(BaseModel):
    active_maintenance_program: bool = False
    program_task_count: int = 0
    strategy_failure_mode_count: int = 0


class ExternalEquipmentObject(BaseModel):
    id: str
    name: Optional[str] = None
    tag: Optional[str] = None
    level: Optional[str] = None
    parent_id: Optional[str] = None
    installation_id: Optional[str] = None
    equipment_type_id: Optional[str] = None
    discipline: Optional[str] = None
    description: Optional[str] = None
    status: str = "active"
    equipment_path: str = ""
    depth: int = 0
    criticality: ExternalEquipmentCriticality = Field(default_factory=ExternalEquipmentCriticality)
    operational_summary: ExternalEquipmentOperationalSummary = Field(
        default_factory=ExternalEquipmentOperationalSummary
    )
    metadata: Optional[Dict[str, Any]] = None
    children: Optional[List["ExternalEquipmentObject"]] = None
    maintenance_summary: Optional[ExternalEquipmentMaintenanceSummary] = None


class ExternalEquipmentHierarchyResponse(BaseModel):
    installation_id: str
    installation_name: Optional[str] = None
    flat: bool = False
    count: int = 0
    equipment: Any = None
    generated_at: str


class ExternalEquipmentDetailResponse(ExternalEquipmentObject):
    pass


ExternalEquipmentObject.model_rebuild()


class ExternalApiOpenApiInfo(BaseModel):
    title: str = "AssetIQ External API"
    version: str = "1.1.0"
    endpoints: List[Dict[str, str]] = Field(
        default_factory=lambda: [
            {"method": "POST", "path": "/api/v1/external/observations", "scope": "observations:create"},
            {
                "method": "GET",
                "path": "/api/v1/external/installations/{installation_id}/hierarchy",
                "scope": "equipment:read",
            },
            {"method": "GET", "path": "/api/v1/external/equipment/{equipment_id}", "scope": "equipment:read"},
        ]
    )
    auth: List[str] = Field(default_factory=lambda: ["Bearer", "X-API-Key"])
    scopes: List[str] = Field(default_factory=lambda: ["observations:create", "equipment:read"])
    openapi_json_path: str = "/api/v1/external/openapi.json"
