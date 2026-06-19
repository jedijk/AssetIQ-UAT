"""
Visual display device pairing routes — public kiosk + admin registration.
"""
from typing import Optional

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.responses import Response

from auth import require_permission
from models.visual_display import (
    AcceptTokenRotationResponse,
    CompletePairingRequest,
    CompletePairingResponse,
    ConnectDeviceRequest,
    ConnectDeviceResponse,
    DeviceConfigResponse,
    DeviceEventsResponse,
    DeviceHeartbeatRequest,
    DeviceHeartbeatResponse,
    DisplayDeviceDetail,
    NearbyPairingsResponse,
    PairingPreviewResponse,
    PairingStatusResponse,
    ReassignBoardRequest,
    RequestPairingRequest,
    RequestPairingResponse,
    RotateTokenResponse,
    UpdateDeviceRequest,
)
from services import visual_display_admin_service as admin_svc
from services import visual_display_device_service as device_svc
from services import visual_display_pairing_service as pairing_svc
from services import visual_board_snapshot_service as snapshot_svc
from services.visual_display_network import extract_client_ip, normalize_local_subnet

router = APIRouter(prefix="/display", tags=["Visual Display Devices"])

_vmb_admin = require_permission("vmb:admin")


async def _require_device_token(request: Request) -> str:
    token = device_svc.extract_device_token(request)
    if not token:
        from fastapi import HTTPException

        raise HTTPException(status_code=401, detail="Device token required")
    return token


@router.post("/request-pairing", response_model=RequestPairingResponse)
async def request_pairing(http_request: Request, request: RequestPairingRequest):
    """Display device requests a pairing code (no login)."""
    return await pairing_svc.request_pairing(
        device_fingerprint=request.device_fingerprint,
        user_agent=request.user_agent,
        screen_width=request.screen_width,
        screen_height=request.screen_height,
        device_label=request.device_label,
        request_ip=extract_client_ip(http_request),
        local_subnet=normalize_local_subnet(request.local_subnet),
    )


@router.get("/pairing/{pair_code}/status", response_model=PairingStatusResponse)
async def pairing_status(
    pair_code: str,
    device_fingerprint: str = Query(..., min_length=8),
):
    """Device polls until administrator completes pairing."""
    return await pairing_svc.poll_pairing_status(
        pair_code,
        device_fingerprint=device_fingerprint,
    )


@router.get("/pairing/nearby", response_model=NearbyPairingsResponse)
async def nearby_pairings(
    http_request: Request,
    local_subnet: Optional[str] = Query(None, max_length=32),
    current_user: dict = Depends(_vmb_admin),
):
    """List pending display pairings on the same network as this admin session."""
    return await pairing_svc.list_nearby_pending_pairings(
        user=current_user,
        viewer_ip=extract_client_ip(http_request),
        viewer_subnet=normalize_local_subnet(local_subnet),
    )


@router.get("/pairing/{pair_code}", response_model=PairingPreviewResponse)
async def preview_pairing(
    pair_code: str,
    current_user: dict = Depends(_vmb_admin),
):
    """Admin preview of a pending pairing request."""
    return await pairing_svc.get_pairing_preview(pair_code)


@router.post("/pairing/complete", response_model=CompletePairingResponse)
async def complete_pairing(
    request: CompletePairingRequest,
    current_user: dict = Depends(_vmb_admin),
):
    """Admin assigns a board and activates the display device."""
    return await pairing_svc.complete_pairing(
        pair_code=request.pair_code,
        board_id=request.board_id,
        screen_name=request.screen_name,
        location=request.location,
        area=request.area,
        database_environment=request.database_environment,
        user=current_user,
    )


@router.get("/pairing-boards")
async def list_pairing_boards(current_user: dict = Depends(_vmb_admin)):
    """List boards from all database environments for display pairing."""
    return await pairing_svc.list_pairing_boards(current_user)


@router.get("/devices")
async def list_devices(current_user: dict = Depends(_vmb_admin)):
    """List paired display devices for the tenant."""
    return await pairing_svc.list_display_devices(current_user)


# --- Phase 4c: device admin ---


@router.get("/devices/{device_id}", response_model=DisplayDeviceDetail)
async def get_device(device_id: str, current_user: dict = Depends(_vmb_admin)):
    return await admin_svc.get_device_detail(device_id, current_user)


