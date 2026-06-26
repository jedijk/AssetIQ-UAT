"""Audit log for tenant management actions."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional


async def log_tenant_audit(
    event: str,
    *,
    tenant_id: str,
    actor: Optional[dict] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    from database import db

    doc = {
        "id": str(uuid.uuid4()),
        "event": event,
        "tenant_id": tenant_id,
        "actor": {
            "id": (actor or {}).get("id"),
            "email": (actor or {}).get("email"),
            "role": (actor or {}).get("role"),
        },
        "details": details or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.tenant_management_audit.insert_one(doc)
    except Exception:
        pass
