"""Chat-based AI analysis for the risk analysis service."""
from __future__ import annotations

import logging

from services.ai_risk_dashboard import check_injection_attempt

logger = logging.getLogger(__name__)


async def chat_analyze(actor: dict, data: dict):
    """
    Simple chat-based AI analysis endpoint.
    Accepts a message and returns AI-generated analysis.
    """
    message = data.get("message", data.get("input", ""))
    if not message:
        return {
            "success": False,
            "error": "No message provided",
            "message": "Please provide a message to analyze",
        }

    check_injection_attempt({"message": message}, endpoint="/ai/chat-analyze")

    try:
        from services.ai_execute_grounded import execute_grounded, overlay_grounded_contract

        equipment_id = data.get("equipment_id")
        grounded = await execute_grounded(
            user=actor,
            intent="chat_analyze",
            query=message,
            feature="ai_risk_analysis.chat_analyze",
            equipment_id=equipment_id,
            prompt_id="chat.general_assistant",
            endpoint="ai_routes.chat_analyze",
            model="gpt-4o",
            temperature=0.7,
            max_tokens=1000,
            parse_json=False,
        )
        ai_response = grounded.get("summary") or grounded.get("recommendation") or ""

        return overlay_grounded_contract(
            {
                "success": True,
                "message": "Chat analyze working",
                "input": message,
                "response": ai_response,
                "model": grounded.get("ai_model", "gpt-4o"),
            },
            grounded,
        )

    except Exception as e:
        logger.error(f"Chat analyze error: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "message": "AI analysis failed",
        }
