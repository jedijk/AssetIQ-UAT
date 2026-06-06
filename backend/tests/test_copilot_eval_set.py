"""Tests for copilot golden prompt eval set."""
import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

PROMPTS_PATH = Path(__file__).resolve().parents[1] / "eval" / "copilot_golden_prompts.json"


def test_golden_prompts_schema():
    with PROMPTS_PATH.open() as f:
        prompts = json.load(f)
    assert len(prompts) == 20
    ids = {p["id"] for p in prompts}
    assert len(ids) == 20
    for item in prompts:
        assert item.get("prompt")
        assert item.get("expected_intent")
        assert isinstance(item.get("keyword_checks", []), list)


@pytest.mark.asyncio
async def test_classify_intent_dry_run_sample():
    from services.ril_copilot_service import ReliabilityCopilotService

    service = ReliabilityCopilotService(MagicMock(), MagicMock())
    intent = await service._classify_intent("Why is P-104 high risk?")
    assert intent == "risk_analysis"


def test_eval_script_loads_prompts():
    import importlib.util

    script = Path(__file__).resolve().parents[1] / "scripts" / "run_copilot_eval.py"
    spec = importlib.util.spec_from_file_location("run_copilot_eval", script)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    prompts = mod.load_prompts()
    assert len(prompts) == 20
