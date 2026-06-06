"""Month 2: work-item query and job handler tests."""
import asyncio

import pytest
from datetime import datetime, timedelta, timezone

from services.work_item_query import (
    _build_scheduled_task_query,
    _merge_work_items_prefer_instances,
    _user_can_see_item,
    _work_item_dedupe_key,
    serialize_scheduled_task_as_work_item,
    serialize_task,
    serialize_action_as_task,
    work_item_sort_key,
)
from services.work_execution_config import work_items_source_mode
from services.tenant_schema import merge_tenant_filter


def test_serialize_scheduled_task_as_work_item_shape():
    item = serialize_scheduled_task_as_work_item(
        {
            "id": "st-1",
            "task_name": "Inspect seal",
            "due_date": "2026-06-10",
            "equipment_id": "eq-1",
            "equipment_name": "Pump A",
            "status": "scheduled",
        },
        canonical_discipline="mechanical",
        assigned_user_id="user-1",
        assignee="Alex",
    )
    assert item["id"] == "sched:st-1"
    assert item["scheduled_task_id"] == "st-1"
    assert item["source"] == "maintenance"
    assert item["source_type"] == "scheduled_task"
    assert item["discipline"] == "mechanical"
    assert item["assigned_user_id"] == "user-1"
    assert item["is_unbridged_maintenance"] is True


def test_user_visibility_matches_my_tasks():
    assert _user_can_see_item(None, "user-a") is True
    assert _user_can_see_item("user-a", "user-a") is True
    assert _user_can_see_item("user-b", "user-a") is False


def test_serialize_task_marks_non_unbridged():
    item = serialize_task({"_id": "abc", "title": "Check valve", "status": "pending"})
    assert item["source_type"] == "task"
    assert item["is_unbridged_maintenance"] is False


def test_serialize_action_as_task_shape():
    item = serialize_action_as_task({"id": "act-1", "title": "Fix leak", "status": "open"})
    assert item["source_type"] == "action"
    assert item["status"] == "planned"


def test_work_item_sort_key_prioritizes_risk():
    now = datetime(2026, 6, 5, 12, 0, tzinfo=timezone.utc)
    high = work_item_sort_key({"risk_score": 90, "status": "planned", "priority": "low"}, now)
    low = work_item_sort_key({"risk_score": 10, "status": "planned", "priority": "critical"}, now)
    assert high < low


def test_recurring_filter_excludes_maintenance_query():
    now = datetime(2026, 6, 5, 12, 0, tzinfo=timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start.replace(day=today_start.day + 1)
    assert _build_scheduled_task_query(
        filter_name="recurring",
        now=now,
        today_start=today_start,
        today_end=today_end,
        equipment_id=None,
    ) is None


def test_scheduled_task_query_scoped_by_tenant():
    now = datetime(2026, 6, 5, 12, 0, tzinfo=timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    base = _build_scheduled_task_query(
        filter_name="open",
        now=now,
        today_start=today_start,
        today_end=today_end,
        equipment_id=None,
    )
    merged = merge_tenant_filter(base, {"company_id": "co-1"})
    assert "$and" in merged
    assert merged["$and"][1]["$or"][0]["tenant_id"] == "co-1"


def test_work_item_dedupe_key_uses_scheduled_task_and_program():
    inst = {
        "scheduled_task_id": "st-1",
        "equipment_id": "eq-1",
        "v2_task_id": "task-1",
        "due_date": "2026-06-10",
    }
    unbridged = {
        "scheduled_task_id": "st-1",
        "equipment_id": "eq-1",
        "maintenance_program_id": "task-1",
        "due_date": "2026-06-10",
        "is_unbridged_maintenance": True,
    }
    assert _work_item_dedupe_key(inst) == _work_item_dedupe_key(unbridged)


def test_merge_prefers_task_instance_over_unbridged_duplicate():
    instance = serialize_task(
        {
            "_id": "ti-1",
            "title": "From instance",
            "scheduled_task_id": "st-9",
            "equipment_id": "eq-1",
            "v2_task_id": "prog-1",
            "due_date": "2026-06-10",
        }
    )
    unbridged = serialize_scheduled_task_as_work_item(
        {
            "id": "st-9",
            "task_name": "Unbridged",
            "due_date": "2026-06-10",
            "equipment_id": "eq-1",
            "maintenance_program_id": "prog-1",
        }
    )
    merged = _merge_work_items_prefer_instances([instance], [unbridged])
    assert len(merged) == 1
    assert merged[0]["is_unbridged_maintenance"] is False


def test_work_items_source_mode_defaults_hybrid(monkeypatch):
    monkeypatch.delenv("WORK_ITEMS_SOURCE", raising=False)
    assert work_items_source_mode() == "hybrid"


def test_work_items_source_mode_v2_instances(monkeypatch):
    monkeypatch.setenv("WORK_ITEMS_SOURCE", "v2_instances")
    assert work_items_source_mode() == "v2_instances"


def test_apply_strategy_handler_requires_payload():
    from services.job_handlers import handle_apply_strategy

    with pytest.raises(ValueError, match="equipment_type_id"):
        asyncio.run(handle_apply_strategy({"payload": {}}))