@router.patch("/devices/{device_id}", response_model=DisplayDeviceDetail)
async def patch_device(
    device_id: str,
    request: UpdateDeviceRequest,
    current_user: dict = Depends(_vmb_admin),
):
    return await admin_svc.update_device(
        device_id,
        current_user,
        screen_name=request.screen_name,
        location=request.location,
        area=request.area,
    )


@router.post("/devices/{device_id}/reassign-board", response_model=DisplayDeviceDetail)
async def reassign_device_board(
    device_id: str,
    request: ReassignBoardRequest,
    current_user: dict = Depends(_vmb_admin),
):
    return await admin_svc.reassign_board(
        device_id,
        current_user,
        board_id=request.board_id,
        database_environment=request.database_environment,
    )


@router.post("/devices/{device_id}/disable", response_model=DisplayDeviceDetail)
async def disable_device(device_id: str, current_user: dict = Depends(_vmb_admin)):
    return await admin_svc.disable_device(device_id, current_user)


@router.post("/devices/{device_id}/enable", response_model=DisplayDeviceDetail)
async def enable_device(device_id: str, current_user: dict = Depends(_vmb_admin)):
    return await admin_svc.enable_device(device_id, current_user)


@router.post("/devices/{device_id}/rotate-token", response_model=RotateTokenResponse)
async def rotate_device_token(device_id: str, current_user: dict = Depends(_vmb_admin)):
    result = await admin_svc.rotate_device_token(device_id, current_user)
    return RotateTokenResponse(**result)


@router.delete("/devices/{device_id}", status_code=204)
async def delete_device(device_id: str, current_user: dict = Depends(_vmb_admin)):
    await admin_svc.delete_device(device_id, current_user)


@router.get("/devices/{device_id}/events", response_model=DeviceEventsResponse)
async def device_events(
    device_id: str,
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(_vmb_admin),
):
    result = await admin_svc.list_device_events(device_id, current_user, limit=limit)
    return DeviceEventsResponse(**result)


@router.post("/accept-token-rotation", response_model=AcceptTokenRotationResponse)
async def accept_token_rotation(http_request: Request):
    """Display device accepts a pending token rotation (old token auth)."""
    token = device_svc.extract_device_token(http_request)
    if not token:
        from fastapi import HTTPException

        raise HTTPException(status_code=401, detail="Device token required")
    result = await admin_svc.accept_token_rotation(token)
    return AcceptTokenRotationResponse(**result)


# --- Phase 4b: device runtime (token auth) ---


@router.post("/connect", response_model=ConnectDeviceResponse)
async def connect_device(request: ConnectDeviceRequest, http_request: Request):
    """Validate device token and return assigned board."""
    token = device_svc.extract_device_token(http_request) or request.device_token
    if not token:
        from fastapi import HTTPException

        raise HTTPException(status_code=401, detail="Device token required")
    result = await device_svc.connect_device(token)
    return ConnectDeviceResponse(**result)


@router.get("/config", response_model=DeviceConfigResponse)
async def device_config(device_token: str = Depends(_require_device_token)):
    """Return device configuration for kiosk clients."""
    result = await device_svc.get_device_config(device_token)
    return DeviceConfigResponse(**result)


@router.get("/board/layout")
async def device_board_layout(device_token: str = Depends(_require_device_token)):
    """Return published board layout for the assigned board."""
    return await device_svc.get_device_layout(device_token)


@router.get("/board/data")
async def device_board_data(
    device_token: str = Depends(_require_device_token),
    period_days: int = Query(30, ge=1, le=365),
):
    """Return aggregated widget data for the assigned board."""
    return await device_svc.get_device_data(device_token, period_days=period_days)


@router.get("/board/snapshot")
async def device_board_snapshot(device_token: str = Depends(_require_device_token)):
    """Return a high-quality static PNG/JPEG snapshot for kiosk TVs (no React rendering)."""
    device = await device_svc.lookup_device_by_token(device_token)
    data, content_type, updated_at = await snapshot_svc.get_device_snapshot_from_device_doc(device)
    headers = {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
    }
    if updated_at:
        headers["X-Snapshot-Updated-At"] = updated_at
    return Response(content=data, media_type=content_type, headers=headers)


@router.post("/heartbeat", response_model=DeviceHeartbeatResponse)
async def device_heartbeat(
    request: DeviceHeartbeatRequest,
    device_token: str = Depends(_require_device_token),
):
    """Record device heartbeat and online status."""
    result = await device_svc.record_device_heartbeat(
        device_id=request.device_id,
        raw_token=device_token,
    )
    return DeviceHeartbeatResponse(**result)
