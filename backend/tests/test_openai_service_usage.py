"""Tests for OpenAI service usage tracking."""
import sys
from unittest.mock import MagicMock, patch

import pytest

import services.ai_cost_guard  # noqa: F401 — ensure patch target is loaded

sys.modules.setdefault("openai", MagicMock(OpenAI=MagicMock()))

from services.openai_service import UsageContext, _record_chat_usage, chat_completion


@pytest.mark.asyncio
async def test_chat_completion_records_usage():
    usage = MagicMock(prompt_tokens=100, completion_tokens=50)
    response = MagicMock(
        choices=[MagicMock(message=MagicMock(content="hello"))],
        usage=usage,
    )
    client = MagicMock()
    client.chat.completions.create.return_value = response

    with patch("services.openai_service.OpenAI", return_value=client), patch(
        "services.openai_service._record_chat_usage"
    ) as record_mock, patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}):
        result = await chat_completion(
            messages=[{"role": "user", "content": "hi"}],
            user_id="user-1",
            company_id="co-1",
            feature="test_feature",
        )

    assert result == "hello"
    record_mock.assert_called_once()
    usage_context = record_mock.call_args.kwargs["usage"]
    assert usage_context.user_id == "user-1"
    assert usage_context.company_id == "co-1"
    assert usage_context.feature == "test_feature"


def test_record_chat_usage_skips_when_openai_returns_no_usage():
    with patch("services.ai_cost_guard.record_ai_tokens") as record_mock:
        _record_chat_usage(
            MagicMock(usage=None),
            model="gpt-4o",
            usage=UsageContext(endpoint="test"),
        )
    record_mock.assert_not_called()


def test_record_chat_usage_persists_token_counts():
    usage = MagicMock(prompt_tokens=10, completion_tokens=5)
    response = MagicMock(usage=usage)
    context = UsageContext(
        user_id="u1",
        company_id="c1",
        feature="pm_import",
        endpoint="openai_service.chat_completion",
    )

    with patch("services.ai_cost_guard.record_ai_tokens") as record_mock:
        _record_chat_usage(response, model="gpt-4o", usage=context)

    record_mock.assert_called_once_with(
        user_id="u1",
        company_id="c1",
        endpoint="openai_service.chat_completion",
        prompt_tokens=10,
        completion_tokens=5,
        model="gpt-4o",
        feature="pm_import",
        installation_id=None,
        installation_name=None,
    )
