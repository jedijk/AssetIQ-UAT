"""
Central prompt registry — Platform 1.0 WS5.

Versioned system prompts for AI features. New AI capabilities should register
prompts here and execute via `services.ai_platform`.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional


@dataclass(frozen=True)
class PromptSpec:
    """A versioned prompt template."""

    id: str
    version: str
    text: str
    description: str = ""
    default_model: str = "gpt-4o-mini"
    response_format: Optional[str] = None  # e.g. "json"


_REGISTRY: Dict[str, PromptSpec] = {}


def register_prompt(spec: PromptSpec, *, replace: bool = False) -> None:
    if spec.id in _REGISTRY and not replace:
        raise ValueError(f"Prompt already registered: {spec.id}")
    _REGISTRY[spec.id] = spec


def get_prompt(prompt_id: str, *, version: Optional[str] = None) -> PromptSpec:
    spec = _REGISTRY.get(prompt_id)
    if spec is None:
        raise KeyError(f"Unknown prompt: {prompt_id}")
    if version is not None and spec.version != version:
        raise KeyError(f"Prompt {prompt_id} version mismatch: want {version}, have {spec.version}")
    return spec


def render_prompt(prompt_id: str, variables: Optional[Dict[str, str]] = None) -> str:
    """Return prompt text with optional ``{key}`` substitution."""
    text = get_prompt(prompt_id).text
    if not variables:
        return text
    for key, value in variables.items():
        text = text.replace("{" + key + "}", str(value))
    return text


def list_prompts() -> Dict[str, str]:
    """Map prompt id → version (for audits)."""
    return {pid: spec.version for pid, spec in sorted(_REGISTRY.items())}


def _bootstrap() -> None:
    from ai_helpers import IMAGE_ANALYSIS_SYSTEM_PROMPT, THREAT_ANALYSIS_SYSTEM_PROMPT

    register_prompt(
        PromptSpec(
            id="chat.threat_extraction",
            version="1.0",
            description="Extract equipment failure threats from operator chat messages",
            text=THREAT_ANALYSIS_SYSTEM_PROMPT,
            default_model="gpt-4o-mini",
            response_format="json",
        ),
        replace=True,
    )
    register_prompt(
        PromptSpec(
            id="chat.image_analysis",
            version="1.0",
            description="Describe equipment damage visible in a photo",
            text=IMAGE_ANALYSIS_SYSTEM_PROMPT,
            default_model="gpt-4o",
        ),
        replace=True,
    )
    register_prompt(
        PromptSpec(
            id="reliability.grounded_assistant",
            version="1.0",
            description="Grounded reliability copilot — cite evidence only",
            text="""You are an AssetIQ reliability AI assistant.

Rules:
- Answer using ONLY the provided evidence and tool results.
- Cite sources inline as [cite:<id>] when referencing specific entities, KPIs, or graph edges.
- End with a "Sources" section listing cited IDs.
- Be concise, actionable, and focused on reliability and maintenance.
- Use markdown formatting when helpful.""",
            default_model="gpt-4o",
        ),
        replace=True,
    )


_bootstrap()
