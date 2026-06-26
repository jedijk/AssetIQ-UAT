"""AI Risk Engine — dashboard intent and prompt-injection guards."""
import json
import logging
import os
from typing import Any, Dict

from fastapi import HTTPException

from database import ai_usage_tracker
from services.ai_gateway import chat, user_context
from services.ai_security_service import detect_prompt_injection

logger = logging.getLogger(__name__)


class DashboardIntentRequest(dict):
    """Compat shim: request body is a dict in this codebase."""
    pass


def check_injection_attempt(data: dict, endpoint: str) -> None:
    """Check for prompt injection in request data and log/block if detected."""
    for key, value in data.items():
        if isinstance(value, str):
            is_suspicious, matched = detect_prompt_injection(value)
            if is_suspicious:
                logger.warning(f"Potential prompt injection blocked on {endpoint}: {matched[:50]}")
                raise HTTPException(
                    status_code=400,
                    detail="Request contains potentially unsafe content",
                )


async def log_ai_usage(
    user_id: str,
    feature: str,
    model: str = "gpt-4o",
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    installation_name: str = "default",
    installation_id: str = "default",
    success: bool = True,
    metadata: dict = None,
):
    """Helper to log AI usage to the tracking service."""
    try:
        await ai_usage_tracker.log_usage(
            installation_id=installation_id,
            installation_name=installation_name,
            user_id=user_id,
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            feature=feature,
            metadata={**(metadata or {}), "success": success},
        )
    except Exception as e:
        logger.error(f"Failed to log AI usage: {e}")


async def dashboard_intent(
    actor: dict,
    body: Dict[str, Any],
):
    """
    Convert a natural-language dashboard request into a safe, template-based intent.

    Returns:
      {
        "success": true,
        "intent": {
          "template_id": "...",
          "title": "...",
          "why": "...",
          "params": {...}
        }
      }
    """
    prompt = (body or {}).get("prompt") or (body or {}).get("message") or ""
    if not isinstance(prompt, str) or not prompt.strip():
        raise HTTPException(status_code=400, detail="prompt is required")

    check_injection_attempt({"prompt": prompt}, endpoint="/ai/dashboard-intent")

    templates = [
        {
            "template_id": "overdue_actions_by_owner",
            "title": "Overdue actions by owner",
            "description": "Counts overdue actions (due date before today, not closed) grouped by owner.",
            "sources": ["Actions"],
        },
        {
            "template_id": "open_actions_kpi",
            "title": "Open actions",
            "description": "Counts actions that are not closed/completed.",
            "sources": ["Actions"],
        },
        {
            "template_id": "open_investigations_kpi",
            "title": "Open investigations",
            "description": "Counts investigations that are not completed/closed.",
            "sources": ["Investigations"],
        },
        {
            "template_id": "critical_observations_kpi",
            "title": "Critical observations",
            "description": "Counts observations with risk level Critical/High (where available).",
            "sources": ["Observations"],
        },
        {
            "template_id": "clarify",
            "title": "Clarify question",
            "description": "Ask exactly one clarification question when the prompt is ambiguous.",
            "sources": [],
        },
    ]

    user = {
        "prompt": prompt.strip(),
        "available_templates": templates,
        "defaults": {"window": "last_30d", "limit": 10},
        "user_context": {
            "role": actor.get("role"),
            "user_id": actor.get("id"),
        },
    }

    try:
        from services.ai_platform import execute_json_prompt

        model = os.environ.get("OPENAI_MODEL_DASHBOARD_BUILDER", "gpt-4o-mini")
        result = await execute_json_prompt(
            "dashboard.intent_classifier",
            user=actor,
            user_message=json.dumps(user),
            endpoint="ai_routes.dashboard_intent",
            model=model,
            temperature=0.2,
            max_tokens=500,
            response_format={"type": "json_object"},
        )
        parsed = result["parsed"] or {}
        template_id = parsed.get("template_id")
        if template_id not in {t["template_id"] for t in templates}:
            template_id = "clarify"

        intent = {
            "template_id": template_id,
            "title": parsed.get("title") or next(
                (t["title"] for t in templates if t["template_id"] == template_id),
                "Dashboard widget",
            ),
            "why": parsed.get("why") or "Generated from your request.",
            "params": parsed.get("params") if isinstance(parsed.get("params"), dict) else {},
        }

        await log_ai_usage(
            user_id=actor.get("id", "unknown"),
            feature="dashboard_builder_intent",
            model=model,
            prompt_tokens=0,
            completion_tokens=0,
            installation_name=actor.get("installation", "default") if isinstance(actor, dict) else "default",
            installation_id=actor.get("installation_id", "default") if isinstance(actor, dict) else "default",
            success=True,
            metadata={"template_id": template_id},
        )

        return {"success": True, "intent": intent}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"dashboard_intent error: {e}")
        raise HTTPException(status_code=500, detail="AI dashboard intent failed")
