"""Tests for domain event outbox — Wave 3 event architecture."""
import pytest
from unittest.mock import AsyncMock, patch

from services.domain_events import DomainEventType


@pytest.mark.asyncio
async def test_publish_event_inserts_document():
    mock_coll = AsyncMock()
    mock_coll.insert_one = AsyncMock()

    with patch("services.event_outbox.db") as mock_db:
        from unittest.mock import MagicMock

        mock_db.__getitem__ = MagicMock(return_value=mock_coll)
        from services.event_outbox import publish_event

        event_id = await publish_event(
            event_type=DomainEventType.GRAPH_SYNC_OBSERVATION.value,
            aggregate_type="reliability_graph",
            aggregate_id="obs-1",
            payload={"sync_name": "sync_observation_edges", "kwargs": {}, "label": "test"},
            tenant_id="co-a",
        )

    assert event_id
    mock_coll.insert_one.assert_called_once()
    doc = mock_coll.insert_one.call_args[0][0]
    assert doc["status"] == "pending"
    assert doc["event_type"] == DomainEventType.GRAPH_SYNC_OBSERVATION.value


@pytest.mark.asyncio
async def test_publish_event_sets_tenant_id_from_user():
    mock_coll = AsyncMock()
    mock_coll.insert_one = AsyncMock()

    with patch("services.event_outbox.db") as mock_db:
        from unittest.mock import MagicMock

        mock_db.__getitem__ = MagicMock(return_value=mock_coll)
        from services.event_outbox import publish_event

        await publish_event(
            event_type="test.event",
            aggregate_type="test",
            aggregate_id="agg-1",
            user={"company_id": "co-a", "id": "user-1"},
        )

    doc = mock_coll.insert_one.call_args[0][0]
    assert doc["tenant_id"] == "co-a"


@pytest.mark.asyncio
async def test_claim_next_event_filters_by_worker_tenant(monkeypatch):
    monkeypatch.setenv("WORKER_TENANT_ID", "co-b")
    mock_coll = AsyncMock()
    mock_coll.find_one_and_update = AsyncMock(return_value=None)

    with patch("services.event_outbox.db") as mock_db:
        from unittest.mock import MagicMock

        mock_db.__getitem__ = MagicMock(return_value=mock_coll)
        from services.event_outbox import claim_next_event

        await claim_next_event()

    filt = mock_coll.find_one_and_update.call_args[0][0]
    assert filt["tenant_id"] == "co-b"


@pytest.mark.asyncio
async def test_graph_dispatch_enqueues_when_async_enabled(monkeypatch):
    monkeypatch.setenv("GRAPH_SYNC_ASYNC", "true")

    with patch("services.reliability_graph.graph_sync_async_enabled", return_value=True):
        with patch("services.event_outbox.publish_event", new=AsyncMock()) as mock_publish:
            from services.reliability_graph import dispatch_graph_sync

            await dispatch_graph_sync(
                "sync_observation_edges",
                "test_label",
                observation_id="obs-1",
                equipment_id="eq-1",
            )

    mock_publish.assert_called_once()
