"""Lifecycle domain events → graph sync handler tests."""
from __future__ import annotations

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/lifecycle-graph-test")
os.environ.setdefault("DB_NAME", "lifecycle-graph-test")
os.environ.setdefault("JWT_SECRET_KEY", "lifecycle-graph-test")
os.environ.setdefault("ENVIRONMENT", "test")

from workers.lifecycle_graph_handler import (  # noqa: E402
    handle_action_completed,
    handle_form_submission_created,
    handle_observation_created,
    handle_threat_created,
    lifecycle_graph_event_handlers,
)


def test_lifecycle_graph_handlers_registered():
    handlers = lifecycle_graph_event_handlers()
    assert "threat.created" in handlers
    assert "observation.created" in handlers
    assert "action.completed" in handlers
    assert "form_submission.created" in handlers


@pytest.mark.asyncio
async def test_handle_threat_created_dispatches_graph_sync():
    mock_db = MagicMock()
    mock_db.threats.find_one = AsyncMock(
        return_value={
            "id": "th-1",
            "linked_equipment_id": "eq-1",
            "failure_mode_id": "fm-1",
            "tenant_id": "co-1",
        }
    )
    mock_dispatch = AsyncMock()

    with patch("database.db", mock_db), patch(
        "services.reliability_graph.dispatch_graph_sync", mock_dispatch
    ):
        await handle_threat_created(
            {
                "aggregate_id": "th-1",
                "tenant_id": "co-1",
                "payload": {},
            }
        )

    mock_dispatch.assert_awaited_once()
    assert mock_dispatch.await_args.args[0] == "sync_threat_edges"


@pytest.mark.asyncio
async def test_handle_observation_created_dispatches_graph_sync():
    mock_db = MagicMock()
    mock_db.observations.find_one = AsyncMock(
        return_value={
            "id": "obs-1",
            "equipment_id": "eq-1",
            "failure_mode_id": "fm-1",
            "tenant_id": "co-1",
        }
    )
    mock_dispatch = AsyncMock()

    with patch("database.db", mock_db), patch(
        "services.reliability_graph.dispatch_graph_sync", mock_dispatch
    ):
        await handle_observation_created(
            {
                "aggregate_id": "obs-1",
                "tenant_id": "co-1",
                "payload": {"observation_id": "obs-1"},
            }
        )

    mock_dispatch.assert_awaited_once()
    assert mock_dispatch.await_args.args[0] == "sync_observation_edges"


@pytest.mark.asyncio
async def test_handle_action_completed_dispatches_outcome_sync():
    mock_db = MagicMock()
    mock_db.central_actions.find_one = AsyncMock(
        return_value={
            "id": "act-1",
            "linked_equipment_id": "eq-1",
            "completion_notes": "done",
            "tenant_id": "co-1",
        }
    )
    mock_dispatch = AsyncMock()

    with patch("database.db", mock_db), patch(
        "services.reliability_graph.dispatch_graph_sync", mock_dispatch
    ):
        await handle_action_completed(
            {"aggregate_id": "act-1", "tenant_id": "co-1", "payload": {}}
        )

    mock_dispatch.assert_awaited_once()
    assert mock_dispatch.await_args.args[0] == "sync_outcome_edges"


@pytest.mark.asyncio
async def test_handle_form_submission_created_upserts_supports_edge():
    mock_sync = AsyncMock()

    with patch(
        "services.reliability_graph_entities.sync_form_submission_edges", mock_sync
    ):
        await handle_form_submission_created(
            {
                "aggregate_id": "sub-1",
                "tenant_id": "co-1",
                "payload": {
                    "form_submission_id": "sub-1",
                    "task_instance_id": "ti-1",
                    "equipment_id": "eq-1",
                },
            }
        )

    mock_sync.assert_awaited_once_with(
        form_submission_id="sub-1",
        task_instance_id="ti-1",
        equipment_id="eq-1",
        tenant_id="co-1",
    )
