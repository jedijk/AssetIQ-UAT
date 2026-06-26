"""
LLM output validation helpers — Platform 1.0 WS5.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Union

logger = logging.getLogger(__name__)


def strip_markdown_json_fence(text: str) -> str:
    """Remove optional ```json ... ``` wrapping from model output."""
    clean = (text or "").strip()
    if clean.startswith("```"):
        clean = clean.split("```", 1)[1] if "```" in clean[3:] else clean[3:]
        if clean.startswith("json"):
            clean = clean[4:]
        if "```" in clean:
            clean = clean.rsplit("```", 1)[0]
    return clean.strip()


def parse_json_from_llm(
    text: Optional[str],
    *,
    default: Optional[Union[Dict[str, Any], List[Any]]] = None,
) -> Union[Dict[str, Any], List[Any]]:
    """Parse JSON object or array from an LLM response string."""
    if text is None:
        logger.error("LLM response is None")
        return default if default is not None else {}
    clean = strip_markdown_json_fence(text)
    try:
        data = json.loads(clean)
        if isinstance(data, (dict, list)):
            return data
        logger.error("Expected JSON object or array, got %s", type(data).__name__)
    except json.JSONDecodeError as exc:
        logger.error("JSON parse error: %s. Response: %s", exc, clean[:500])
    return default if default is not None else {}
