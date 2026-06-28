"""Request audit logging for External API (no plaintext keys)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import db

REQUESTS_COLLECTION = "external_api_requests"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def log_request(
    *,
    tenant_id: str,
    key_id: str,
    method: str,
    path: str,
    status_code: int,
    response_ms: float,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
    observation_id: Optional[str] = None,
    external_reference: Optional[str] = None,
    source_system: Optional[str] = None,
    error_detail: Optional[str] = None,
) -> str:
    request_id = str(uuid.uuid4())
    doc = {
        "id": request_id,
        "tenant_id": tenant_id,
        "key_id": key_id,
        "method": method,
        "path": path,
        "status_code": status_code,
        "response_ms": round(response_ms, 2),
        "client_ip": client_ip,
        "user_agent": (user_agent or "")[:512],
        "observation_id": observation_id,
        "external_reference": external_reference,
        "source_system": source_system,
        "error_detail": (error_detail or "")[:500] if error_detail else None,
        "created_at": _now_iso(),
    }
    await db[REQUESTS_COLLECTION].insert_one(doc)
    return request_id


async def list_recent_requests(tenant_id: str, key_id: str, *, limit: int = 50) -> List[Dict[str, Any]]:
    cursor = (
        db[REQUESTS_COLLECTION]
        .find({"tenant_id": tenant_id, "key_id": key_id})
        .sort("created_at", -1)
        .limit(limit)
    )
    docs = await cursor.to_list(limit)
    return [
        {
            "id": d.get("id"),
            "method": d.get("method"),
            "path": d.get("path"),
            "status_code": d.get("status_code"),
            "response_ms": d.get("response_ms"),
            "observation_id": d.get("observation_id"),
            "external_reference": d.get("external_reference"),
            "source_system": d.get("source_system"),
            "error_detail": d.get("error_detail"),
            "created_at": d.get("created_at"),
        }
        for d in docs
    ]
