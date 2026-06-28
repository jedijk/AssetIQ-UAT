"""Audit logging for universal AI platform executions."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import db

logger = logging.getLogger(__name__)


async def log_ai_execution(
    *,
    execution_id: str,
    feature: str,
    intent: str,
    user_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    prompt_id: Optional[str] = None,
    prompt_version: Optional[str] = None,
    ai_model: Optional[str] = None,
    duration_ms: Optional[int] = None,
    cost_usd: Optional[float] = None,
    evidence_ids: Optional[List[str]] = None,
    graph_entity_ids: Optional[List[str]] = None,
    equipment_id: Optional[str] = None,
    result: str = "success",
    reason: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    doc = {
        "id": execution_id,
        "execution_id": execution_id,
        "category": "ai_platform_execution",
        "feature": feature,
        "intent": intent,
        "user_id": user_id,
        "tenant_id": tenant_id,
        "prompt_id": prompt_id,
        "prompt_version": prompt_version,
        "ai_model": ai_model,
        "duration_ms": duration_ms,
        "cost_usd": cost_usd,
        "evidence_ids": evidence_ids or [],
        "graph_entity_ids": graph_entity_ids or [],
        "equipment_id": equipment_id,
        "result": result,
        "reason": reason,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if details:
        doc["details"] = details
    try:
        await db.security_audit_log.insert_one(doc)
    except Exception as exc:
        logger.warning("AI execution audit log failed: %s", exc)
        doc.pop("category", None)
        doc["ts"] = doc.pop("timestamp")
        try:
            await db.audit_log.insert_one(doc)
        except Exception:
            logger.debug("Fallback audit log also failed", exc_info=True)


def new_execution_id() -> str:
    return str(uuid.uuid4())
