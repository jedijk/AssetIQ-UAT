"""Unit tests for threat list normalization helpers."""
from services.threat_helpers import normalize_threat_list_items


def test_normalize_threat_list_items_fills_sparse_chat_projection():
    sparse = {
        "id": "obs-chat-1",
        "description": "Unusual noise from conveyor",
        "projection_of": "observation",
        "source": "chat",
    }
    out = normalize_threat_list_items([sparse])
    item = out[0]
    assert item["title"] == "Unusual noise from conveyor"
    assert item["asset"] == "Unlinked"
    assert item["failure_mode"] == "Unclassified"
    assert item["risk_level"] == "medium"
    assert item["risk_score"] == 0
    assert item["status"] == "Observation"
    assert item["created_by"] == "unknown"
    assert item["created_at"] == ""
    assert item["recommended_actions"] == []
