"""Unit tests for central action updates."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId
from fastapi import HTTPException

from services.action_service import update_action


@pytest.mark.asyncio
async def test_update_action_uses_tenant_scoped_id_update():
    action_id = "act-123"
    action = {
        "id": action_id,
        "status": "open",
        "source_type": "threat",
        "source_id": "threat-1",
    }
    updated = {
        **action,
        "status": "in_progress",
        "linked_cause_id": ObjectId(),
    }
    update_result = MagicMock(matched_count=1)

    with patch(
        "services.action_service.find_central_action",
        AsyncMock(side_effect=[action, updated]),
    ), patch(
        "services.action_service.assert_action_installation_scope",
        AsyncMock(),
    ), patch(
        "services.action_service._action_repo.update_one",
        AsyncMock(return_value=update_result),
    ) as update_one:
        result = await update_action(
            action_id,
            {"id": "user-1", "role": "owner"},
            {"status": "in_progress"},
        )

    assert update_one.await_count == 1
    args, kwargs = update_one.await_args
    assert args[0] == {"id": action_id}
    assert args[1]["$set"]["status"] == "in_progress"
    assert "updated_at" in args[1]["$set"]
    assert kwargs["user"] == {"id": "user-1", "role": "owner"}
    assert result["status"] == "in_progress"
    assert isinstance(result["linked_cause_id"], str)


@pytest.mark.asyncio
async def test_update_action_not_found_when_update_matches_zero():
    action = {
        "id": "act-404",
        "status": "open",
        "source_type": "threat",
        "source_id": "threat-1",
    }
    update_result = MagicMock(matched_count=0)

    with patch(
        "services.action_service.find_central_action",
        AsyncMock(return_value=action),
    ), patch(
        "services.action_service.assert_action_installation_scope",
        AsyncMock(),
    ), patch(
        "services.action_service._action_repo.update_one",
        AsyncMock(return_value=update_result),
    ):
        with pytest.raises(HTTPException) as exc:
            await update_action(
                "act-404",
                {"id": "user-1", "role": "owner"},
                {"status": "in_progress"},
            )

    assert exc.value.status_code == 404
