"""Phase 4: v2 scheduler source and strategy apply lifecycle."""
from services.scheduler_program_source import expand_v2_program_to_scheduler_rows


def test_expand_v2_program_active_task():
    program = {
        "id": "prog-1",
        "equipment_id": "eq-1",
        "equipment_name": "Pump",
        "equipment_type_id": "et-1",
        "status": "active",
        "source_strategy_version": "1.0",
        "tasks": [
            {
                "id": "task-1",
                "task_title": "Inspect bearings",
                "frequency": "monthly",
                "frequency_days": 30,
                "is_active": True,
                "task_source": "strategy_generated",
                "task_type": "preventive",
            }
        ],
    }
    rows = expand_v2_program_to_scheduler_rows(program, {"et-1"})
    assert len(rows) == 1
    assert rows[0]["id"] == "task-1"
    assert rows[0]["program_source"] == "v2"
    assert rows[0]["frequency_days"] == 30


def test_expand_v2_skips_inactive_and_reactive():
    program = {
        "id": "prog-1",
        "equipment_id": "eq-1",
        "equipment_type_id": "et-1",
        "status": "active",
        "tasks": [
            {"id": "t1", "task_title": "Off", "is_active": False, "frequency": "monthly"},
            {
                "id": "t2",
                "task_title": "CM",
                "is_active": True,
                "frequency": "monthly",
                "task_type": "corrective",
            },
        ],
    }
    rows = expand_v2_program_to_scheduler_rows(program, {"et-1"})
    assert rows == []


def test_expand_v2_strategy_task_requires_active_strategy_type():
    program = {
        "id": "prog-1",
        "equipment_id": "eq-1",
        "equipment_type_id": "et-missing",
        "status": "active",
        "tasks": [
            {
                "id": "task-1",
                "task_title": "Inspect",
                "frequency": "monthly",
                "is_active": True,
                "task_source": "strategy_generated",
            }
        ],
    }
    rows = expand_v2_program_to_scheduler_rows(program, {"et-1"})
    assert rows == []
