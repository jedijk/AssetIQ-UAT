"""
Visual Management Board routes — authenticated CRUD and lifecycle.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from auth import require_permission
from models.visual_board import (
    CreateBoardFromTemplateRequest,
    CreateBoardRequest,
    CreateScreenRequest,
    CreateTemplateRequest,
    CreateTokenRequest,
    PublishBoardRequest,
    RollbackVersionRequest,
    RotateTokenRequest,
    UpdateBoardRequest,
    UpdateScreenRequest,
    UpdateTemplateRequest,
)
from services import visual_board_data_service as data_svc
from services import visual_board_service as svc
from services.visual_board_qr import generate_qr_data_url

router = APIRouter(prefix="/boards", tags=["Visual Management Boards"])

_vmb_read = require_permission("vmb:read")
_vmb_write = require_permission("vmb:write")
_vmb_publish = require_permission("vmb:publish")
_vmb_admin = require_permission("vmb:admin")


class QrCodeRequest(BaseModel):
    url: str


@router.post("")
async def create_board(
    request: CreateBoardRequest,
    current_user: dict = Depends(_vmb_write),
):
    return await svc.create_board(request, current_user)


@router.get("")
async def list_boards(
    status: Optional[str] = None,
    board_type: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(_vmb_read),
):
    return await svc.list_boards(
        current_user,
        status=status,
        board_type=board_type,
        skip=skip,
        limit=limit,
    )


@router.get("/analytics")
async def board_analytics(
    days: int = Query(30, ge=1, le=365),
    current_user: dict = Depends(_vmb_admin),
):
    return await svc.get_analytics(current_user, days=days)


@router.post("/qr-code")
async def generate_qr(
    request: QrCodeRequest,
    current_user: dict = Depends(_vmb_read),
):
    return {"url": request.url, "qr_code_data_url": generate_qr_data_url(request.url)}


@router.get("/{board_id}")
async def get_board(
    board_id: str,
    current_user: dict = Depends(_vmb_read),
):
    return await svc.get_board(board_id, current_user)


@router.put("/{board_id}")
async def update_board(
    board_id: str,
    request: UpdateBoardRequest,
    current_user: dict = Depends(_vmb_write),
):
    return await svc.update_board(board_id, request, current_user)


@router.delete("/{board_id}")
async def delete_board(
    board_id: str,
    current_user: dict = Depends(_vmb_write),
):
    return await svc.delete_board(board_id, current_user)


@router.post("/{board_id}/publish")
async def publish_board(
    board_id: str,
    request: PublishBoardRequest = PublishBoardRequest(),
    current_user: dict = Depends(_vmb_publish),
):
    return await svc.publish_board(board_id, current_user, request)


@router.post("/{board_id}/unpublish")
async def unpublish_board(
    board_id: str,
    current_user: dict = Depends(_vmb_publish),
):
    return await svc.unpublish_board(board_id, current_user)


@router.post("/{board_id}/rotate-token")
async def rotate_token(
    board_id: str,
    request: RotateTokenRequest = RotateTokenRequest(),
    current_user: dict = Depends(_vmb_publish),
):
    return await svc.rotate_token(board_id, current_user, request)


@router.post("/{board_id}/tokens")
async def create_token(
    board_id: str,
    request: CreateTokenRequest = CreateTokenRequest(),
    current_user: dict = Depends(_vmb_publish),
):
    return await svc.create_board_token(board_id, current_user, request)


@router.get("/{board_id}/tokens")
async def list_tokens(
    board_id: str,
    current_user: dict = Depends(_vmb_read),
):
    return await svc.list_board_tokens(board_id, current_user)


@router.delete("/{board_id}/tokens/{token_id}")
async def revoke_token(
    board_id: str,
    token_id: str,
    current_user: dict = Depends(_vmb_publish),
):
    return await svc.revoke_board_token(board_id, token_id, current_user)


@router.get("/{board_id}/versions")
async def list_versions(
    board_id: str,
    current_user: dict = Depends(_vmb_read),
):
    return await svc.list_versions(board_id, current_user)


@router.post("/{board_id}/rollback")
async def rollback_version(
    board_id: str,
    request: RollbackVersionRequest,
    current_user: dict = Depends(_vmb_write),
):
    return await svc.rollback_board_version(board_id, current_user, request)


@router.get("/{board_id}/preview-data")
async def preview_board_data(
    board_id: str,
    period_days: int = Query(30, ge=1, le=365),
    current_user: dict = Depends(_vmb_read),
):
    return await data_svc.get_board_preview_data(
        board_id, current_user, period_days=period_days
    )


@router.get("/{board_id}/screens")
async def list_board_screens(
    board_id: str,
    current_user: dict = Depends(_vmb_admin),
):
    return await svc.list_screens(board_id, current_user)


@router.post("/{board_id}/screens")
async def create_board_screen(
    board_id: str,
    request: CreateScreenRequest,
    current_user: dict = Depends(_vmb_admin),
):
    return await svc.create_screen(board_id, request, current_user)
