from services.maintenance_scheduler_disabled import (
    PROGRAM_DISABLE_CANCEL_NOTES,
    annotate_incorporated_pm_import_tasks,
    scheduled_task_program_keys,
    task_disabled_in_program,
)


def test_task_disabled_in_program_from_cancel_note():
    task = {
        "equipment_id": "eq-1",
        "status": "cancelled",
        "notes": next(iter(PROGRAM_DISABLE_CANCEL_NOTES)),
    }
    assert task_disabled_in_program(task, set()) is True


def test_task_disabled_in_program_from_inactive_program_key():
    task = {
        "equipment_id": "eq-1",
        "v2_task_id": "task-42",
        "status": "scheduled",
    }
    inactive = {("eq-1", "task-42")}
    assert task_disabled_in_program(task, inactive) is True


def test_task_not_disabled_when_active():
    task = {
        "equipment_id": "eq-1",
        "v2_task_id": "task-42",
        "status": "scheduled",
    }
    assert task_disabled_in_program(task, set()) is False


def test_scheduled_task_program_keys_collects_refs():
    keys = scheduled_task_program_keys(
        {
            "equipment_id": "eq-1",
            "v2_task_id": "v2-1",
            "pm_import_task_id": "sess:task-1",
            "maintenance_program_id": "prog-1",
        }
    )
    assert ("eq-1", "v2-1") in keys
    assert ("eq-1", "sess:task-1") in keys
    assert ("eq-1", "prog-1") in keys


def test_incorporated_pm_import_relabels_schedule_task_source():
    tasks = [
        {
            "id": "st-1",
            "pm_import_task_id": "sess:task-1",
            "task_source": "customer_imported",
        },
        {
            "id": "st-2",
            "pm_import_task_id": "sess:task-2",
            "task_source": "customer_imported",
        },
    ]
    annotate_incorporated_pm_import_tasks(tasks, {"sess:task-1"})
    assert tasks[0]["task_source"] == "strategy_generated"
    assert tasks[0]["pm_import_incorporated"] is True
    assert tasks[1]["task_source"] == "customer_imported"
    assert "pm_import_incorporated" not in tasks[1]
