"""Tenant-scoped threat reads in threat_service."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.threat_service import _find_threat_scoped, update_threat

USER = {"company_id": "co-1", "id": "user-1", "role": "owner"}


@pytest.mark.asyncio
async def test_find_threat_scoped_uses_merge_tenant_filter():
    mock_db = MagicMock()
    mock_db.threats = MagicMock()
    mock_db.threats.find_one = AsyncMock(return_value={"id": "t-1", "status": "open"})

    with patch("services.threat_service.db", mock_db):
        result = await _find_threat_scoped(USER, "t-1")

    assert result["id"] == "t-1"
    filt = mock_db.threats.find_one.call_args[0][0]
    assert filt["$and"][0] == {"id": "t-1"}
    assert {"tenant_id": "co-1"} in filt["$and"][1]["$or"]


@pytest.mark.asyncio
async def test_update_threat_scoped_update_filter():
    mock_db = MagicMock()
    mock_db.threats = MagicMock()
    mock_db.threats.find_one = AsyncMock(
        side_effect=[
            {"id": "t-1", "status": "open", "likelihood": "Possible", "detectability": "Moderate"},
            {"id": "t-1", "status": "closed", "risk_score": 30},
        ]
    )
    mock_db.threats.update_one = AsyncMock()

    with patch("services.threat_service.db", mock_db), patch(
        "services.threat_service.assert_threat_installation_scope", AsyncMock()
    ), patch("services.threat_service._mirror_threat_observation", AsyncMock()), patch(
        "services.threat_service.update_all_ranks", AsyncMock()
    ), patch("services.threat_service.cache.invalidate_stats"):
        result = await update_threat(USER, "t-1", {"status": "closed"})

    assert result["status"] == "closed"
    update_filter = mock_db.threats.update_one.call_args[0][0]
    assert update_filter["$and"][0] == {"id": "t-1"}
