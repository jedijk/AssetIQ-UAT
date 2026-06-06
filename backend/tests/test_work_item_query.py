"""Month 2: work-item query and job handler tests."""
import asyncio

import pytest
from datetime import datetime, timezone

from services.work_item_query import (
    _build_scheduled_task_query,
    _user_can_see_item,
    serialize_scheduled_task_as_work_item,
)


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


def test_apply_strategy_handler_requires_payload():
    from services.job_handlers import handle_apply_strategy

    with pytest.raises(ValueError, match="equipment_type_id"):
        asyncio.run(handle_apply_strategy({"payload": {}}))
