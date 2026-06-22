"""Wave 26 — intelligence map routes extraction."""
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def test_intelligence_map_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    rel = "routes/intelligence_map.py"
    assert rel in GREEN_ROUTES
    text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
    assert "from database import db" not in text


def test_routes_delegate_to_service():
    text = (BACKEND_ROOT / "routes/intelligence_map.py").read_text(encoding="utf-8")
    assert "intelligence_map_routes_service" in text
    assert "_library_read = require_permission" in text
    assert len(text.splitlines()) < 85


def test_service_exists():
    from services import intelligence_map_routes_service as svc

    assert callable(svc.get_intelligence_map_stats)
    assert callable(svc.get_schedules_missing_frequency)
    assert callable(svc.get_intelligence_map_filters)
    assert callable(svc.get_strategy_intelligence_context)


def test_routes_reexport_helpers():
    from routes.intelligence_map import (
        PM_IMPORT_IMPORTED_TASK_MATCH,
        _intelligence_map_schedule_query,
    )

    assert PM_IMPORT_IMPORTED_TASK_MATCH["tasks_extracted.review_status"] == {"$ne": "rejected"}
    assert _intelligence_map_schedule_query() == {}
