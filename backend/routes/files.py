"""
Secure file upload routes — Phase 1 pipeline.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user
from services import secure_upload_service as svc

router = APIRouter(prefix="/files", tags=["Files"])


class InitiateUploadRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=512)
    content_type: Optional[str] = None
    size_bytes: int = Field(..., gt=0)
    linked_entity_type: str
    linked_entity_id: Optional[str] = None


@router.post("/initiate-upload")
async def initiate_upload(
    body: InitiateUploadRequest,
    current_user: dict = Depends(get_current_user),
):
    return await svc.initiate_upload(
        current_user,
        filename=body.filename,
        content_type=body.content_type,
        size_bytes=body.size_bytes,
        linked_entity_type=body.linked_entity_type,
        linked_entity_id=body.linked_entity_id,
    )


@router.put("/{upload_id}/upload")
@router.post("/{upload_id}/upload")
async def upload_file_body(
    upload_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Direct upload fallback when presigned PUT is unavailable."""
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload body")
    return await svc.upload_bytes(current_user, upload_id, data)


@router.post("/{upload_id}/complete")
async def complete_upload(
    upload_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    return await svc.complete_upload(current_user, upload_id, background_tasks)


@router.get("/{file_id}")
async def get_file_status(
    file_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await svc.get_file_status(current_user, file_id)


@router.get("/{file_id}/download-url")
async def get_download_url(
    file_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await svc.get_download_url(current_user, file_id)


@router.delete("/{file_id}")
async def delete_file(
    file_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await svc.delete_file(current_user, file_id)
