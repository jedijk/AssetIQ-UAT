"""Observation/Threat convergence Phases 4–6 tests."""
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.observation_service import ObservationService

THREATS_ROUTE_SOURCE = (
    Path(__file__).resolve().parents[1] / "routes" / "threats.py"
).read_text()


def test_work_signals_router_registers_primary_and_deprecated_paths():
    assert '@router.get("/observations/signals"' in THREATS_ROUTE_SOURCE
    assert '@router.get("/threats"' in THREATS_ROUTE_SOURCE
    assert '@router.get("/observations/signals/top"' in THREATS_ROUTE_SOURCE
    assert '@router.get("/threats/top"' in THREATS_ROUTE_SOURCE
    assert '@router.get("/observations/signals/{signal_id}"' in THREATS_ROUTE_SOURCE
    assert '@router.get("/threats/{signal_id}"' in THREATS_ROUTE_SOURCE
    assert '@router.post("/observations/signals/recalculate-scores"' in THREATS_ROUTE_SOURCE
    assert '@router.post("/observations/signals/{signal_id}/improve-description"' in THREATS_ROUTE_SOURCE


def test_work_signals_router_uses_dual_permission_deps():
    assert 'require_any_permission("observations:read", "threats:read")' in THREATS_ROUTE_SOURCE
    assert 'require_any_permission("observations:write", "threats:write")' in THREATS_ROUTE_SOURCE
    assert 'require_any_permission("observations:delete", "threats:delete")' in THREATS_ROUTE_SOURCE
    assert "Depends(_signals_write)" in THREATS_ROUTE_SOURCE


@pytest.mark.asyncio
async def test_convert_threat_to_observation_returns_same_id():
    service = ObservationService(MagicMock())
    observation = {
        "id": "sig-42",
        "description": "Leak",
        "status": "open",
        "severity": "high",
    }
    ensure = AsyncMock(return_value=observation)

    with patch("services.work_signal_lifecycle.ensure_observation_for_signal", ensure):
        result = await service.convert_threat_to_observation(
            "sig-42", user={"company_id": "co-1"}
        )

    assert result is not None
    assert result["id"] == "sig-42"
    ensure.assert_awaited_once_with("sig-42", user={"company_id": "co-1"})


@pytest.mark.asyncio
async def test_create_observation_uses_create_work_signal():
    mock_db = MagicMock()
    service = ObservationService(mock_db)
    service._equipment_repo = MagicMock()
    service._equipment_repo.find_one = AsyncMock(return_value=None)
    service.failure_modes = MagicMock()
    service.failure_modes.find_one = AsyncMock(return_value=None)

    created = {
        "id": "sig-new",
        "observation": {
            "id": "sig-new",
            "description": "Vibration detected",
            "status": "open",
            "severity": "medium",
            "source": "manual",
        },
    }
    create_signal = AsyncMock(return_value=created)

    with patch("services.work_signal_lifecycle.create_work_signal", create_signal):
        result = await service.create_observation(
            {"description": "Vibration detected", "severity": "medium"},
            created_by="user-1",
            source="manual",
            user={"company_id": "co-1"},
        )

    assert result["id"] == "sig-new"
    create_signal.assert_awaited_once()
    kwargs = create_signal.call_args.kwargs
    assert kwargs["source"] == "manual"
    assert kwargs["graph_label"] == "observation_create"
    signal_doc = create_signal.call_args.args[0]
    assert signal_doc["description"] == "Vibration detected"
    assert signal_doc["severity"] == "medium"


@pytest.mark.asyncio
async def test_sync_observation_edges_skips_converged_self_link():
    from services.reliability_graph_entities import sync_observation_edges

    mock_upsert = AsyncMock()
    with patch("services.reliability_graph_entities.upsert_edge", mock_upsert):
        await sync_observation_edges(
            observation_id="sig-1",
            equipment_id="eq-1",
            threat_id="sig-1",
        )

    relations = [c.kwargs.get("relation") for c in mock_upsert.await_args_list]
    assert "observed_on" in relations
    assert "linked_to_threat" not in relations
    assert "escalated_to" not in relations
