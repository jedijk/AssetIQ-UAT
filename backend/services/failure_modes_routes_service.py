"""Failure modes library routes — service layer (thin facade)."""
from services.failure_modes_merge import (
    FindDuplicateActionsScanRequest,
    MergeDuplicateActionGroupItem,
    MergeDuplicateActionsRequest,
    MergeFailureModesRequest,
    merge_duplicate_actions,
    merge_failure_modes,
    scan_duplicate_actions_in_failure_modes,
)
from services.failure_modes_read import (
    FindSimilarFailureModesScanRequest,
    export_failure_modes_excel,
    get_categories,
    get_equipment_types,
    get_failure_mode_by_id,
    get_failure_mode_counts_by_equipment_type,
    get_failure_modes,
    get_high_risk_modes,
    get_mechanisms,
    get_similar_failure_modes,
    scan_similar_failure_modes,
)
from services.failure_modes_versions import RollbackRequest, get_failure_mode_versions, rollback_failure_mode
from services.failure_mode_information_card import get_or_generate_card
from services.failure_modes_write import (
    FailureModeCreate,
    FailureModeUpdate,
    FailureModeValidation,
    auto_link_equipment_types,
    auto_translate_failure_mode,
    create_failure_mode,
    delete_failure_mode,
    format_recommended_actions_text,
    unvalidate_failure_mode,
    update_failure_mode,
    validate_failure_mode,
)

__all__ = [
    "get_failure_modes",
    "get_categories",
    "get_equipment_types",
    "get_mechanisms",
    "get_failure_mode_counts_by_equipment_type",
    "export_failure_modes_excel",
    "get_high_risk_modes",
    "get_failure_mode_by_id",
    "get_similar_failure_modes",
    "scan_similar_failure_modes",
    "FailureModeCreate",
    "FailureModeUpdate",
    "FailureModeValidation",
    "FindSimilarFailureModesScanRequest",
    "FindDuplicateActionsScanRequest",
    "MergeDuplicateActionGroupItem",
    "MergeDuplicateActionsRequest",
    "MergeFailureModesRequest",
    "RollbackRequest",
    "auto_link_equipment_types",
    "auto_translate_failure_mode",
    "format_recommended_actions_text",
    "create_failure_mode",
    "update_failure_mode",
    "get_failure_mode_versions",
    "rollback_failure_mode",
    "validate_failure_mode",
    "unvalidate_failure_mode",
    "scan_duplicate_actions_in_failure_modes",
    "merge_duplicate_actions",
    "merge_failure_modes",
    "delete_failure_mode",
    "get_or_generate_information_card",
]


async def get_or_generate_information_card(
    mode_id: str,
    *,
    current_user: dict,
    language: str = "en",
    force: bool = False,
):
    return await get_or_generate_card(mode_id, current_user, language=language, force=force)
