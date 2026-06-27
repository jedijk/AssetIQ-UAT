"""SpareIQ routes — spare parts register and categories."""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from auth import require_permission
from models.spare_parts import (
    SpareCategoryCreate,
    SpareCategoryUpdate,
    SparePartCreate,
    SparePartUpdate,
)
from services import spare_categories_service as categories_svc
from services import spare_part_files_service as files_svc
from services import spare_parts_import_service as import_svc
from services import spare_parts_service as parts_svc

router = APIRouter(tags=["Spares"])

_spareiq_read = require_permission("spareiq:read")
_spareiq_write = require_permission("spareiq:write")
_spareiq_delete = require_permission("spareiq:delete")


class EquipmentLinkRequest(BaseModel):
    equipment_id: str
    component_position: Optional[str] = None


class ImportRowsRequest(BaseModel):
    rows: List[Dict[str, Any]]


@router.get("/spare-parts-import/template")
async def download_spare_parts_import_template(
    current_user: dict = Depends(_spareiq_read),
):
    content = import_svc.build_import_template_bytes()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="spare_parts_import_template.xlsx"'},
    )


@router.post("/spare-parts-import/validate")
async def validate_spare_parts_import(
    file: UploadFile = File(...),
    current_user: dict = Depends(_spareiq_write),
):
    content = await file.read()
    rows, parse_errors = import_svc.parse_spare_parts_workbook(content)
    if parse_errors:
        return {"rows": [], "summary": {"total": 0, "errors": len(parse_errors)}, "parse_errors": parse_errors}
    result = await import_svc.validate_import_rows(current_user, rows)
    return result


@router.post("/spare-parts-import/import")
async def import_spare_parts(
    body: ImportRowsRequest,
    current_user: dict = Depends(_spareiq_write),
):
    return await import_svc.execute_import(current_user, body.rows)


@router.get("/spare-parts")
async def list_spare_parts(
    search: Optional[str] = None,
    category_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    sort_by: str = "updated_at",
    sort_dir: int = Query(-1, ge=-1, le=1),
    current_user: dict = Depends(_spareiq_read),
):
    return await parts_svc.list_spare_parts(
        current_user,
        search=search,
        category_id=category_id,
        equipment_id=equipment_id,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )


@router.get("/spare-parts/{spare_part_id}/insights")
async def get_spare_part_insights(
    spare_part_id: str,
    current_user: dict = Depends(_spareiq_read),
):
    from services.spare_part_requirements_service import get_spare_part_insights as get_insights

    return await get_insights(current_user, spare_part_id)


@router.get("/spare-parts/{spare_part_id}")
async def get_spare_part(
    spare_part_id: str,
    current_user: dict = Depends(_spareiq_read),
):
    return await parts_svc.get_spare_part(current_user, spare_part_id)


@router.post("/spare-parts")
async def create_spare_part(
    payload: SparePartCreate,
    current_user: dict = Depends(_spareiq_write),
):
    return await parts_svc.create_spare_part(current_user, payload)


@router.patch("/spare-parts/{spare_part_id}")
async def update_spare_part(
    spare_part_id: str,
    payload: SparePartUpdate,
    current_user: dict = Depends(_spareiq_write),
):
    return await parts_svc.update_spare_part(current_user, spare_part_id, payload)


@router.post("/spare-parts/{spare_part_id}/equipment-links")
async def link_spare_part_equipment(
    spare_part_id: str,
    body: EquipmentLinkRequest,
    current_user: dict = Depends(_spareiq_write),
):
    return await parts_svc.link_equipment(
        current_user,
        spare_part_id,
        body.equipment_id,
        body.component_position,
    )


@router.delete("/spare-parts/{spare_part_id}/equipment-links/{equipment_id}")
async def unlink_spare_part_equipment(
    spare_part_id: str,
    equipment_id: str,
    current_user: dict = Depends(_spareiq_write),
):
    return await parts_svc.unlink_equipment(current_user, spare_part_id, equipment_id)


@router.delete("/spare-parts/{spare_part_id}")
async def delete_spare_part(
    spare_part_id: str,
    current_user: dict = Depends(_spareiq_delete),
):
    return await parts_svc.delete_spare_part(current_user, spare_part_id)


@router.get("/spare-parts/{spare_part_id}/files")
async def list_spare_part_files(
    spare_part_id: str,
    current_user: dict = Depends(_spareiq_read),
):
    return await files_svc.list_spare_part_files(current_user, spare_part_id)


@router.post("/spare-part-files/{spare_part_id}/upload")
async def upload_spare_part_file(
    spare_part_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(_spareiq_write),
):
    return await files_svc.upload_spare_part_file(current_user, spare_part_id, file)


@router.get("/spare-part-files/{file_id}/download")
async def download_spare_part_file(
    file_id: str,
    current_user: dict = Depends(_spareiq_read),
):
    return await files_svc.download_spare_part_file(current_user, file_id)


@router.get("/spare-part-files/{file_id}/view")
async def view_spare_part_file(
    file_id: str,
    current_user: dict = Depends(_spareiq_read),
):
    return await files_svc.view_spare_part_file(current_user, file_id)


@router.delete("/spare-part-files/{file_id}")
async def delete_spare_part_file(
    file_id: str,
    current_user: dict = Depends(_spareiq_write),
):
    return await files_svc.delete_spare_part_file(current_user, file_id)


@router.get("/spare-categories")
async def list_spare_categories(
    include_inactive: bool = False,
    current_user: dict = Depends(_spareiq_read),
):
    return await categories_svc.list_categories(current_user, include_inactive=include_inactive)


@router.post("/spare-categories")
async def create_spare_category(
    payload: SpareCategoryCreate,
    current_user: dict = Depends(_spareiq_write),
):
    return await categories_svc.create_category(current_user, payload)


@router.patch("/spare-categories/{category_id}")
async def update_spare_category(
    category_id: str,
    payload: SpareCategoryUpdate,
    current_user: dict = Depends(_spareiq_write),
):
    return await categories_svc.update_category(current_user, category_id, payload)


@router.delete("/spare-categories/{category_id}")
async def delete_spare_category(
    category_id: str,
    current_user: dict = Depends(_spareiq_delete),
):
    return await categories_svc.delete_category(current_user, category_id)
