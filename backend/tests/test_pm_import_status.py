"""PM import display status normalization."""
from services.pm_import_constants import (
    is_pm_import_incorporated_into_strategy,
    normalize_pm_import_display_status,
)
from services.pm_import_service import is_pm_import_review_accepted


def test_normalize_pending():
    assert normalize_pm_import_display_status({"import_status": "pending"}) == "pending"
    assert normalize_pm_import_display_status({"review_status": "accepted"}) == "pending"


def test_review_accepted_by_default():
    assert is_pm_import_review_accepted({"review_status": "pending"}) is True
    assert is_pm_import_review_accepted({"review_status": "accepted"}) is True
    assert is_pm_import_review_accepted({}) is True
    assert is_pm_import_review_accepted({"review_status": "rejected"}) is False


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


def test_is_pm_import_incorporated_into_strategy():
    assert is_pm_import_incorporated_into_strategy({"import_status": "pending"}) is False
    assert is_pm_import_incorporated_into_strategy({"import_status": "applied"}) is True
    assert is_pm_import_incorporated_into_strategy({"import_status": "merged"}) is True
    assert is_pm_import_incorporated_into_strategy(
        {"import_status": "implemented", "apply_mode": "replaced"}
    ) is True
    assert is_pm_import_incorporated_into_strategy(
        {"import_status": "implemented", "apply_mode": "added"}
    ) is True
