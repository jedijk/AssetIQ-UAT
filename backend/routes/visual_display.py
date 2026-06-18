"""
Visual display device pairing routes — public kiosk + admin registration.
"""
from fastapi import APIRouter, Depends, Query

from auth import require_permission
from models.visual_display import (
    CompletePairingRequest,
    CompletePairingResponse,
    PairingPreviewResponse,
    PairingStatusResponse,
    RequestPairingRequest,
    RequestPairingResponse,
)
from services import visual_display_pairing_service as pairing_svc

router = APIRouter(prefix="/display", tags=["Visual Display Devices"])

_vmb_admin = require_permission("vmb:admin")


@router.post("/request-pairing", response_model=RequestPairingResponse)
async def request_pairing(request: RequestPairingRequest):
    """Display device requests a pairing code (no login)."""
    return await pairing_svc.request_pairing(
        device_fingerprint=request.device_fingerprint,
        user_agent=request.user_agent,
        screen_width=request.screen_width,
        screen_height=request.screen_height,
        device_label=request.device_label,
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
