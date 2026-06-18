"""Visual display device pairing — Pydantic models."""
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class RequestPairingRequest(BaseModel):
    device_fingerprint: str = Field(..., min_length=8, max_length=128)
    user_agent: Optional[str] = None
    screen_width: Optional[int] = None
    screen_height: Optional[int] = None
    device_label: Optional[str] = None


class RequestPairingResponse(BaseModel):
    pair_code: str
    pairing_id: str
    expires_in: int


class PairingPreviewResponse(BaseModel):
    pair_code: str
    pairing_id: str
    status: str
    expires_at: Optional[str] = None
    device_label: Optional[str] = None
    user_agent: Optional[str] = None
    screen_width: Optional[int] = None
    screen_height: Optional[int] = None
    resolution: Optional[str] = None
    database_environment: Optional[str] = None


class PairingBoardSummary(BaseModel):
    id: str
    name: str
    database_environment: str
    status: Optional[str] = None


class CompletePairingRequest(BaseModel):
    pair_code: str = Field(..., min_length=6, max_length=6)
    board_id: str
    screen_name: str = Field(..., min_length=1, max_length=120)
    location: Optional[str] = None
    area: Optional[str] = None
    database_environment: Optional[str] = None


class CompletePairingResponse(BaseModel):
    device_id: str
    device_token: str
    board_id: str
    screen_name: str


class PairingStatusResponse(BaseModel):
    status: str
    expires_in: Optional[int] = None
    device_id: Optional[str] = None
    device_token: Optional[str] = None
    board_id: Optional[str] = None
    screen_name: Optional[str] = None


class ConnectDeviceRequest(BaseModel):
    device_token: str = Field(..., min_length=12)


class ConnectDeviceResponse(BaseModel):
    device_id: str
    board_id: str
    board_version: int
    screen_name: Optional[str] = None


class DeviceConfigResponse(BaseModel):
    device_id: str
    board_id: str
    board_version: int
    screen_name: Optional[str] = None
    refresh_interval: int = 30


class DeviceHeartbeatRequest(BaseModel):
    device_id: str


class DeviceHeartbeatResponse(BaseModel):
    device_id: str
    status: str
    board_version: int
    last_seen: str


class DisplayDeviceSummary(BaseModel):
    id: str
    screen_name: str
    board_id: Optional[str] = None
    board_name: Optional[str] = None
    board_version: Optional[int] = None
    location: Optional[str] = None
    area: Optional[str] = None
    status: str
    last_seen: Optional[str] = None
    user_agent: Optional[str] = None
    screen_width: Optional[int] = None
    screen_height: Optional[int] = None
    resolution: Optional[str] = None
    uptime_seconds: Optional[int] = None
    token_age_days: Optional[int] = None
    created_at: Optional[str] = None
    paired_at: Optional[str] = None


class DisplayDeviceDetail(DisplayDeviceSummary):
    device_fingerprint: Optional[str] = None
    device_label: Optional[str] = None
    pairing_id: Optional[str] = None
    token_rotation_pending: bool = False
    disabled_at: Optional[str] = None
    updated_at: Optional[str] = None


class UpdateDeviceRequest(BaseModel):
    screen_name: Optional[str] = Field(None, min_length=1, max_length=120)
    location: Optional[str] = None
    area: Optional[str] = None


class ReassignBoardRequest(BaseModel):
    board_id: str
    database_environment: Optional[str] = None


class RotateTokenResponse(BaseModel):
    device_id: str
    rotation_pending: bool


class AcceptTokenRotationResponse(BaseModel):
    device_id: str
    device_token: str


class DeviceEventItem(BaseModel):
    id: str
    event: str
    timestamp: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class DeviceEventsResponse(BaseModel):
    items: list[DeviceEventItem]
    total: int
