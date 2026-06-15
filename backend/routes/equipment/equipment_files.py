"""
Equipment file attachments — upload, download, view, delete.
Uses storage_service.py for R2/MongoDB dual storage.
"""
from fastapi import APIRouter, UploadFile, File, Depends

from auth import get_current_user, require_permission
from services import equipment_files_service as svc

_equipment_read = require_permission("equipment:read")

router = APIRouter(tags=["Equipment Files"])


@router.get("/equipment/{equipment_id}/files")
async def get_equipment_files(
    equipment_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get all files attached to an equipment node."""
    return await svc.list_equipment_files(current_user, equipment_id)


@router.post("/equipment-files/{equipment_id}/upload")
async def upload_equipment_file(
    equipment_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    return await svc.upload_equipment_file(current_user, equipment_id, file)


@router.get("/equipment-files/{file_id}/download")
async def download_equipment_file(
    file_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await svc.download_equipment_file(current_user, file_id)


@router.get("/equipment-files/{file_id}/view")
async def view_equipment_file_public(
    file_id: str,
    current_user: dict = Depends(_equipment_read),
):
    """Authenticated inline view for Office Online viewer."""
    return await svc.view_equipment_file(current_user, file_id)


@router.delete("/equipment-files/{file_id}")
async def delete_equipment_file(
    file_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await svc.delete_equipment_file(current_user, file_id)
