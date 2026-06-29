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
    equipment_id: Optional[str] = None,
    external_reference: Optional[str] = None,
    source_system: Optional[str] = None,
    error_detail: Optional[str] = None,
    rows_returned: Optional[int] = None,
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
        "equipment_id": equipment_id,
        "external_reference": external_reference,
        "source_system": source_system,
        "error_detail": (error_detail or "")[:500] if error_detail else None,
        "rows_returned": rows_returned,
        "created_at": _now_iso(),
    }
    await db[REQUESTS_COLLECTION].insert_one(doc)
    return request_id


async def aggregate_usage_trends(tenant_id: str, key_id: str) -> Dict[str, Any]:
    """Aggregate request counts by time window from audit log."""
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    windows = {
        "24h": now - timedelta(hours=24),
        "7d": now - timedelta(days=7),
        "30d": now - timedelta(days=30),
        "12mo": now - timedelta(days=365),
    }
    trends: Dict[str, Any] = {}
    for label, start in windows.items():
        start_iso = start.isoformat()
        base = {"tenant_id": tenant_id, "key_id": key_id, "created_at": {"$gte": start_iso}}
        total = await db[REQUESTS_COLLECTION].count_documents(base)
        errors = await db[REQUESTS_COLLECTION].count_documents({**base, "status_code": {"$gte": 400}})
        observations = await db[REQUESTS_COLLECTION].count_documents(
            {**base, "observation_id": {"$exists": True, "$ne": None}, "status_code": {"$lt": 400}}
        )
        equipment_reads = await db[REQUESTS_COLLECTION].count_documents(
            {
                **base,
                "status_code": {"$lt": 400},
                "$or": [
                    {"equipment_id": {"$exists": True, "$ne": None}},
                    {"path": {"$regex": r"/equipment/|/hierarchy$"}},
                ],
            }
        )
        pipeline = [
            {"$match": {**base, "status_code": {"$lt": 400}}},
            {"$group": {"_id": None, "avg_ms": {"$avg": "$response_ms"}}},
        ]
        avg_result = await db[REQUESTS_COLLECTION].aggregate(pipeline).to_list(1)
        avg_ms = round(avg_result[0]["avg_ms"], 1) if avg_result else None
        trends[label] = {
            "total_requests": total,
            "total_errors": errors,
            "observations_created": observations,
            "equipment_reads": equipment_reads,
            "avg_response_ms": avg_ms,
            "requests": total,
            "errors": errors,
            "success_rate_pct": round((total - errors) / total * 100, 1) if total else None,
        }
    return trends


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
            "equipment_id": d.get("equipment_id"),
            "external_reference": d.get("external_reference"),
            "source_system": d.get("source_system"),
            "error_detail": d.get("error_detail"),
            "created_at": d.get("created_at"),
        }
        for d in docs
    ]
