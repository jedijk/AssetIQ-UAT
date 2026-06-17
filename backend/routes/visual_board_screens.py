"""
Visual Management Board screen management routes.
"""
from fastapi import APIRouter, Depends

from auth import require_permission
from models.visual_board import CreateScreenRequest, UpdateScreenRequest
from services import visual_board_service as svc

router = APIRouter(prefix="/board-screens", tags=["Visual Management Screens"])

_vmb_admin = require_permission("vmb:admin")


@router.get("")
async def list_all_screens(current_user: dict = Depends(_vmb_admin)):
    return await svc.list_all_screens(current_user)


@router.put("/{screen_id}")
async def update_screen(
    screen_id: str,
    request: UpdateScreenRequest,
    current_user: dict = Depends(_vmb_admin),
):
    return await svc.update_screen(screen_id, request, current_user)


@router.delete("/{screen_id}")
async def delete_screen(
    screen_id: str,
    current_user: dict = Depends(_vmb_admin),
):
    return await svc.delete_screen(screen_id, current_user)
