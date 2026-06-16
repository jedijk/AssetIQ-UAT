"""Static failure-mode library helpers for Mongo sparse-data fallback."""
from typing import Optional

from failure_modes import FAILURE_MODES_LIBRARY


def get_all_categories() -> list:
    """Get unique categories from static library."""
    categories = set()
    for fm in FAILURE_MODES_LIBRARY:
        if fm.get("category"):
            categories.add(fm["category"])
    return sorted(categories)


def get_all_equipment_types() -> list:
    """Get unique equipment types from static library."""
    equipment_types = set()
    for fm in FAILURE_MODES_LIBRARY:
        if fm.get("equipment"):
            equipment_types.add(fm["equipment"])
    return sorted(equipment_types)


def filter_static_failure_modes(
    *,
    category: Optional[str] = None,
    equipment: Optional[str] = None,
    search: Optional[str] = None,
    min_rpn: Optional[int] = None,
) -> list:
    """Apply list filters to the static failure mode library."""
    results = FAILURE_MODES_LIBRARY.copy()
    if search:
        search_lower = search.lower()
        results = [
            fm
            for fm in results
            if (
                search_lower in fm["failure_mode"].lower()
                or search_lower in fm["equipment"].lower()
                or search_lower in fm["category"].lower()
                or any(search_lower in kw.lower() for kw in fm.get("keywords", []))
            )
        ]
    if category and category.lower() != "all":
        results = [fm for fm in results if fm["category"].lower() == category.lower()]
    if equipment:
        results = [fm for fm in results if fm["equipment"].lower() == equipment.lower()]
    if min_rpn:
        results = [fm for fm in results if fm["rpn"] >= min_rpn]
    results.sort(key=lambda x: -x["rpn"])
    return results


def list_uses_static_library_fallback(
    *,
    category: Optional[str] = None,
    equipment: Optional[str] = None,
    search: Optional[str] = None,
    min_rpn: Optional[int] = None,
    equipment_type_id: Optional[str] = None,
    mechanism: Optional[str] = None,
    is_validated: Optional[bool] = None,
    failure_mode_type: Optional[str] = None,
) -> bool:
    """Use bundled library when Mongo is sparse (e.g. CI) and no list filters are set."""
    return not any(
        (
            category,
            equipment,
            search,
            min_rpn,
            equipment_type_id,
            mechanism,
            is_validated is not None,
            failure_mode_type,
        )
    )
