"""PM Import Mongo match builders for intelligence map aggregations."""
from typing import Optional

from services.pm_import_constants import PM_IMPORT_UNWOUND_ENABLED_TASK_MATCH

# All non-rejected import tasks (aligns with PM Import tab / is_pm_import_review_accepted).
PM_IMPORT_IMPORTED_TASK_MATCH = {
    "tasks_extracted.review_status": {"$ne": "rejected"},
}

# Equipment-linked tasks used for schedule lineage and equipment_ids_with_pm_import.
PM_IMPORT_EQUIPMENT_LINKED_TASK_MATCH = {
    "tasks_extracted.equipment_match.equipment_id": {"$ne": None},
    "tasks_extracted.review_status": {"$ne": "rejected"},
    "$or": [
        {"tasks_extracted.import_status": {"$in": ["applied", "merged", "implemented"]}},
        {"tasks_extracted.review_status": {"$in": ["accepted", "edited", "implemented"]}},
    ],
}

# Backward-compatible alias for equipment-linked matching.
PM_IMPORT_ACTIVE_TASK_MATCH = PM_IMPORT_EQUIPMENT_LINKED_TASK_MATCH


def normalize_equipment_tags(tags: Optional[list]) -> list:
    if not tags:
        return []
    return list({str(t).strip().upper() for t in tags if t and str(t).strip()})


def pm_import_imported_task_match(
    equipment_ids: Optional[list] = None,
    equipment_tags: Optional[list] = None,
) -> dict:
    """Match non-rejected PM import tasks, optionally scoped to equipment."""
    match = dict(PM_IMPORT_IMPORTED_TASK_MATCH)
    if equipment_ids is None:
        return match

    tags = normalize_equipment_tags(equipment_tags)
    scope_clauses: list = [
        {"tasks_extracted.equipment_match.equipment_id": {"$in": equipment_ids}},
    ]
    if tags:
        scope_clauses.extend([
            {
                "$expr": {
                    "$in": [
                        {"$toUpper": {"$ifNull": ["$tasks_extracted.equipment_tag", ""]}},
                        tags,
                    ]
                }
            },
            {
                "$expr": {
                    "$in": [
                        {"$toUpper": {"$ifNull": ["$tasks_extracted.asset", ""]}},
                        tags,
                    ]
                }
            },
        ])
    match["$or"] = scope_clauses
    return match


def pm_import_equipment_linked_task_match(
    equipment_ids: Optional[list] = None,
    *,
    enabled_only: bool = False,
) -> dict:
    """Match equipment-linked PM import tasks for schedule / lineage counts."""
    match = dict(PM_IMPORT_EQUIPMENT_LINKED_TASK_MATCH)
    if equipment_ids is not None:
        match["tasks_extracted.equipment_match.equipment_id"] = {"$in": equipment_ids}
    if enabled_only:
        match.update(PM_IMPORT_UNWOUND_ENABLED_TASK_MATCH)
    return match


def pm_import_task_match(
    equipment_ids: Optional[list] = None,
    *,
    enabled_only: bool = True,
) -> dict:
    return pm_import_equipment_linked_task_match(
        equipment_ids,
        enabled_only=enabled_only,
    )
