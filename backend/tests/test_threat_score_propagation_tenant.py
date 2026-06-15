"""Tenant-scoped propagation for threat score linked-entity updates."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.threat_score_propagation import propagate_risk_to_linked_entities

USER_A = {"company_id": "tenant-a", "id": "user-a"}
USER_B = {"company_id": "tenant-b", "id": "user-b"}


@pytest.mark.asyncio
async def test_propagate_risk_uses_merge_tenant_filter_on_actions_and_investigations():
    mock_db = MagicMock()
    threats_col = MagicMock()
    actions_col = MagicMock()
    inv_col = MagicMock()

    mock_db.threats = threats_col
    mock_db.central_actions = actions_col
    mock_db.investigations = inv_col

    actions_cursor = MagicMock()
    actions_cursor.to_list = AsyncMock(
        return_value=[{"id": "act-1", "threat_id": "threat-1"}]
    )
    actions_col.find.return_value = actions_cursor

    inv_cursor = MagicMock()
    inv_cursor.to_list = AsyncMock(return_value=[])
    inv_col.find.return_value = inv_cursor

    actions_col.update_one = AsyncMock()

    with patch("services.threat_score_propagation.db", mock_db):
        await propagate_risk_to_linked_entities(
            ["threat-1"],
            threats=[{"id": "threat-1", "risk_score": 80, "risk_level": "High", "tenant_id": "tenant-a"}],
            user=USER_A,
        )

    action_find_query = actions_col.find.call_args[0][0]
    assert "$and" in action_find_query
    tenant_part = action_find_query["$and"][1]
    assert "$or" in tenant_part
    assert {"tenant_id": "tenant-a"} in tenant_part["$or"] or tenant_part == {"tenant_id": "tenant-a"}

    inv_col.find.assert_called_once()
    inv_query = inv_col.find.call_args[0][0]
    assert "$and" in inv_query


@pytest.mark.asyncio
async def test_propagate_risk_strict_mode_excludes_foreign_tenant_actions(monkeypatch):
    monkeypatch.setenv("TENANT_STRICT_MODE", "true")

    mock_db = MagicMock()
    actions_col = MagicMock()
    inv_col = MagicMock()
    mock_db.central_actions = actions_col
    mock_db.investigations = inv_col

    actions_cursor = MagicMock()
    actions_cursor.to_list = AsyncMock(return_value=[])
    actions_col.find.return_value = actions_cursor
    inv_cursor = MagicMock()
    inv_cursor.to_list = AsyncMock(return_value=[])
    inv_col.find.return_value = inv_cursor

    threats = [{"id": "threat-1", "risk_score": 50, "risk_level": "Medium", "tenant_id": "tenant-b"}]

    with patch("services.threat_score_propagation.db", mock_db), patch(
        "services.threat_score_propagation.merge_tenant_filter",
        side_effect=lambda base, user: (
            {"$and": [base, {"tenant_id": user.get("company_id")}]}
            if user and user.get("company_id")
            else base
        ),
    ):
        await propagate_risk_to_linked_entities(["threat-1"], threats=threats, user=USER_B)

    action_query = actions_col.find.call_args[0][0]
    tenant_filter = action_query["$and"][1]
    assert tenant_filter == {"tenant_id": "tenant-b"}

    monkeypatch.delenv("TENANT_STRICT_MODE", raising=False)
