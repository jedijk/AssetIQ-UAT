"""Failure mode information card routes."""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth import require_permission
from services import failure_modes_routes_service as svc

router = APIRouter(tags=["Failure Modes"])

_library_read = require_permission("library:read")


class InformationCardRegenerateRequest(BaseModel):
    language: Optional[str] = "en"


@router.get("/failure-modes/{mode_id}/information-card")
async def get_failure_mode_information_card(
    mode_id: str,
    language: str = "en",
    force: bool = False,
    current_user: dict = Depends(_library_read),
):
    return await svc.get_or_generate_information_card(
        mode_id,
        current_user=current_user,
        language=language,
        force=force,
    )


@router.post("/failure-modes/{mode_id}/information-card/regenerate")
async def regenerate_failure_mode_information_card(
    mode_id: str,
    body: Optional[InformationCardRegenerateRequest] = None,
    current_user: dict = Depends(_library_read),
):
    language = (body.language if body else None) or "en"
    return await svc.get_or_generate_information_card(
        mode_id,
        current_user=current_user,
        language=language,
        force=True,
    )
