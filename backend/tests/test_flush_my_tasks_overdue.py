"""Tests for one-off My Tasks overdue flush helpers."""
from datetime import datetime, timezone

from services.flush_my_tasks_overdue import overdue_my_tasks_filters


def test_overdue_filters_include_scheduled_and_instances():
    now = datetime(2026, 6, 6, 15, 0, tzinfo=timezone.utc)
    filters = overdue_my_tasks_filters(now=now, include_actions=True)

    assert filters["scheduled_tasks"]["due_date"] == {"$lt": "2026-06-06"}
    assert filters["task_instances"]["$or"][0] == {"status": "overdue"}
    assert "central_actions" in filters


def test_overdue_filters_can_skip_actions():
    filters = overdue_my_tasks_filters(include_actions=False)
    assert "central_actions" not in filters


def test_overdue_filters_tenant_scope():
    filters = overdue_my_tasks_filters(tenant_id="co-1", include_actions=False)
    assert filters["scheduled_tasks"]["$and"][1]["tenant_id"] == "co-1"
