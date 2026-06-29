"""Failure Modes routes."""
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends

from auth import require_permission
from services import failure_modes_routes_service as svc
from services.background_jobs import schedule_tracked_job
from services.failure_modes_routes_service import (
    FailureModeCreate,
    FailureModeUpdate,
    FailureModeValidation,
    FindSimilarFailureModesScanRequest,
    FindDuplicateActionsScanRequest,
    MergeDuplicateActionsRequest,
    MergeFailureModesRequest,
    RollbackRequest,
    auto_translate_failure_mode,
)

router = APIRouter(tags=["Failure Modes"])

_library_read = require_permission("library:read")
_library_write = require_permission("library:write")


@router.get("/failure-modes")
async def get_failure_modes(
    category: Optional[str] = None,
    equipment: Optional[str] = None,
    search: Optional[str] = None,
    min_rpn: Optional[int] = None,
    equipment_type_id: Optional[str] = None,
    mechanism: Optional[str] = None,
    is_validated: Optional[bool] = None,
    failure_mode_type: Optional[str] = None,
    recently_added_days: Optional[int] = 30,
    skip: int = 0,
    limit: int = 500,
    current_user: dict = Depends(_library_read),
):
    return await svc.get_failure_modes(
        category=category,
        equipment=equipment,
        search=search,
        min_rpn=min_rpn,
        equipment_type_id=equipment_type_id,
        mechanism=mechanism,
        is_validated=is_validated,
        failure_mode_type=failure_mode_type,
        recently_added_days=recently_added_days,
        skip=skip,
        limit=limit,
        current_user=current_user,
    )


@router.get("/failure-modes/categories")
async def get_categories(current_user: dict = Depends(_library_read)):
    return await svc.get_categories(current_user)


@router.get("/failure-modes/equipment-types")
async def get_equipment_types(current_user: dict = Depends(_library_read)):
    return await svc.get_equipment_types(current_user)


@router.get("/failure-modes/mechanisms")
async def get_mechanisms(current_user: dict = Depends(_library_read)):
    return await svc.get_mechanisms(current_user)


@router.get("/failure-modes/counts-by-equipment-type")
async def get_failure_mode_counts_by_equipment_type(
    current_user: dict = Depends(_library_read),
):
    return await svc.get_failure_mode_counts_by_equipment_type(current_user=current_user)


@router.get("/failure-modes/export")
async def export_failure_modes_excel(current_user: dict = Depends(_library_read)):
    return await svc.export_failure_modes_excel(current_user=current_user)


@router.get("/failure-modes/high-risk")
async def get_high_risk_modes(
    threshold: int = 150,
    current_user: dict = Depends(_library_read),
):
    return await svc.get_high_risk_modes(threshold, current_user=current_user)


@router.get("/failure-modes/{mode_id}")
async def get_failure_mode_by_id(
    mode_id: str,
    current_user: dict = Depends(_library_read),
):
    return await svc.get_failure_mode_by_id(mode_id, current_user=current_user)


@router.get("/failure-modes/{mode_id}/similar")
async def get_similar_failure_modes(
    mode_id: str,
    threshold: float = 55.0,
    limit: int = 20,
    require_shared_equipment_type: bool = False,
    current_user: dict = Depends(_library_read),
):
    return await svc.get_similar_failure_modes(
        mode_id,
        threshold=threshold,
        limit=limit,
        require_shared_equipment_type=require_shared_equipment_type,
        current_user=current_user,
    )


@router.post("/failure-modes")
async def create_failure_mode(
    data: FailureModeCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(_library_write),
):
    result = await svc.create_failure_mode(data, current_user=current_user)
    fm_id = str(result.get("id") or data.failure_mode)
    fm_data_for_translation = {
        "name": data.failure_mode,
        "description": data.description or "",
        "effects": data.potential_effects or "",
        "causes": data.potential_causes or "",
        "recommended_actions": svc.format_recommended_actions_text(data.recommended_actions),
    }
    schedule_tracked_job(
        background_tasks,
        "translate_failure_mode",
        auto_translate_failure_mode,
        fm_id,
        fm_data_for_translation,
        current_user["id"],
        user_id=current_user["id"],
    )
    return result


@router.patch("/failure-modes/{mode_id}")
async def update_failure_mode(
    mode_id: str,
    data: FailureModeUpdate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(_library_write),
):
    result = await svc.update_failure_mode(mode_id, data, current_user=current_user)
    if any(
        [
            data.failure_mode,
            data.potential_effects,
            data.potential_causes,
            data.recommended_actions,
        ]
    ):
        fm_data_for_translation = {
            "name": result.get("failure_mode", ""),
            "description": result.get("mechanism", ""),
            "effects": result.get("potential_effects", ""),
            "causes": result.get("potential_causes", ""),
            "recommended_actions": ", ".join(
                [
                    str(a)
                    if isinstance(a, str)
                    else a.get("description", str(a))
                    if isinstance(a, dict)
                    else str(a)
                    for a in (result.get("recommended_actions") or [])
                ]
            ),
        }
        schedule_tracked_job(
            background_tasks,
            "translate_failure_mode",
            auto_translate_failure_mode,
            result.get("failure_mode", "") or mode_id,
            fm_data_for_translation,
            current_user["id"],
            user_id=current_user["id"],
        )
    return result


@router.get("/failure-modes/{mode_id}/versions")
async def get_failure_mode_versions(
    mode_id: str,
    current_user: dict = Depends(_library_read),
):
    return await svc.get_failure_mode_versions(mode_id, current_user=current_user)


@router.post("/failure-modes/{mode_id}/rollback")
async def rollback_failure_mode(
    mode_id: str,
    data: RollbackRequest,
    current_user: dict = Depends(_library_write),
):
    return await svc.rollback_failure_mode(mode_id, data, current_user=current_user)


@router.post("/failure-modes/{mode_id}/validate")
async def validate_failure_mode(
    mode_id: str,
    data: FailureModeValidation,
    current_user: dict = Depends(_library_write),
):
    return await svc.validate_failure_mode(mode_id, data, current_user=current_user)


@router.post("/failure-modes/{mode_id}/unvalidate")
async def unvalidate_failure_mode(
    mode_id: str,
    current_user: dict = Depends(_library_write),
):
    return await svc.unvalidate_failure_mode(mode_id, current_user=current_user)


@router.post("/failure-modes/find-similar")
async def scan_similar_failure_modes(
    request: FindSimilarFailureModesScanRequest,
    current_user: dict = Depends(_library_write),
):
    return await svc.scan_similar_failure_modes(request, current_user=current_user)


@router.post("/failure-modes/find-duplicate-actions")
async def scan_duplicate_actions_in_failure_modes(
    request: FindDuplicateActionsScanRequest,
    current_user: dict = Depends(_library_write),
):
    return await svc.scan_duplicate_actions_in_failure_modes(
        request, current_user=current_user
    )


@router.post("/failure-modes/merge-duplicate-actions")
async def merge_duplicate_actions(
    request: MergeDuplicateActionsRequest,
    current_user: dict = Depends(_library_write),
):
    return await svc.merge_duplicate_actions(request, current_user=current_user)


@router.post("/failure-modes/merge")
async def merge_failure_modes(
    request: MergeFailureModesRequest,
    current_user: dict = Depends(_library_write),
):
    return await svc.merge_failure_modes(request, current_user=current_user)


@router.delete("/failure-modes/{mode_id}")
async def delete_failure_mode(
    mode_id: str,
    current_user: dict = Depends(_library_write),
):
    return await svc.delete_failure_mode(mode_id, current_user=current_user)
