"""Wave 13 — ai_routes extraction and task_service graph dispatch."""
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def test_ai_routes_is_thin_orchestrator():
    path = BACKEND_ROOT / "routes" / "ai_routes.py"
    text = path.read_text(encoding="utf-8")
    assert "from database import db" not in text
    assert "from services import ai_risk_service as svc" in text
    assert len(text.splitlines()) < 180, f"ai_routes should be thin, got {len(text.splitlines())} LOC"


def test_ai_risk_service_holds_endpoint_logic():
    path = BACKEND_ROOT / "services" / "ai_risk_service.py"
    text = path.read_text(encoding="utf-8")
    assert "async def analyze_threat_risk" in text
    assert "find_threat" in text
    assert "@router" not in text


def test_task_service_uses_dispatch_graph_sync():
    text = (BACKEND_ROOT / "services" / "task_service.py").read_text(encoding="utf-8")
    start = text.index("async def _sync_reliability_graph_on_complete")
    end = text.index("async def _create_observation_from_task")
    block = text[start:end]
    assert "dispatch_graph_sync" in block
    assert "sync_edges_for_scheduled_task(" not in block
    assert "sync_task_instance_completion_edges(" not in block
