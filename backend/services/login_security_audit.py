"""Security audit events for login and email 2FA."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from database import db


async def log_login_security_event(
    event: str,
    *,
    tenant_id: Optional[str] = None,
    user_id: Optional[str] = None,
    email: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent_hash: Optional[str] = None,
    result: str = "success",
    reason: Optional[str] = None,
    details: Optional[dict[str, Any]] = None,
) -> None:
    doc = {
        "event": event,
        "tenant_id": tenant_id,
        "user_id": user_id,
        "email": email,
        "ip_address": ip_address,
        "user_agent_hash": user_agent_hash,
        "result": result,
        "reason": reason,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if details:
        doc["details"] = details
    await db.security_audit_log.insert_one(doc)
