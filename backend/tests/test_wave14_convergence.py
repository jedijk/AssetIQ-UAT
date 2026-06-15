"""Wave 14 — graph dispatch cleanup and scheduler read service extraction."""
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def test_apply_strategy_uses_graph_dispatch():
    text = (BACKEND_ROOT / "services" / "apply_strategy_service.py").read_text(encoding="utf-8")
    assert "dispatch_graph_sync" in text
    assert '"sync_edges_for_apply_strategy"' in text
    assert "graph_sync_async_enabled()" in text


def test_apply_strategy_handler_registered():
    from services.domain_events import DomainEventType, GRAPH_EVENT_TYPES
    from services.reliability_graph import GRAPH_SYNC_HANDLERS

    assert DomainEventType.GRAPH_SYNC_APPLY_STRATEGY.value in {
        e.value for e in GRAPH_EVENT_TYPES
    }
    assert "sync_edges_for_apply_strategy" in GRAPH_SYNC_HANDLERS


def test_scheduler_read_routes_are_thin():
    for rel in (
        "routes/maintenance_scheduler/dashboard.py",
        "routes/maintenance_scheduler/timeline.py",
    ):
        text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
        assert "from database import db" not in text
        assert "maintenance_scheduler_service" in text


def test_maintenance_scheduler_service_has_read_endpoints():
    from services import maintenance_scheduler_service as svc

    assert callable(svc.get_dashboard_kpis)
    assert callable(svc.get_timeline)
    assert callable(svc.list_scheduled_tasks)
    assert callable(svc.get_daily_planner)
    assert callable(svc.get_weekly_planner)


def test_chat_threat_graph_dispatch_includes_tenant():
    chat_text = (BACKEND_ROOT / "services" / "chat_routes_service.py").read_text(encoding="utf-8")
    start = chat_text.index("async def _create_observation")
    end = chat_text.index("# Auto-create actions")
    block = chat_text[start:end]
    assert "create_work_signal" in block

    lifecycle_text = (BACKEND_ROOT / "services" / "work_signal_lifecycle.py").read_text(
        encoding="utf-8"
    )
    assert "with_tenant_id" in lifecycle_text
