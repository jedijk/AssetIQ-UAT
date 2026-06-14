"""Wave 19 — RIL route extraction."""
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent

RIL_GREEN = (
    "routes/ril/observations.py",
    "routes/ril/readings.py",
    "routes/ril/alerts.py",
    "routes/ril/correlations.py",
    "routes/ril/predictions.py",
    "routes/ril/cases.py",
    "routes/ril/copilot.py",
)


def test_ril_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    for rel in RIL_GREEN:
        assert rel in GREEN_ROUTES
        text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
        assert "from database import db" not in text


def test_ril_routes_use_service_factory():
    for rel in RIL_GREEN:
        text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
        assert "ril_service_factory" in text


def test_ril_service_has_route_helpers():
    from services.ril_service import RILService

    assert callable(RILService.get_observation_doc)
    assert callable(RILService.list_readings)
    assert callable(RILService.get_case_detail)
    assert callable(RILService.link_observation_to_case)


def test_all_ril_api_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    ril_green = [rel for rel in GREEN_ROUTES if rel.startswith("routes/ril/")]
    assert len(ril_green) == 8
