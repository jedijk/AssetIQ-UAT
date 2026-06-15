"""Tests for unified work-signal projection."""
import pytest

pytestmark = pytest.mark.unit

from services.work_signal_projection import (
    normalize_work_signal,
    project_detail,
    project_list_item,
)


def test_normalize_work_signal_from_threat_doc():
    doc = {
        "id": "obs-1",
        "title": "Bearing noise",
        "status": "Open",
        "linked_equipment_id": "eq-1",
        "asset": "Pump P-101",
        "risk_score": 72,
        "risk_level": "High",
        "created_at": "2026-05-01T12:00:00+00:00",
    }
    signal = normalize_work_signal(doc)
    assert signal["id"] == "obs-1"
    assert signal["status_bucket"] == "open"
    assert signal["equipment_id"] == "eq-1"
    assert signal["risk_score"] == 72


def test_project_list_item_is_compact():
    item = project_list_item({"id": "x", "title": "Leak", "status": "closed", "risk_score": 10})
    assert set(item.keys()) == {
        "id", "title", "status", "status_bucket", "equipment_id",
        "equipment_name", "risk_score", "risk_level", "created_at", "threat_number",
    }


def test_project_detail_includes_description():
    detail = project_detail({"id": "x", "title": "Leak", "description": "Seal failed"})
    assert detail["description"] == "Seal failed"
