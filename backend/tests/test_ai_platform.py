"""AI platform unit tests — Platform 1.0 WS5."""
from unittest.mock import AsyncMock, patch

import pytest

from services.ai_output_validation import parse_json_from_llm, strip_markdown_json_fence
from services.ai_prompt_registry import get_prompt, list_prompts, render_prompt
from services.ai_platform import (
    execute_json_prompt,
    execute_multimodal_json_prompt,
    execute_prompt,
    execute_vision_json_prompt,
)


def test_strip_markdown_json_fence():
    raw = '```json\n{"ok": true}\n```'
    assert strip_markdown_json_fence(raw) == '{"ok": true}'


def test_parse_json_from_llm_handles_fenced_json():
    assert parse_json_from_llm('```json\n{"a": 1}\n```') == {"a": 1}


def test_prompt_registry_contains_core_prompts():
    prompts = list_prompts()
    for pid in (
        "chat.threat_extraction",
        "chat.data_query",
        "chat.general_assistant",
        "risk.analysis",
        "investigation.defensive_reasoning",
        "reliability.grounded_assistant",
        "fm.failure_mode_mapping",
        "fm.improve_failure_mode",
        "vision.damage_analysis",
        "maintenance.strategy_generation",
    ):
        assert pid in prompts


def test_parse_json_from_llm_handles_json_array():
    assert parse_json_from_llm('[{"a": 1}]') == [{"a": 1}]


def test_prompt_registry_minimum_coverage():
    prompts = list_prompts()
    assert len(prompts) >= 56
    assert "vision.field_extraction" in prompts
    assert "pm_import.vision_ocr" in prompts
    assert "process_import.vision_extract" in prompts
    assert "fm.confirm_similar_cluster" in prompts
    assert "fm.action_discipline_map" in prompts


def test_render_prompt_language_variables():
    text = render_prompt("chat.issue_summary", {"lang_rule": "Respond in Dutch."})
    assert "Respond in Dutch." in text
    assert "{lang_rule}" not in text


def test_render_prompt_vision_field_extraction():
    text = render_prompt(
        "vision.field_extraction",
        {
            "fields_block": '\n  - "pressure": Gauge reading (type: number)',
            "date_rules_block": "",
            "anchor_block": "",
            "hints_block": "",
        },
    )
    assert '"pressure"' in text
    assert "{fields_block}" not in text


def test_build_prompt_uses_registry():
    from routes.ai_extract import ExtractionField, ExtractionSchema, _build_prompt

    schema = ExtractionSchema(
        fields=[
            ExtractionField(key="pressure", description="Gauge reading", type="number"),
        ]
    )
    prompt = _build_prompt(schema)
    assert "Fields to extract:" in prompt
    assert '"pressure"' in prompt
    assert "Return ONLY valid JSON" in prompt


def test_render_prompt_substitutes_variables():
    text = render_prompt("chat.data_query", {"data_context": "Threats: 3"})
    assert "Threats: 3" in text
    assert "{data_context}" not in text


@pytest.mark.asyncio
async def test_execute_prompt_substitutes_system_variables():
    with patch(
        "services.ai_platform.ai_gateway_chat",
        new_callable=AsyncMock,
        return_value="Summary",
    ):
        result = await execute_prompt(
            "chat.issue_summary",
            user={"id": "u1", "company_id": "co1"},
            user_message="Pump leak",
            variables={"lang_rule": "Respond in Dutch."},
        )
    assert result["content"] == "Summary"
    assert result["prompt_id"] == "chat.issue_summary"


@pytest.mark.asyncio
async def test_execute_prompt_smoke():
    with patch(
        "services.ai_platform.ai_gateway_chat",
        new_callable=AsyncMock,
        return_value="Hello",
    ):
        result = await execute_prompt(
            "chat.general_assistant",
            user={"id": "u1", "company_id": "co1"},
            user_message="Status?",
        )
    assert result["content"] == "Hello"
    assert result["prompt_id"] == "chat.general_assistant"
    assert get_prompt("chat.general_assistant").default_model == "gpt-4o"


@pytest.mark.asyncio
async def test_execute_json_prompt_parses_response():
    with patch(
        "services.ai_platform.ai_gateway_chat",
        new_callable=AsyncMock,
        return_value='{"answer": "42", "is_data_query": true}',
    ):
        result = await execute_json_prompt(
            "chat.data_query",
            user={"id": "u1", "company_id": "co1"},
            user_message="How many?",
            variables={"data_context": "total=42"},
        )
    assert result["parsed"]["answer"] == "42"


@pytest.mark.asyncio
async def test_execute_vision_json_prompt_parses_response():
    with patch(
        "services.ai_gateway.chat_with_images",
        new_callable=AsyncMock,
        return_value='{"damage_detected": true}',
    ) as mock_vision:
        result = await execute_vision_json_prompt(
            "vision.damage_analysis",
            user={"id": "u1", "company_id": "co1"},
            user_message="Inspect pump seal",
            image_base64="abc123",
        )
    assert result["parsed"]["damage_detected"] is True
    assert mock_vision.called


@pytest.mark.asyncio
async def test_execute_vision_json_prompt_uses_prompt_text_override():
    with patch(
        "services.ai_gateway.chat_with_images",
        new_callable=AsyncMock,
        return_value='{"results": []}',
    ) as mock_vision:
        result = await execute_vision_json_prompt(
            "vision.field_extraction",
            user={"id": "u1", "company_id": "co1"},
            user_message="",
            prompt_text="Custom extraction instructions",
            image_base64="abc123",
        )
    assert result["parsed"]["results"] == []
    call_args = mock_vision.call_args
    assert call_args[0][0] == "Custom extraction instructions"


@pytest.mark.asyncio
async def test_execute_multimodal_json_prompt_parses_response():
    with patch(
        "services.ai_platform.ai_gateway_chat",
        new_callable=AsyncMock,
        return_value='{"severity": "minor"}',
    ):
        result = await execute_multimodal_json_prompt(
            "chat.attachment_analysis",
            user={"id": "u1", "company_id": "co1"},
            user_content=[{"type": "text", "text": "context"}],
        )
    assert result["parsed"]["severity"] == "minor"
