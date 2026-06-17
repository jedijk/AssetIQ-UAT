"""
Visual Management Board template routes.
"""
from fastapi import APIRouter, Depends

from auth import require_permission
from models.visual_board import (
    CreateBoardFromTemplateRequest,
    CreateTemplateRequest,
    UpdateTemplateRequest,
)
from services import visual_board_service as svc

router = APIRouter(prefix="/board-templates", tags=["Visual Management Templates"])

_vmb_read = require_permission("vmb:read")
_vmb_write = require_permission("vmb:write")
_vmb_admin = require_permission("vmb:admin")


@router.get("")
async def list_templates(current_user: dict = Depends(_vmb_read)):
    return await svc.list_templates(current_user)


@router.post("")
async def create_template(
    request: CreateTemplateRequest,
    current_user: dict = Depends(_vmb_admin),
):
    return await svc.create_template(request, current_user)


@router.put("/{template_id}")
async def update_template(
    template_id: str,
    request: UpdateTemplateRequest,
    current_user: dict = Depends(_vmb_admin),
):
    return await svc.update_template(template_id, request, current_user)


@router.delete("/{template_id}")
async def delete_template(
    template_id: str,
    current_user: dict = Depends(_vmb_admin),
):
    return await svc.delete_template(template_id, current_user)


@router.post("/create-board")
async def create_board_from_template(
    request: CreateBoardFromTemplateRequest,
    current_user: dict = Depends(_vmb_write),
):
    return await svc.create_board_from_template(request, current_user)
