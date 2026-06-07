"""Schedules missing frequency helpers for intelligence map."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

from routes.intelligence_map import (
    _intelligence_map_schedule_query,
    _schedules_missing_frequency_filter,
    _serialize_scheduled_task_missing_frequency,
)


def test_intelligence_map_schedule_query_empty():
    assert _intelligence_map_schedule_query() == {}


def test_intelligence_map_schedule_query_with_filters():
    assert _intelligence_map_schedule_query("et-1", "eq-1") == {
        "equipment_type_id": "et-1",
        "equipment_id": "eq-1",
    }


def test_schedules_missing_frequency_filter_merges_scope():
    base = {"equipment_id": "eq-1"}
    result = _schedules_missing_frequency_filter(base)
    assert result["equipment_id"] == "eq-1"
    assert result["$or"] == [
        {"frequency": None},
        {"frequency": ""},
        {"frequency": {"$exists": False}},
    ]


def test_serialize_scheduled_task_missing_frequency():
    doc = {
        "id": "st-1",
        "task_name": "Inspect pump",
        "equipment_name": "Pump A",
        "equipment_tag": "P-101",
        "equipment_id": "eq-1",
        "status": "scheduled",
        "task_source": "strategy",
        "due_date": "2026-06-01",
        "maintenance_program_id": "mp-1",
    }
    assert _serialize_scheduled_task_missing_frequency(doc) == {
        "id": "st-1",
        "task_name": "Inspect pump",
        "equipment_name": "Pump A",
        "equipment_tag": "P-101",
        "equipment_id": "eq-1",
        "status": "scheduled",
        "task_source": "strategy",
        "due_date": "2026-06-01",
        "maintenance_program_id": "mp-1",
    }
