"""Tests for OpenAI service usage tracking."""
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.modules.setdefault("openai", MagicMock(OpenAI=MagicMock()))

from services.openai_service import _record_openai_usage, chat_completion


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
        "services.openai_service._record_openai_usage"
    ) as record_mock, patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}):
        result = await chat_completion(
            messages=[{"role": "user", "content": "hi"}],
            user_id="user-1",
            company_id="co-1",
            feature="test_feature",
        )

    assert result == "hello"
    record_mock.assert_called_once()
    kwargs = record_mock.call_args.kwargs
    assert kwargs["user_id"] == "user-1"
    assert kwargs["company_id"] == "co-1"
    assert kwargs["feature"] == "test_feature"


def test_record_openai_usage_skips_without_usage():
    with patch("services.ai_cost_guard.record_ai_tokens") as record_mock:
        _record_openai_usage(MagicMock(usage=None), endpoint="test", model="gpt-4o")
    record_mock.assert_not_called()


def test_record_openai_usage_calls_record_ai_tokens():
    usage = MagicMock(prompt_tokens=10, completion_tokens=5)
    response = MagicMock(usage=usage)

    with patch("services.ai_cost_guard.record_ai_tokens") as record_mock:
        _record_openai_usage(
            response,
            endpoint="openai_service.chat_completion",
            model="gpt-4o",
            user_id="u1",
            company_id="c1",
            feature="pm_import",
        )

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
