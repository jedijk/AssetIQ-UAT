"""Wave 15 — scheduler write paths and remaining scheduler routes."""
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent

SCHEDULER_GREEN = (
    "routes/maintenance_scheduler/tasks.py",
    "routes/maintenance_scheduler/technicians.py",
    "routes/maintenance_scheduler/programs.py",
    "routes/maintenance_scheduler/ai_planner.py",
)


def test_scheduler_write_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    for rel in SCHEDULER_GREEN:
        assert rel in GREEN_ROUTES
        text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
        assert "from database import db" not in text


def test_tasks_route_delegates_writes_to_service():
    text = (BACKEND_ROOT / "routes/maintenance_scheduler/tasks.py").read_text(encoding="utf-8")
    assert "maintenance_scheduler_service" in text
    assert "update_scheduled_task" in text
    assert "complete_scheduled_task" in text
    assert "defer_scheduled_task" in text
    assert len(text.splitlines()) < 100


def test_scheduler_service_has_task_lifecycle():
    from services import maintenance_scheduler_service as svc

    assert callable(svc.update_scheduled_task)
    assert callable(svc.complete_scheduled_task)
    assert callable(svc.defer_scheduled_task)
    assert callable(svc.list_technicians)
    assert callable(svc.get_programs_summary)


def test_scheduler_service_uses_dispatch_graph_sync():
    text = (BACKEND_ROOT / "services/maintenance_scheduler_service.py").read_text(encoding="utf-8")
    assert "dispatch_graph_sync" in text
    start = text.index("async def complete_scheduled_task")
    end = text.index("async def defer_scheduled_task")
    block = text[start:end]
    assert "_dispatch_scheduled_task_graph" in block
    assert "sync_edges_for_scheduled_task(" not in block


def test_ai_planner_service_exists():
    from services import maintenance_scheduler_ai_service as ai_svc

    assert callable(ai_svc.ai_plan_tasks)
    assert callable(ai_svc.apply_ai_plan)

    route_text = (BACKEND_ROOT / "routes/maintenance_scheduler/ai_planner.py").read_text(encoding="utf-8")
    assert "maintenance_scheduler_ai_service" in route_text
    assert "@router" in route_text
