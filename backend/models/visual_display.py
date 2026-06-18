"""Visual display device pairing — Pydantic models."""
from typing import Optional

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


class CompletePairingRequest(BaseModel):
    pair_code: str = Field(..., min_length=6, max_length=6)
    board_id: str
    screen_name: str = Field(..., min_length=1, max_length=120)
    location: Optional[str] = None
    area: Optional[str] = None


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


class DisplayDeviceSummary(BaseModel):
    id: str
    screen_name: str
    board_id: Optional[str] = None
    board_name: Optional[str] = None
    location: Optional[str] = None
    area: Optional[str] = None
    status: str
    last_seen: Optional[str] = None
    user_agent: Optional[str] = None
    screen_width: Optional[int] = None
    screen_height: Optional[int] = None
    created_at: Optional[str] = None
    paired_at: Optional[str] = None
