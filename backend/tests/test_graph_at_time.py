"""Tests for graph-at-time edge filtering (Digital Twin DT-2)."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from services.reliability_snapshot_service import _active_edges_at


@pytest.mark.asyncio
async def test_active_edges_at_builds_time_filter():
    at = datetime(2026, 6, 6, tzinfo=timezone.utc)
    mock_coll = MagicMock()
    mock_coll.find = MagicMock(
        return_value=MagicMock(
            sort=MagicMock(
                return_value=MagicMock(to_list=AsyncMock(return_value=[]))
            )
        )
    )
    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_coll)

    with patch("services.reliability_snapshot_service.db", mock_db):
        await _active_edges_at("eq-1", at, tenant_id="co-1")

    query = mock_coll.find.call_args[0][0]
    if "$and" in query:
        base = query["$and"][0]
    else:
        base = query
    assert base["equipment_id"] == "eq-1"
    assert "$lte" in base["created_at"]
    assert "$or" in base
    if "$and" in query:
        tenant_clause = query["$and"][1]["$or"]
        assert {"tenant_id": "co-1"} in tenant_clause


@pytest.mark.asyncio
async def test_explain_risk_includes_path_entries():
    from services.reliability_graph_query import GraphTraversalService

    mock_db = MagicMock()
    mock_db.threats.find = MagicMock()
    mock_db.threats.find.return_value.sort = MagicMock(return_value=mock_db.threats.find.return_value)
    mock_db.threats.find.return_value.sort.return_value.limit = MagicMock(
        return_value=mock_db.threats.find.return_value.sort.return_value
    )
    mock_db.threats.find.return_value.sort.return_value.limit.return_value.to_list = AsyncMock(
        return_value=[]
    )
    mock_db.scheduled_tasks.count_documents = AsyncMock(return_value=0)

    chain = {
        "edges": [
            {
                "id": "equipment:eq-1:escalated_to:threat:th-1",
                "relation": "escalated_to",
                "source_type": "observation",
                "source_id": "obs-1",
                "target_type": "threat",
                "target_id": "th-1",
            }
        ],
        "paths": [],
    }

    with patch(
        "services.reliability_graph_query.GraphTraversalService.get_chain",
        AsyncMock(return_value=chain),
    ):
        result = await GraphTraversalService(database=mock_db).explain_risk("eq-1")

    assert len(result["path_entries"]) == 1
    assert result["path_entries"][0]["edge_id"] == "equipment:eq-1:escalated_to:threat:th-1"
    assert result["path_entries"][0]["relation"] == "escalated_to"
