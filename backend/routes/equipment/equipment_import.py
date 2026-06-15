"""Equipment Hierarchy Import operations."""
from fastapi import APIRouter, Depends, UploadFile, File, Form

from auth import get_current_user
from iso14224_models import (
    UnstructuredItemCreate,
    ParseEquipmentListRequest,
    AssignToHierarchyRequest,
)
from services import equipment_import_service as svc
from services.equipment_import_service import (
    ExcelHierarchyImportRequest,
    HierarchyImportRequest,
)

router = APIRouter()


@router.get("/equipment-hierarchy/unstructured")
async def get_unstructured_items(current_user: dict = Depends(get_current_user)):
    """Get all unstructured (unassigned) equipment items."""
    return await svc.get_unstructured_items(current_user)


@router.post("/equipment-hierarchy/unstructured")
async def create_unstructured_item(
    item_data: UnstructuredItemCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a single unstructured equipment item."""
    return await svc.create_unstructured_item(current_user, item_data)


@router.post("/equipment-hierarchy/parse-list")
async def parse_equipment_list(
    request: ParseEquipmentListRequest,
    current_user: dict = Depends(get_current_user),
):
    """Parse a text list and create unstructured items with auto-detection."""
    return await svc.parse_equipment_list(current_user, request)


@router.post("/equipment-hierarchy/parse-file")
async def parse_equipment_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Parse an uploaded file (Excel, PDF, CSV, TXT) and extract equipment items."""
    return await svc.parse_equipment_file(current_user, file)


@router.post("/equipment-hierarchy/unstructured/{item_id}/assign")
async def assign_unstructured_to_hierarchy(
    item_id: str,
    assignment: AssignToHierarchyRequest,
    current_user: dict = Depends(get_current_user),
):
    """Move an unstructured item into the ISO hierarchy."""
    return await svc.assign_unstructured_to_hierarchy(current_user, item_id, assignment)


@router.delete("/equipment-hierarchy/unstructured/{item_id}")
async def delete_unstructured_item(
    item_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete an unstructured item."""
    return await svc.delete_unstructured_item(current_user, item_id)


@router.delete("/equipment-hierarchy/unstructured")
async def clear_unstructured_items(current_user: dict = Depends(get_current_user)):
    """Delete all unstructured items for the current user."""
    return await svc.clear_unstructured_items(current_user)


@router.post("/equipment-hierarchy/import-excel")
async def import_excel_file(
    file: UploadFile = File(...),
    installation_id: str = Form(...),
    current_user: dict = Depends(get_current_user),
):
    """Import equipment hierarchy from an uploaded Excel file."""
    return await svc.import_excel_file(current_user, file, installation_id)


@router.post("/equipment/import-hierarchy-excel")
async def import_hierarchy_from_excel(
    request: ExcelHierarchyImportRequest,
    current_user: dict = Depends(get_current_user),
):
    """Import equipment hierarchy from an Excel file URL."""
    return await svc.import_hierarchy_from_excel(current_user, request)


@router.post("/equipment/import-hierarchy")
async def import_equipment_hierarchy(
    request: HierarchyImportRequest,
    current_user: dict = Depends(get_current_user),
):
    """Import a complete equipment hierarchy for an installation."""
    return await svc.import_equipment_hierarchy(current_user, request)
