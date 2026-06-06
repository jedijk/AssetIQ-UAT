"""Tests for GraphTraversalService."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.reliability_graph_query import GraphTraversalService, count_edges_by_relation


@pytest.mark.asyncio
async def test_get_chain_from_equipment():
    seed_edges = [
        {
            "id": "e1",
            "relation": "scheduled_for",
            "source_type": "scheduled_task",
            "source_id": "st-1",
            "target_type": "equipment",
            "target_id": "eq-1",
        }
    ]
    node_edges = [
        {
            "id": "e2",
            "relation": "derived_from",
            "source_type": "scheduled_task",
            "source_id": "st-1",
            "target_type": "program_task",
            "target_id": "pt-1",
        }
    ]

    with patch(
        "services.reliability_graph_query.get_edges_for_equipment",
        AsyncMock(return_value=seed_edges),
    ), patch(
        "services.reliability_graph_query.get_edges_for_node",
        AsyncMock(return_value=node_edges),
    ):
        result = await GraphTraversalService().get_chain("eq-1", depth=3)

    assert result["equipment_id"] == "eq-1"
    assert result["edge_count"] >= 1
    assert result["nodes_visited"] >= 1


@pytest.mark.asyncio
async def test_explain_risk_includes_threats():
    mock_db = MagicMock()
    mock_db.threats.find = MagicMock()
    mock_db.threats.find.return_value.sort = MagicMock(return_value=mock_db.threats.find.return_value)
    mock_db.threats.find.return_value.sort.return_value.limit = MagicMock(
        return_value=mock_db.threats.find.return_value.sort.return_value
    )
    mock_db.threats.find.return_value.sort.return_value.limit.return_value.to_list = AsyncMock(
        return_value=[{"id": "th-1", "title": "Leak", "risk_score": 80}]
    )
    mock_db.scheduled_tasks.count_documents = AsyncMock(return_value=2)

    chain = {"edges": [], "paths": [["equipment:eq-1", "-[escalated_to]->", "threat:th-1"]]}

    with patch(
        "services.reliability_graph_query.GraphTraversalService.get_chain",
        AsyncMock(return_value=chain),
    ):
        svc = GraphTraversalService(database=mock_db)
        result = await svc.explain_risk("eq-1")

    assert result["open_threat_count"] == 1
    assert result["overdue_pm_scheduled"] == 2


@pytest.mark.asyncio
async def test_count_edges_by_relation_tenant_scoped():
    mock_coll = MagicMock()
    mock_coll.aggregate = MagicMock(
        return_value=AsyncMock(
            to_list=AsyncMock(return_value=[{"_id": "scheduled_for", "count": 5}])
        )
    )
    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_coll)

    with patch("services.reliability_graph_query.db", mock_db):
        counts = await count_edges_by_relation({"company_id": "co-1"})

    assert counts["scheduled_for"] == 5
    pipeline = mock_coll.aggregate.call_args[0][0]
    match_stage = pipeline[0]["$match"]
    if "$and" in match_stage:
        status_clause = next(
            (c for c in match_stage["$and"] if "status" in c),
            {},
        )
        assert status_clause.get("status") == {"$ne": "retired"}
    else:
        assert match_stage["status"] == {"$ne": "retired"}
