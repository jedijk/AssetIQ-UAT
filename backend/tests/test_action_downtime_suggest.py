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
async def test_suggest_action_downtime_includes_fm_id_in_results():
    mock_response = MagicMock()
    mock_response.choices = [
        MagicMock(
            message=MagicMock(
                content='{"results": [{"i": 0, "requires_downtime": false, "reasoning": "Visual round while running."}]}'
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
                    "fm_id": "fm-9",
                    "action_index": 0,
                    "description": "Operator round",
                    "failure_mode": "Leak",
                    "current_requires_downtime": False,
                }
            ],
            user_id="u1",
            company_id="c1",
        )

    assert results[0]["fm_id"] == "fm-9"
    assert results[0]["failure_mode"] == "Leak"


@pytest.mark.asyncio
async def test_classify_downtime_batch_rejects_oversized_batch():
    from services.failure_modes.action_downtime_suggest import (
        classify_recommended_actions_downtime_batch,
    )

    with pytest.raises(ValueError, match="at most 4"):
        await classify_recommended_actions_downtime_batch(
            [{"action_index": i, "description": f"Action {i}"} for i in range(5)],
            user_id="u1",
            company_id="c1",
        )


@pytest.mark.asyncio
async def test_suggest_chunk_json_parse_fallback():
    mock_response = MagicMock()
    mock_response.choices = [MagicMock(message=MagicMock(content="not-json"))]

    with patch(
        "services.failure_modes.action_downtime_suggest.chat_completion_response",
        new_callable=AsyncMock,
        return_value=mock_response,
    ):
        from services.failure_modes.action_downtime_suggest import _suggest_chunk

        results = await _suggest_chunk(
            [
                {
                    "action_index": 0,
                    "description": "Inspect seal",
                    "current_requires_downtime": False,
                }
            ],
            user_id="u1",
            company_id="c1",
            endpoint="test",
        )

    assert len(results) == 1
    assert results[0]["suggested_requires_downtime"] is False
    assert results[0]["changed"] is False


@pytest.mark.asyncio
async def test_review_action_downtime_endpoint():
    from routes.ai_fm_suggestions import (
        ActionDowntimeInput,
        ReviewActionDowntimeRequest,
        review_action_downtime,
    )

    async def _fake_suggest(actions, **kwargs):
        return [
            {
                "fm_id": actions[0]["fm_id"],
                "action_index": actions[0]["action_index"],
                "failure_mode": actions[0]["failure_mode"],
                "current_requires_downtime": False,
                "suggested_requires_downtime": True,
                "reasoning": "Needs isolation.",
                "changed": True,
            }
        ]

    with patch(
        "routes.ai_fm_suggestions.classify_recommended_actions_downtime_batch",
        new_callable=AsyncMock,
        side_effect=_fake_suggest,
    ):
        response = await review_action_downtime(
            ReviewActionDowntimeRequest(
                actions=[
                    ActionDowntimeInput(
                        fm_id="fm-1",
                        action_index=0,
                        description="Replace seal",
                        failure_mode="Seal leak",
                    )
                ]
            ),
            current_user={"id": "user-1", "company_id": "co-1"},
        )

    assert len(response.results) == 1
    assert response.results[0].fm_id == "fm-1"
    assert response.results[0].suggested_requires_downtime is True


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
