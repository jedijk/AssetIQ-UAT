"""
Regression tests for the Task Generation cron gate on My Tasks.

Product rule (Settings → Task Generation):
- Cron DISABLED → no maintenance-program task_instances may appear on My Tasks.
- Cron ENABLED → they appear normally.
- ``ensure_task_instance_for_scheduled_task`` must NOT silently insert
  task_instances. Only the weekly cron's
  ``sync_scheduled_tasks_to_instances`` is permitted to create them.
"""
from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://action-lockup-bug.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

OWNER_EMAIL = "jedijk@gmail.com"
OWNER_PASSWORD = "Jaap8019@"


@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Owner login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in login response: {data}"
    return tok


def _set_cron(enabled: bool, token: str) -> None:
    r = requests.put(
        f"{API}/admin/task-generation/schedule",
        json={"enabled": enabled},
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    assert r.status_code == 200, f"PUT schedule failed: {r.status_code} {r.text}"


def _list_my_tasks(token: str, filter_name: str = "open"):
    r = requests.get(
        f"{API}/my-tasks?filter={filter_name}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    assert r.status_code == 200, f"GET my-tasks failed: {r.status_code} {r.text}"
    return r.json().get("tasks", [])


def test_my_tasks_excludes_maintenance_when_cron_disabled(owner_token):
    """With cron OFF, source=='maintenance' instances must be filtered out."""
    # Run the test against current DB state (UAT seeded with maintenance leaks).
    # First save current cron state so we can restore it.
    current = requests.get(
        f"{API}/admin/task-generation/schedule",
        headers={"Authorization": f"Bearer {owner_token}"},
        timeout=30,
    ).json()
    original_enabled = current.get("enabled", True)

    try:
        _set_cron(False, owner_token)
        tasks = _list_my_tasks(owner_token, "open")
        maintenance_leaks = [
            t
            for t in tasks
            # The serializer rewrites `source` based on flags, but the DB row's
            # source=="maintenance" maps to `is_unbridged_maintenance == False`
            # plus a scheduled_task_id. So we use scheduled_task_id + the
            # source signal as the leak fingerprint.
            if t.get("source") == "maintenance"
            or (
                t.get("scheduled_task_id")
                and not t.get("is_unbridged_maintenance", False)
            )
        ]
        assert maintenance_leaks == [], (
            "Maintenance-program task_instances must not appear on My Tasks "
            f"while cron is disabled — leaked: {len(maintenance_leaks)}"
        )
    finally:
        _set_cron(original_enabled, owner_token)


def test_ensure_task_instance_does_not_silently_insert():
    """Direct unit-level: the resolver must never create new task_instances."""
    # Run inline via asyncio to avoid the pytest-asyncio plugin requirement.
    from database import db
    from services.task_instance_bridge import ensure_task_instance_for_scheduled_task

    async def _run():
        sched_id = f"sched-test-{uuid4()}"
        await db.scheduled_tasks.insert_one(
            {
                "id": sched_id,
                "task_name": "Should never auto-bridge",
                "status": "scheduled",
                "due_date": (
                    datetime.now(timezone.utc) + timedelta(days=1)
                ).date().isoformat(),
                "task_source": "strategy_generated",
            }
        )
        try:
            result = await ensure_task_instance_for_scheduled_task(sched_id)
            assert result is None, (
                "ensure_task_instance_for_scheduled_task must return None when "
                "no task_instance exists — it must not insert one on demand"
            )
            cnt = await db.task_instances.count_documents(
                {"scheduled_task_id": sched_id}
            )
            assert cnt == 0, (
                "ensure_task_instance_for_scheduled_task must not silently "
                "create task_instances; only the weekly cron is allowed."
            )
        finally:
            await db.scheduled_tasks.delete_one({"id": sched_id})
            await db.task_instances.delete_many({"scheduled_task_id": sched_id})

    asyncio.get_event_loop().run_until_complete(_run())
