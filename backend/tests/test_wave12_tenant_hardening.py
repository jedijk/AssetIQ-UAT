"""Wave 12 — AI extract/FM tenant scoping and scheduler graph dispatch."""
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def test_ai_extract_route_is_green_and_uses_queries():
    from architecture.convergence_registry import GREEN_ROUTES

    rel = "routes/ai_extract.py"
    assert rel in GREEN_ROUTES
    text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
    assert "from database import db" not in text
    assert "ai_extract_queries" in text


def test_ai_fm_suggestions_route_is_green_and_uses_queries():
    from architecture.convergence_registry import GREEN_ROUTES

    rel = "routes/ai_fm_suggestions.py"
    assert rel in GREEN_ROUTES
    text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
    assert "from database import db" not in text
    assert "ai_fm_queries" in text


def test_scheduler_tasks_use_dispatch_graph_sync():
    text = (BACKEND_ROOT / "services/maintenance_scheduler_service.py").read_text(encoding="utf-8")
    assert "dispatch_graph_sync" in text
    assert "sync_edges_for_scheduled_task(" not in text


def test_scheduler_shared_applies_tenant_scope():
    scope_text = (BACKEND_ROOT / "services/maintenance_scheduler_scope.py").read_text(encoding="utf-8")
    shared_text = (BACKEND_ROOT / "routes/maintenance_scheduler/_shared.py").read_text(encoding="utf-8")
    assert "scheduler_scoped" in scope_text
    assert "merge_tenant_filter" in scope_text
    assert "scheduler_scoped" in shared_text
