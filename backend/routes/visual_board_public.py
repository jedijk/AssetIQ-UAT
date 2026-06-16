"""
Visual Management Board public routes — token auth only, no JWT.
"""
from fastapi import APIRouter, HTTPException, Query

from models.visual_board import HeartbeatRequest
from services import visual_board_data_service as data_svc
from services import visual_board_service as svc
from services.visual_board_token import validate_token_format

router = APIRouter(prefix="/vmb", tags=["Visual Management Boards — Public"])


def _validate_path_token(token: str) -> str:
    if not validate_token_format(token):
        raise HTTPException(status_code=400, detail="Invalid board token format")
    return token


@router.get("/{token}/layout")
async def get_board_layout(token: str):
    """Return published board layout and widget configuration."""
    _validate_path_token(token)
    return await data_svc.get_public_layout(token)


@router.get("/{token}/data")
async def get_board_data(
    token: str,
    period_days: int = Query(30, ge=1, le=365),
):
    """Return aggregated widget data for display clients."""
    _validate_path_token(token)
    return await data_svc.get_public_data(token, period_days=period_days)


@router.post("/{token}/heartbeat")
async def board_heartbeat(token: str, request: HeartbeatRequest = HeartbeatRequest()):
    """Record display device heartbeat for screen health tracking."""
    _validate_path_token(token)
    return await svc.record_heartbeat(
        token,
        screen_name=request.screen_name,
        device_id=request.device_id,
    )
