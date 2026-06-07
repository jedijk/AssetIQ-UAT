"""PM import task counting helpers for intelligence map task sources."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

from routes.intelligence_map import (
    PM_IMPORT_ACTIVE_TASK_MATCH,
    PM_IMPORT_EQUIPMENT_LINKED_TASK_MATCH,
    PM_IMPORT_IMPORTED_TASK_MATCH,
    _normalize_equipment_tags,
    _pm_import_equipment_linked_task_match,
    _pm_import_imported_task_match,
    _pm_import_task_match,
)


def test_pm_import_imported_task_match_without_equipment_scope():
    match = _pm_import_imported_task_match(None, None)
    assert match == PM_IMPORT_IMPORTED_TASK_MATCH
    assert match["tasks_extracted.review_status"] == {"$ne": "rejected"}


def test_pm_import_imported_task_match_with_equipment_scope():
    match = _pm_import_imported_task_match(["eq-1", "eq-2"], ["P-101", "HX-201"])
    assert match["tasks_extracted.review_status"] == {"$ne": "rejected"}
    assert "$or" in match
    assert {"tasks_extracted.equipment_match.equipment_id": {"$in": ["eq-1", "eq-2"]}} in match["$or"]
    tag_exprs = [clause for clause in match["$or"] if "$expr" in clause]
    assert len(tag_exprs) == 2


def test_pm_import_imported_task_match_equipment_ids_only():
    match = _pm_import_imported_task_match(["eq-1"], None)
    assert match["$or"] == [
        {"tasks_extracted.equipment_match.equipment_id": {"$in": ["eq-1"]}},
    ]


def test_normalize_equipment_tags_dedupes_and_uppercases():
    assert _normalize_equipment_tags(["p-101", " P-101 ", "", None]) == ["P-101"]


def test_pm_import_equipment_linked_task_match_without_equipment_scope():
    match = _pm_import_equipment_linked_task_match(None)
    assert match == PM_IMPORT_EQUIPMENT_LINKED_TASK_MATCH
    assert match["tasks_extracted.equipment_match.equipment_id"] == {"$ne": None}
    assert "implemented" in match["$or"][1]["tasks_extracted.review_status"]["$in"]


def test_pm_import_equipment_linked_task_match_with_equipment_scope():
    match = _pm_import_equipment_linked_task_match(["eq-1", "eq-2"])
    assert match["tasks_extracted.equipment_match.equipment_id"] == {"$in": ["eq-1", "eq-2"]}
    assert "$or" in match


def test_pm_import_task_match_alias_uses_equipment_linked():
    assert _pm_import_task_match(None) == PM_IMPORT_ACTIVE_TASK_MATCH
    assert PM_IMPORT_ACTIVE_TASK_MATCH == PM_IMPORT_EQUIPMENT_LINKED_TASK_MATCH
