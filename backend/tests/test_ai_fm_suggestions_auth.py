"""Ensure AI failure-mode suggestion routes require authentication."""
from pathlib import Path


def test_ai_suggestions_router_requires_library_write():
    source = (Path(__file__).resolve().parents[1] / "routes" / "ai_fm_suggestions.py").read_text()
    assert "dependencies=[Depends(require_permission(" in source.replace("\n", " ")
    assert 'prefix="/ai-suggestions"' in source
    assert "execute_json_prompt" in source
    assert "AsyncOpenAI" not in source
