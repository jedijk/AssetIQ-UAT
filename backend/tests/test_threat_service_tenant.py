"""Tenant-scoped threat reads in threat_service."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.threat_helpers import _find_threat_scoped
from services.threat_crud import update_threat

USER = {"company_id": "co-1", "id": "user-1", "role": "owner"}


@pytest.mark.asyncio
async def test_find_threat_scoped_uses_merge_tenant_filter():
    mock_db = MagicMock()
    mock_db.threats = MagicMock()
    mock_db.threats.find_one = AsyncMock(return_value={"id": "t-1", "status": "open"})

    with patch("services.threat_helpers.db", mock_db):
        result = await _find_threat_scoped(USER, "t-1")

    assert result["id"] == "t-1"
    filt = mock_db.threats.find_one.call_args[0][0]
    assert filt["$and"][0] == {"id": "t-1"}
    tenant_part = filt["$and"][1]
    if "$or" in tenant_part:
        assert {"tenant_id": "co-1"} in tenant_part["$or"]
    else:
        assert tenant_part == {"tenant_id": "co-1"}


@pytest.mark.asyncio
async def test_update_threat_scoped_update_filter():
    mock_db = MagicMock()
    mock_db.threats = MagicMock()
    mock_db.observations = MagicMock()
    threat_open = {"id": "t-1", "status": "open", "likelihood": "Possible", "detectability": "Moderate"}
    threat_closed = {"id": "t-1", "status": "closed", "risk_score": 30}
    mock_db.threats.find_one = AsyncMock(
        side_effect=[threat_open, threat_open, threat_closed, threat_closed]
    )
    mock_db.observations.find_one = AsyncMock(return_value={"id": "t-1", "description": "Test"})
    mock_db.threats.update_one = AsyncMock()
    mock_db.observations.update_one = AsyncMock()
    graph_sync = AsyncMock()

    with patch("services.threat_crud.db", mock_db), patch(
        "services.threat_helpers.db", mock_db
    ), patch("services.work_signal_lifecycle.db", mock_db), patch(
        "services.threat_crud.assert_threat_installation_scope", AsyncMock()
    ), patch(
        "services.threat_crud.update_all_ranks", AsyncMock()
    ), patch(
        "services.reliability_graph.dispatch_graph_sync",
        graph_sync,
    ), patch("services.threat_crud.cache.invalidate_stats"), patch(
        "services.dashboard_read_model_hooks.notify_dashboard_data_changed", AsyncMock()
    ):
        result = await update_threat(USER, "t-1", {"status": "closed"})

    assert result["status"] == "closed"
    update_filter = mock_db.threats.update_one.call_args[0][0]
    assert update_filter["$and"][0] == {"id": "t-1"}
