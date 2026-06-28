"""
Admin routes for secure file upload pipeline — Phase 4.
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Query

from auth import require_roles
from services import secure_upload_service as svc

router = APIRouter()


def require_admin(current_user: dict = Depends(require_roles("owner", "admin"))):
    return current_user


@router.get("/admin/files/quarantine")
async def list_quarantined_files(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_admin),
):
    return await svc.list_quarantined_files(current_user, page=page, page_size=page_size)


@router.get("/admin/files/security-dashboard")
async def get_security_dashboard(
    current_user: dict = Depends(require_admin),
):
    return await svc.get_security_dashboard_stats(current_user)


@router.post("/admin/files/{file_id}/rescan")
async def request_file_rescan(
    file_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_admin),
):
    return await svc.request_rescan(current_user, file_id, background_tasks)
