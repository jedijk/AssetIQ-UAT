"""Convergence 7 — cross-tenant regression matrix (Phase 1)."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

USER_A = {"company_id": "tenant-a", "id": "user-a", "name": "User A", "role": "owner"}
USER_B = {"company_id": "tenant-b", "id": "user-b", "name": "User B", "role": "owner"}


@pytest.mark.asyncio
async def test_investigation_create_scopes_threat_and_investigation_reads():
    mock_db = MagicMock()
    mock_db.threats = MagicMock()
    mock_db.investigations = MagicMock()
    mock_db.timeline_events = MagicMock()
    mock_db.failure_modes = MagicMock()
    mock_db.failure_identifications = MagicMock()
    mock_db.cause_nodes = MagicMock()
    mock_db.action_items = MagicMock()

    mock_db.threats.find_one = AsyncMock(
        return_value={
            "id": "t-1",
            "title": "Leak",
            "asset": "Pump",
            "failure_mode": "Seal leak",
            "risk_level": "High",
            "risk_score": 75,
            "created_at": "2026-01-01T00:00:00Z",
        }
    )
    mock_db.investigations.find_one = AsyncMock(return_value=None)
    mock_db.investigations.insert_one = AsyncMock()
    mock_db.timeline_events.insert_many = AsyncMock()
    mock_db.failure_modes.find_one = AsyncMock(return_value=None)
    mock_db.failure_identifications.insert_one = AsyncMock()
    mock_db.cause_nodes.insert_many = AsyncMock()
    mock_db.action_items.insert_many = AsyncMock()

    with patch("services.threat_service_investigation.db", mock_db), patch(
        "services.reliability_graph.dispatch_graph_sync",
        AsyncMock(),
    ), patch(
        "services.threat_service.assert_threat_installation_scope",
        AsyncMock(),
    ), patch(
        "services.investigation_service.generate_case_number",
        AsyncMock(return_value="INV-001"),
    ):
        from services.threat_service_investigation import create_investigation_from_threat

        await create_investigation_from_threat(USER_A, "t-1")

    threat_filter = mock_db.threats.find_one.call_args[0][0]
    assert threat_filter["$and"][0] == {"id": "t-1"}
    assert {"tenant_id": "tenant-a"} in threat_filter["$and"][1]["$or"]

    inv_lookup = mock_db.investigations.find_one.call_args[0][0]
    assert inv_lookup["$and"][0] == {"threat_id": "t-1"}

    inserted_inv = mock_db.investigations.insert_one.call_args[0][0]
    assert inserted_inv.get("tenant_id") == "tenant-a"


@pytest.mark.asyncio
async def test_investigation_timeline_scopes_related_queries():
    mock_db = MagicMock()
    mock_db.threats = MagicMock()
    mock_db.central_actions = MagicMock()
    mock_db.investigations = MagicMock()

    mock_db.threats.find_one = AsyncMock(
        return_value={
            "id": "t-1",
            "title": "Leak",
            "linked_equipment_id": "eq-1",
            "asset": "Pump",
            "created_at": "2026-01-01T00:00:00Z",
        }
    )
    threats_cursor = MagicMock()
    threats_cursor.sort.return_value = threats_cursor
    threats_cursor.to_list = AsyncMock(return_value=[])
    mock_db.threats.find = MagicMock(return_value=threats_cursor)
    mock_db.central_actions.find = MagicMock(
        return_value=MagicMock(to_list=AsyncMock(return_value=[]))
    )
    mock_db.investigations.find = MagicMock(
        return_value=MagicMock(to_list=AsyncMock(return_value=[]))
    )

    with patch("services.threat_service_investigation.db", mock_db):
        from services.threat_service_investigation import get_threat_timeline

        await get_threat_timeline(USER_B, "t-1")

    past_filter = mock_db.threats.find.call_args[0][0]
    assert past_filter["$and"][0]["id"] == {"$ne": "t-1"}
    assert past_filter["$and"][1]["$or"][0]["tenant_id"] == "tenant-b"


@pytest.mark.asyncio
async def test_threat_update_dispatches_graph_sync():
    mock_db = MagicMock()
    mock_db.threats = MagicMock()
    mock_db.threats.find_one = AsyncMock(
        side_effect=[
            {"id": "t-1", "status": "open", "likelihood": "Possible", "detectability": "Moderate"},
            {"id": "t-1", "status": "closed", "linked_equipment_id": "eq-1"},
        ]
    )
    mock_db.threats.update_one = AsyncMock()
    graph_sync = AsyncMock()

    with patch("services.threat_crud.db", mock_db), patch(
        "services.threat_helpers.db", mock_db
    ), patch(
        "services.threat_crud.assert_threat_installation_scope",
        AsyncMock(),
    ), patch("services.threat_crud._mirror_threat_observation", AsyncMock()), patch(
        "services.threat_crud._sync_threat_graph",
        graph_sync,
    ), patch("services.threat_crud.update_all_ranks", AsyncMock()), patch(
        "services.threat_crud.cache.invalidate_stats"
    ):
        from services.threat_crud import update_threat

        await update_threat(USER_A, "t-1", {"status": "closed"})

    graph_sync.assert_called_once()
    assert graph_sync.call_args.kwargs["label"] == "threat_update"
