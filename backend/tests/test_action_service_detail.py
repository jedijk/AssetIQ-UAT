"""Unit tests for central action detail fetch (GET /api/actions/{id})."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

import json
from unittest.mock import AsyncMock, patch

import pytest
from bson import ObjectId
from fastapi.encoders import jsonable_encoder

from services.action_service import get_action_detail


@pytest.mark.asyncio
async def test_get_action_detail_serializes_bson_objectid():
    """Legacy rows may contain ObjectId refs; detail must not 500 on JSON encode."""
    action_id = "7995462d-b7ae-4504-969d-6d89079e2953"
    action = {
        "id": action_id,
        "title": "Replace seal",
        "status": "open",
        "source_type": "threat",
        "source_id": "threat-1",
        "source_name": "Pump seal leak",
        "threat_id": "threat-1",
        "linked_cause_id": ObjectId(),
        "attachments": [{"url": "/files/x", "storage_id": ObjectId()}],
    }

    with patch(
        "services.action_service.find_central_action",
        AsyncMock(return_value=dict(action)),
    ), patch(
        "services.action_service._threat_repo.find_one",
        AsyncMock(return_value={"asset": "Pump A", "linked_equipment_id": "eq-1"}),
    ), patch(
        "services.action_service._equipment_repo.find_tags_by_ids",
        AsyncMock(return_value={"eq-1": "P-101"}),
    ):
        result = await get_action_detail(action_id, {"id": "user-1"})

    json.dumps(jsonable_encoder(result))
    assert result["id"] == action_id
    assert result["equipment_tag"] == "P-101"
    assert isinstance(result["linked_cause_id"], str)
    assert isinstance(result["attachments"][0]["storage_id"], str)


@pytest.mark.asyncio
async def test_get_action_detail_not_found_raises_404():
    from fastapi import HTTPException

    with patch(
        "services.action_service.find_central_action",
        AsyncMock(return_value=None),
    ):
        with pytest.raises(HTTPException) as exc:
            await get_action_detail("missing-id", {"id": "user-1"})
    assert exc.value.status_code == 404
