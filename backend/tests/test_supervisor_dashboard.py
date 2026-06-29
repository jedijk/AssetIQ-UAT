"""Supervisor Command Center — service unit tests."""
import os
from pathlib import Path

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017/assetiq_test")

from services.supervisor_dashboard_service import (
    compute_queue_priority,
    priority_tier_from_score,
    _is_escalating_threat,
    _is_open_threat,
    get_supervisor_dashboard,
)

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def test_compute_queue_priority_weights():
    high = compute_queue_priority(
        exposure=80,
        criticality=70,
        threat_score=90,
        graph_risk=60,
    )
    low = compute_queue_priority(
        exposure=10,
        criticality=10,
        threat_score=10,
        graph_risk=10,
    )
    assert high > low
    assert 0 <= high <= 100


def test_compute_queue_priority_overdue_boost():
    base = compute_queue_priority(criticality=40)
    boosted = compute_queue_priority(criticality=40, overdue_boost=15)
    assert boosted == base + 15


def test_priority_tier_from_score():
    assert priority_tier_from_score(75) == "high"
    assert priority_tier_from_score(60) == "high"
    assert priority_tier_from_score(45) == "medium"
    assert priority_tier_from_score(35) == "medium"
    assert priority_tier_from_score(20) == "low"


def test_threat_filters():
    assert _is_open_threat({"status": "Open"})
    assert not _is_open_threat({"status": "Closed"})
    assert _is_escalating_threat({"status": "Open", "risk_level": "High"})
    assert _is_escalating_threat({"status": "open", "risk_score": 75})
    assert not _is_escalating_threat({"status": "Open", "risk_level": "Low", "risk_score": 10})


def test_supervisor_dashboard_service_callable():
    assert callable(get_supervisor_dashboard)


def test_supervisor_route_is_thin():
    text = (BACKEND_ROOT / "routes" / "ril" / "dashboard.py").read_text(encoding="utf-8")
    assert '"/supervisor"' in text
    assert "supervisor_dashboard_service" in text
