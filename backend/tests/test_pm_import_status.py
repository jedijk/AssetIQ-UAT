"""PM import display status normalization."""
from services.pm_import_service import normalize_pm_import_display_status


def test_normalize_pending():
    assert normalize_pm_import_display_status({"import_status": "pending"}) == "pending"
    assert normalize_pm_import_display_status({"review_status": "accepted"}) == "pending"


def test_normalize_applied():
    assert normalize_pm_import_display_status({"import_status": "applied"}) == "applied"
    assert normalize_pm_import_display_status(
        {"import_status": "implemented", "apply_mode": "added"}
    ) == "applied"


def test_normalize_merged():
    assert normalize_pm_import_display_status({"import_status": "merged"}) == "merged"
    assert normalize_pm_import_display_status(
        {"import_status": "implemented", "apply_mode": "replaced"}
    ) == "merged"
    assert normalize_pm_import_display_status(
        {"import_status": "implemented", "apply_mode": "existing"}
    ) == "merged"
