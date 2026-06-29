"""Tests for equipment PM compliance service."""
import pytest
from datetime import datetime, timedelta, timezone

from services.equipment_pm_compliance_service import (
    _build_ai_summary,
    _is_pm_task,
    _normalize_execution,
    _technician_feedback,
)


def test_is_pm_task_recognizes_preventive_types():
    assert _is_pm_task({"task_type": "PM"})
    assert _is_pm_task({"task_type": "preventive_maintenance"})
    assert not _is_pm_task({"task_type": "corrective"})


def test_technician_feedback_merges_close_out_fields():
    doc = {
        "completion_notes": "Seal replaced",
        "follow_up_notes": "Monitor vibration",
    }
    assert "Seal replaced" in _technician_feedback(doc)
    assert "Monitor vibration" in _technician_feedback(doc)


def test_normalize_execution_includes_feedback():
    ex = _normalize_execution(
        {
            "id": "t1",
            "name": "Oil change",
            "status": "completed",
            "task_type": "PM",
            "completion_notes": "Oil level OK",
        },
        "scheduled_tasks",
    )
    assert ex["technician_feedback"] == "Oil level OK"
    assert ex["title"] == "Oil change"


def test_build_ai_summary_includes_compliance_and_feedback():
    summary = _build_ai_summary(
        equipment_name="Pump A",
        compliance_pct=66.7,
        completed=2,
        total=3,
        overdue=1,
        executions=[
            {
                "title": "Inspect bearings",
                "status": "completed",
                "technician_feedback": "Minor wear noted",
            }
        ],
    )
    assert "66%" in summary or "67%" in summary
    assert "Pump A" in summary
    assert "Minor wear noted" in summary
    assert "overdue" in summary.lower()


def test_build_ai_summary_no_tasks():
    summary = _build_ai_summary(
        equipment_name="Pump B",
        compliance_pct=0,
        completed=0,
        total=0,
        overdue=0,
        executions=[],
    )
    assert "No preventive maintenance" in summary
    assert "Pump B" in summary
