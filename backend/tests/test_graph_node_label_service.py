"""Tests for graph node label resolution."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.graph_node_label_service import enrich_edges_with_labels, resolve_node_labels


@pytest.mark.asyncio
async def test_resolve_threat_and_equipment_labels():
    mock_db = MagicMock()
    mock_db.equipment_nodes.find = MagicMock(
        return_value=AsyncMock(
            to_list=AsyncMock(return_value=[{"id": "eq-1", "name": "Extruder"}])
        )
    )
    mock_db.threats.find = MagicMock(
        return_value=AsyncMock(
            to_list=AsyncMock(
                return_value=[{"id": "th-1", "title": "Bearing noise on P-101"}]
            )
        )
    )

    edges = [
        {
            "id": "e1",
            "source_type": "threat",
            "source_id": "th-1",
            "target_type": "equipment",
            "target_id": "eq-1",
            "relation": "linked_to_equipment",
        }
    ]

    with patch("services.graph_node_label_service.db", mock_db):
        labels = await resolve_node_labels(edges)

    assert labels["equipment:eq-1"] == "Extruder"
    assert labels["threat:th-1"] == "Bearing noise on P-101"


@pytest.mark.asyncio
async def test_resolve_failure_mode_by_object_id():
    from bson import ObjectId

    fm_oid = ObjectId("507f1f77bcf86cd799439011")
    mock_db = MagicMock()
    mock_db.failure_modes.find = MagicMock(
        return_value=AsyncMock(
            to_list=AsyncMock(
                return_value=[
                    {
                        "_id": fm_oid,
                        "legacy_id": 42,
                        "failure_mode": "Bearing Failure",
                        "category": "Mechanical",
                    }
                ]
            )
        )
    )
    mock_db.threats.find = MagicMock(
        return_value=AsyncMock(to_list=AsyncMock(return_value=[]))
    )

    edges = [
        {
            "id": "e1",
            "source_type": "threat",
            "source_id": "th-1",
            "target_type": "failure_mode",
            "target_id": str(fm_oid),
        }
    ]

    with patch("services.graph_node_label_service.db", mock_db):
        labels = await resolve_node_labels(edges)

    assert labels[f"failure_mode:{fm_oid}"] == "Bearing Failure"


@pytest.mark.asyncio
async def test_enrich_edges_attaches_source_and_target_labels():
    mock_db = MagicMock()
    mock_db.failure_modes.find = MagicMock(
        return_value=AsyncMock(
            to_list=AsyncMock(return_value=[{"id": "fm-1", "name": "Seal leak"}])
        )
    )

    edges = [
        {
            "id": "e1",
            "source_type": "threat",
            "source_id": "th-1",
            "target_type": "failure_mode",
            "target_id": "fm-1",
        }
    ]

    async def _load_labels(node_type, node_ids, *, user=None):
        if node_type == "failure_mode":
            return {"fm-1": "Seal leak"}
        if node_type == "threat":
            return {"th-1": "High vibration"}
        return {}

    with patch(
        "services.graph_node_label_service._load_labels_for_type",
        side_effect=_load_labels,
    ):
        enriched, labels = await enrich_edges_with_labels(edges)

    assert enriched[0]["target_label"] == "Seal leak"
    assert labels["failure_mode:fm-1"] == "Seal leak"


@pytest.mark.asyncio
async def test_resolve_observation_by_object_id_uses_description():
    from bson import ObjectId

    obs_oid = ObjectId("507f1f77bcf86cd799439012")
    mock_db = MagicMock()
    mock_db.observations.find = MagicMock(
        return_value=AsyncMock(
            to_list=AsyncMock(
                return_value=[
                    {
                        "_id": obs_oid,
                        "description": "Pomp word er warm en loopt zwaar.",
                        "equipment_name": "Oil Pump Filter",
                    }
                ]
            )
        )
    )

    edges = [
        {
            "id": "e1",
            "source_type": "observation",
            "source_id": str(obs_oid),
            "target_type": "equipment",
            "target_id": "eq-1",
        }
    ]

    with patch("services.graph_node_label_service.db", mock_db):
        labels = await resolve_node_labels(edges)

    assert labels[f"observation:{obs_oid}"] == "Oil Pump Filter - Pomp word er warm en loopt zwaar."


@pytest.mark.asyncio
async def test_resolve_action_falls_back_to_description():
    mock_db = MagicMock()
    mock_db.central_actions.find = MagicMock(
        return_value=AsyncMock(
            to_list=AsyncMock(
                return_value=[
                    {
                        "id": "act-1",
                        "action_number": "ACT-0011",
                        "description": "Monitor motor current during peak load",
                    }
                ]
            )
        )
    )

    edges = [
        {
            "id": "e1",
            "source_type": "investigation",
            "source_id": "inv-1",
            "target_type": "action",
            "target_id": "act-1",
        }
    ]

    with patch("services.graph_node_label_service.db", mock_db):
        labels = await resolve_node_labels(edges)

    assert labels["action:act-1"] == "ACT-0011 · Monitor motor current during peak load"
