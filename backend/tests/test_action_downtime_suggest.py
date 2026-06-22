"""Tests for recommended action schema and AI downtime suggestion."""
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")
os.environ.setdefault("DB_NAME", "test")

from services.failure_modes.recommended_action_schema import (
    RecommendedActionEntry,
    normalize_recommended_action,
    normalize_recommended_actions,
)
from services.failure_modes.action_downtime_suggest import (
    suggest_action_downtime_requirements,
)


def test_recommended_action_entry_defaults_requires_downtime_false():
    entry = RecommendedActionEntry(description="Inspect seal")
    assert entry.requires_downtime is False


def test_normalize_recommended_action_adds_default():
    assert normalize_recommended_action({"description": "Check alignment"}) == {
        "description": "Check alignment",
        "requires_downtime": False,
    }


def test_normalize_recommended_action_preserves_true():
    action = {"description": "Replace bearings", "requires_downtime": True}
    assert normalize_recommended_action(action)["requires_downtime"] is True


def test_normalize_recommended_actions_list():
    out = normalize_recommended_actions(
        ["plain string", {"description": "Lubricate", "requires_downtime": True}]
    )
    assert out[0] == "plain string"
    assert out[1]["requires_downtime"] is True


@pytest.mark.asyncio
async def test_suggest_action_downtime_requirements_parses_llm_response():
    mock_response = MagicMock()
    mock_response.choices = [
        MagicMock(
            message=MagicMock(
                content='{"results": [{"i": 0, "requires_downtime": true, "reasoning": "Requires shutdown for seal replacement."}]}'
            )
        )
    ]

    with patch(
        "services.failure_modes.action_downtime_suggest.chat_completion_response",
        new_callable=AsyncMock,
        return_value=mock_response,
    ):
        results = await suggest_action_downtime_requirements(
            [
                {
                    "action_index": 2,
                    "description": "Replace mechanical seal",
                    "action_type": "CM",
                    "current_requires_downtime": False,
                    "failure_mode": "Seal Failure",
                    "equipment": "Pump",
                }
            ],
            user_id="u1",
            company_id="c1",
        )

    assert len(results) == 1
    assert results[0]["action_index"] == 2
    assert results[0]["suggested_requires_downtime"] is True
    assert results[0]["changed"] is True
    assert "shutdown" in results[0]["reasoning"].lower()


@pytest.mark.asyncio
async def test_check_failure_mode_action_downtime_endpoint(monkeypatch):
    from routes.ai_fm_suggestions import check_failure_mode_action_downtime
    from routes.ai_fm_suggestions import CheckActionDowntimeRequest

    class _FakeFmService:
        async def get_by_id(self, fm_id):
            return {
                "id": fm_id,
                "failure_mode": "Bearing Failure",
                "equipment": "Pump",
                "recommended_actions": [
                    {"description": "Monitor vibration", "requires_downtime": False},
                    {"description": "Replace bearings", "requires_downtime": False},
                ],
            }

        async def update(self, *args, **kwargs):
            return True

    async def _fake_suggest(actions, **kwargs):
        return [
            {
                "action_index": 0,
                "current_requires_downtime": False,
                "suggested_requires_downtime": False,
                "reasoning": "Online monitoring.",
                "changed": False,
            },
            {
                "action_index": 1,
                "current_requires_downtime": False,
                "suggested_requires_downtime": True,
                "reasoning": "Bearing replacement needs shutdown.",
                "changed": True,
            },
        ]

    import database

    monkeypatch.setattr(database, "failure_modes_service", _FakeFmService())
    monkeypatch.setattr(
        "routes.ai_fm_suggestions.suggest_action_downtime_requirements",
        _fake_suggest,
    )

    response = await check_failure_mode_action_downtime(
        CheckActionDowntimeRequest(failure_mode_id="fm-1", apply=False),
        current_user={"id": "user-1", "company_id": "co-1"},
    )

    assert response.failure_mode_id == "fm-1"
    assert response.actions_before == 2
    assert response.changes_suggested == 1
    assert response.results[1].suggested_requires_downtime is True
