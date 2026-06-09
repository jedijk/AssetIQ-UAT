"""Unit tests for chat threat response normalization."""

from routes.chat import _threat_to_response


def test_threat_to_response_fills_missing_required_fields():
    threat = {
        "id": "t1",
        "title": "Pump - Leak",
        "asset": "Pump A",
        "equipment_type": "Pump",
        "failure_mode": "Seal leak",
        "risk_level": "medium",
        "risk_score": 42.0,
        "recommended_actions": None,
    }
    resp = _threat_to_response(threat)
    assert resp.id == "t1"
    assert resp.risk_score == 42
    assert resp.recommended_actions == []
    assert resp.rank == 1
    assert resp.total_threats == 1
