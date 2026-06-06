"""Tests for ReliabilityContextService prompt formatting."""
from services.reliability_context_service import format_context_for_prompt


def test_format_context_not_found():
    text = format_context_for_prompt({"equipment_id": "missing", "found": False})
    assert "missing" in text
    assert "not found" in text.lower()


def test_format_context_includes_sections():
    ctx = {
        "found": True,
        "equipment": {"id": "e1", "name": "Pump A", "tag": "P-100"},
        "program_task_count": 12,
        "strategy_version": "v3",
        "graph": {
            "edge_count": 4,
            "paths": [["equipment:e1", "-[scheduled_for]->", "scheduled_task:st-1"]],
            "path_entries": [
                {
                    "edge_id": "edge-1",
                    "relation": "scheduled_for",
                    "source": "scheduled_task:st-1",
                    "target": "equipment:e1",
                }
            ],
        },
        "twin_snapshot": {
            "latest": {
                "snapshot_at": "2026-06-06T00:00:00+00:00",
                "health_score": 72,
                "open_threat_count": 2,
                "overdue_pm_count": 1,
                "edge_fingerprint": "abc123",
            },
            "delta": {
                "health_score": -5,
                "open_threat_count": 1,
                "overdue_pm_count": 0,
                "edge_fingerprint_changed": False,
            },
        },
        "failure_modes": [{"failure_mode_name": "Seal leak", "strategy_type": "PM"}],
        "open_work_items": [{"status": "overdue", "title": "Inspect seal", "due_date": "2026-06-01"}],
        "open_threats": [{"title": "Vibration", "risk_level": "High", "risk_score": 80}],
    }
    text = format_context_for_prompt(ctx)
    assert "Pump A" in text
    assert "Seal leak" in text
    assert "edge-1" in text
    assert "Twin snapshot" in text
    assert "Week-over-week delta" in text
