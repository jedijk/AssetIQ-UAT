"""Wave 23 — failure modes routes extraction."""
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def test_failure_modes_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    rel = "routes/failure_modes_routes.py"
    assert rel in GREEN_ROUTES
    text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
    assert "from database import db" not in text


def test_routes_delegate_to_service():
    text = (BACKEND_ROOT / "routes/failure_modes_routes.py").read_text(encoding="utf-8")
    assert "failure_modes_routes_service" in text
    assert len(text.splitlines()) < 280


def test_service_exists():
    from services import failure_modes_routes_service as svc

    assert callable(svc.get_failure_modes)
    assert callable(svc.create_failure_mode)
    assert callable(svc.merge_failure_modes)
    assert callable(svc.export_failure_modes_excel)


def test_service_has_request_models():
    from services.failure_modes_routes_service import FailureModeCreate, MergeFailureModesRequest

    assert "failure_mode" in FailureModeCreate.model_fields
    assert "dry_run" in MergeFailureModesRequest.model_fields
