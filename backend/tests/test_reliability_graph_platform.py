"""Tests for Wave 1 platform hardening and extended graph sync."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.reliability_graph import (
    EDGE_STATUS_ACTIVE,
    EDGE_STATUS_RETIRED,
    retire_edges_for_entity,
    retire_stale_program_task_edges,
    sync_edges_for_apply_strategy,
    sync_observation_edges,
    sync_threat_edges,
    sync_investigation_edges,
    sync_action_edges,
    sync_outcome_edges,
    upsert_edge,
)


@pytest.mark.asyncio
async def test_upsert_edge_includes_tenant_and_status():
    mock_db = MagicMock()
    mock_coll = MagicMock()
    mock_coll.update_one = AsyncMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_coll)

    with patch("services.reliability_graph_core.db", mock_db):
        await upsert_edge(
            source_type="equipment",
            source_id="eq-1",
            relation="observed_on",
            target_type="threat",
            target_id="t-1",
            equipment_id="eq-1",
            tenant_id="company_1",
            status=EDGE_STATUS_ACTIVE,
        )

    call_doc = mock_coll.update_one.call_args[0][1]["$set"]
    assert call_doc["tenant_id"] == "company_1"
    assert call_doc["status"] == EDGE_STATUS_ACTIVE
    assert call_doc["retired_at"] is None


@pytest.mark.asyncio
async def test_retire_edges_for_entity():
    mock_db = MagicMock()
    mock_coll = MagicMock()
    mock_result = MagicMock(modified_count=3)
    mock_coll.update_many = AsyncMock(return_value=mock_result)
    mock_db.__getitem__ = MagicMock(return_value=mock_coll)

    with patch("services.reliability_graph_core.db", mock_db):
        count = await retire_edges_for_entity(
            source_type="program_task",
            source_id="pt-old",
            tenant_id="company_1",
        )

    assert count == 3
    query = mock_coll.update_many.call_args[0][0]
    assert query["status"] == EDGE_STATUS_ACTIVE


@pytest.mark.asyncio
async def test_sync_apply_strategy_contains_task_and_has_failure_mode():
    mock_db = MagicMock()
    strategy = {
        "failure_mode_strategies": [{"failure_mode_id": "fm-1"}],
    }
    program = {
        "id": "prog-1",
        "equipment_id": "eq-1",
        "tasks": [{"id": "task-1", "traceability": {"failure_mode_id": "fm-1"}}],
    }
    mock_db.equipment_type_strategies.find_one = AsyncMock(return_value=strategy)
    mock_cursor = MagicMock()
    mock_cursor.to_list = AsyncMock(return_value=[program])
    mock_db.maintenance_programs_v2.find = MagicMock(return_value=mock_cursor)

    mock_upsert = AsyncMock()
    mock_retire = AsyncMock(return_value=0)

    with patch("services.reliability_graph_strategy.db", mock_db), patch(
        "services.reliability_graph_strategy.upsert_edge", mock_upsert
    ), patch("services.reliability_graph_strategy.retire_stale_program_task_edges", mock_retire):
        result = await sync_edges_for_apply_strategy(
            equipment_type_id="et-1",
            equipment_ids=["eq-1"],
            strategy_version="2.0",
            tenant_id="co-1",
        )

    relations = [c.kwargs.get("relation") for c in mock_upsert.await_args_list]
    assert "contains_task" in relations
    assert "governed_by" in relations
    assert "has_failure_mode" in relations
    assert result["edges_upserted"] > 0


@pytest.mark.asyncio
async def test_sync_apply_strategy_links_pm_import_tasks():
    mock_db = MagicMock()
    strategy = {
        "failure_mode_strategies": [{"failure_mode_id": "fm-1"}],
    }
    program = {
        "id": "prog-1",
        "equipment_id": "eq-1",
        "tasks": [
            {
                "id": "task-1",
                "traceability": {
                    "failure_mode_id": "fm-1",
                    "pm_import_task_id": "sess-1:row-1",
                },
            }
        ],
    }
    mock_db.equipment_type_strategies.find_one = AsyncMock(return_value=strategy)
    mock_cursor = MagicMock()
    mock_cursor.to_list = AsyncMock(return_value=[program])
    mock_db.maintenance_programs_v2.find = MagicMock(return_value=mock_cursor)

    mock_upsert = AsyncMock()
    mock_retire = AsyncMock(return_value=0)
    mock_pm_links = AsyncMock(return_value=2)

    with patch("services.reliability_graph_strategy.db", mock_db), patch(
        "services.reliability_graph_strategy.upsert_edge", mock_upsert
    ), patch(
        "services.reliability_graph_strategy.retire_stale_program_task_edges", mock_retire
    ), patch(
        "services.reliability_graph_strategy.sync_pm_import_program_task_links", mock_pm_links
    ):
        await sync_edges_for_apply_strategy(
            equipment_type_id="et-1",
            equipment_ids=["eq-1"],
            strategy_version="2.0",
            tenant_id="co-1",
        )

    mock_pm_links.assert_awaited_once()
    assert mock_pm_links.await_args.kwargs["pm_import_task_id"] == "sess-1:row-1"
    assert mock_pm_links.await_args.kwargs["program_task_id"] == "task-1"


@pytest.mark.asyncio
async def test_sync_observation_edges_all_relations():
    mock_upsert = AsyncMock()
    with patch("services.reliability_graph_entities.upsert_edge", mock_upsert):
        await sync_observation_edges(
            observation_id="obs-1",
            equipment_id="eq-1",
            failure_mode_id="fm-1",
            threat_id="th-1",
            escalate=True,
        )

    relations = [c.kwargs.get("relation") for c in mock_upsert.await_args_list]
    assert "observed_on" in relations
    assert "indicates_failure_mode" in relations
    assert "escalated_to" in relations


@pytest.mark.asyncio
async def test_sync_threat_and_investigation_chain():
    mock_upsert = AsyncMock()
    with patch("services.reliability_graph_entities.upsert_edge", mock_upsert), patch(
        "services.reliability_graph_entities.sync_observation_edges", AsyncMock()
    ):
        await sync_threat_edges(
            threat_id="th-1",
            equipment_id="eq-1",
            failure_mode_id="fm-1",
        )
        await sync_investigation_edges(
            investigation_id="inv-1",
            threat_id="th-1",
            equipment_id="eq-1",
        )

    relations = [c.kwargs.get("relation") for c in mock_upsert.await_args_list]
    assert "triggered_investigation" in relations


@pytest.mark.asyncio
async def test_sync_action_mitigates_failure_mode_when_target_present():
    mock_upsert = AsyncMock()
    with patch("services.reliability_graph_entities.upsert_edge", mock_upsert):
        await sync_action_edges(
            action_id="act-1",
            source_type="threat",
            source_id="th-1",
            equipment_id="eq-1",
            failure_mode_id="fm-1",
        )

    relations = [c.kwargs.get("relation") for c in mock_upsert.await_args_list]
    assert "mitigates_failure_mode" in relations
    mitigates_call = next(
        c for c in mock_upsert.await_args_list
        if c.kwargs.get("relation") == "mitigates_failure_mode"
    )
    assert mitigates_call.kwargs["source_type"] == "action"
    assert mitigates_call.kwargs["target_type"] == "failure_mode"


@pytest.mark.asyncio
async def test_sync_form_submission_supports_task_instance():
    from services.reliability_graph_entities import sync_form_submission_edges

    mock_upsert = AsyncMock()
    with patch("services.reliability_graph_entities.upsert_edge", mock_upsert):
        await sync_form_submission_edges(
            form_submission_id="sub-1",
            task_instance_id="ti-1",
            equipment_id="eq-1",
            tenant_id="co-1",
        )

    mock_upsert.assert_awaited_once()
    call = mock_upsert.await_args.kwargs
    assert call["relation"] == "supports"
    assert call["source_type"] == "form_submission"
    assert call["target_type"] == "task_instance"


@pytest.mark.asyncio
async def test_sync_action_and_outcome_edges():
    mock_db = MagicMock()
    mock_coll = MagicMock()
    mock_coll.insert_one = AsyncMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_coll)
    mock_upsert = AsyncMock()

    with patch("services.reliability_graph_entities.db", mock_db), patch(
        "services.reliability_graph_entities.upsert_edge", mock_upsert
    ):
        await sync_action_edges(
            action_id="act-1",
            source_type="investigation",
            source_id="inv-1",
            equipment_id="eq-1",
        )
        result = await sync_outcome_edges(
            action_id="act-1",
            outcome_id="out-1",
            equipment_id="eq-1",
            delta=45.0,
        )

    relations = [c.kwargs.get("relation") for c in mock_upsert.await_args_list]
    assert "generated_action" in relations
    assert "assigned_to_equipment" in relations
    assert "resulted_in" in relations
    assert "impacted_reliability" in relations
    assert "affects_equipment" in relations
    assert "outcome_id" in result
