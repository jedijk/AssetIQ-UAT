"""Tests for investigation action_items → central_actions bridge (Phase 1C)."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

from services.investigation_action_bridge import (
    _map_status,
    action_item_to_central_doc,
)


def test_map_status_normalizes_closed():
    assert _map_status("closed") == "completed"
    assert _map_status("completed") == "completed"
    assert _map_status("in_progress") == "in_progress"
    assert _map_status(None) == "open"


def test_action_item_to_central_doc_preserves_id_and_links():
    inv = {
        "id": "inv-1",
        "title": "Pump seal failure",
        "case_number": "INV-2026-0001",
        "threat_id": "threat-9",
        "asset_id": "eq-1",
        "asset_name": "Pump A",
        "created_by": "user-1",
    }
    item = {
        "id": "act-uuid-1",
        "investigation_id": "inv-1",
        "action_number": "ACT-001",
        "description": "Replace seal kit",
        "owner": "Alex",
        "priority": "high",
        "status": "open",
        "action_type": "CM",
        "discipline": "rotating",
        "linked_cause_id": "cause-1",
        "comment": "Urgent",
        "created_at": "2026-06-01T00:00:00+00:00",
        "updated_at": "2026-06-01T00:00:00+00:00",
        "tenant_id": "co-1",
    }
    central = action_item_to_central_doc(item, inv, created_by="user-1")
    assert central["id"] == "act-uuid-1"
    assert central["title"] == "Replace seal kit"
    assert central["source_type"] == "investigation"
    assert central["source_id"] == "inv-1"
    assert central["linked_investigation_id"] == "inv-1"
    assert central["investigation_action_item"] is True
    assert central["threat_id"] == "threat-9"
    assert central["linked_equipment_id"] == "eq-1"
    assert central["linked_cause_id"] == "cause-1"
    assert central["assignee"] == "Alex"
    assert central["tenant_id"] == "co-1"
