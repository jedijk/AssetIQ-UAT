"""External API key generation, storage, CRUD, rotation, and rate limiting."""
from __future__ import annotations

import hashlib
import ipaddress
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from database import db

KEY_PREFIX = "aiq_live_"
KEYS_COLLECTION = "external_api_keys"
_TOKEN_BODY_PATTERN = re.compile(r"^[0-9a-zA-Z_-]{32,64}$")
DEFAULT_SCOPES = ["observations:create"]
ALLOWED_SCOPES = frozenset({"observations:create", "equipment:read"})
GRACE_COLLECTION_FIELD = "previous_key_hashes"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def generate_api_key() -> str:
    return f"{KEY_PREFIX}{secrets.token_urlsafe(32)}"


def hash_api_key(raw_key: str) -> str:
    normalized = normalize_api_key(raw_key)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def normalize_api_key(raw: str) -> str:
    token = (raw or "").strip()
    if not token:
        raise ValueError("API key is required")
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    if not token.startswith(KEY_PREFIX):
        token = f"{KEY_PREFIX}{token}"
    return token


def validate_api_key_format(raw_key: str) -> bool:
    try:
        normalized = normalize_api_key(raw_key)
    except ValueError:
        return False
    body = normalized[len(KEY_PREFIX) :]
    return bool(_TOKEN_BODY_PATTERN.match(body))


def key_display_prefix(raw_key: str) -> str:
    try:
        normalized = normalize_api_key(raw_key)
    except ValueError:
        return KEY_PREFIX + "****"
    return normalized[:16] + "…"


def _public_key_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": doc["id"],
        "name": doc.get("name", ""),
        "key_prefix": doc.get("key_prefix", KEY_PREFIX + "****"),
        "scopes": doc.get("scopes") or DEFAULT_SCOPES,
        "enabled": bool(doc.get("enabled", True)) and not doc.get("revoked_at"),
        "rate_limit_per_minute": int(doc.get("rate_limit_per_minute") or 120),
        "ip_allowlist": doc.get("ip_allowlist") or [],
        "description": doc.get("description"),
        "created_at": doc.get("created_at"),
        "created_by": doc.get("created_by"),
        "last_used_at": doc.get("last_used_at"),
        "revoked_at": doc.get("revoked_at"),
        "rotated_at": doc.get("rotated_at"),
        "status": _key_status(doc),
    }


def _key_status(doc: Dict[str, Any]) -> str:
    if doc.get("revoked_at"):
        return "revoked"
    if not doc.get("enabled", True):
        return "disabled"
    return "active"


def _tenant_filter(tenant_id: str, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    q: Dict[str, Any] = {"tenant_id": tenant_id}
    if extra:
        q.update(extra)
    return q


async def create_key(
    tenant_id: str,
    *,
    name: str,
    created_by: str,
    scopes: Optional[List[str]] = None,
    rate_limit_per_minute: int = 120,
    ip_allowlist: Optional[List[str]] = None,
    description: Optional[str] = None,
) -> Tuple[Dict[str, Any], str]:
    raw_key = generate_api_key()
    key_hash = hash_api_key(raw_key)
    key_id = str(uuid.uuid4())
    now = _iso(_now())
    scope_list = scopes or DEFAULT_SCOPES
    invalid = [s for s in scope_list if s not in ALLOWED_SCOPES]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid scopes: {', '.join(invalid)}")
    doc = {
        "id": key_id,
        "tenant_id": tenant_id,
        "name": name.strip(),
        "key_hash": key_hash,
        "key_prefix": raw_key[:16] + "…",
        "scopes": scope_list,
        "enabled": True,
        "rate_limit_per_minute": rate_limit_per_minute,
        "ip_allowlist": ip_allowlist or [],
        "description": description,
        "created_at": now,
        "created_by": created_by,
        "usage": {
            "total_requests": 0,
            "total_errors": 0,
            "observations_created": 0,
            "equipment_requests": 0,
            "response_time_ms_total": 0,
        },
        GRACE_COLLECTION_FIELD: [],
    }
    await db[KEYS_COLLECTION].insert_one(doc)
    public = _public_key_doc(doc)
    public["api_key"] = raw_key
    return public, raw_key


async def list_keys(tenant_id: str) -> List[Dict[str, Any]]:
    cursor = db[KEYS_COLLECTION].find(_tenant_filter(tenant_id)).sort("created_at", -1)
    docs = await cursor.to_list(200)
    return [_public_key_doc(d) for d in docs]


async def get_key(tenant_id: str, key_id: str) -> Optional[Dict[str, Any]]:
    doc = await db[KEYS_COLLECTION].find_one(_tenant_filter(tenant_id, {"id": key_id}))
    return _public_key_doc(doc) if doc else None


async def update_key(tenant_id: str, key_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    doc = await db[KEYS_COLLECTION].find_one(_tenant_filter(tenant_id, {"id": key_id}))
    if not doc:
        raise HTTPException(status_code=404, detail="API key not found")
    if doc.get("revoked_at"):
        raise HTTPException(status_code=400, detail="Cannot update a revoked API key")

    allowed = {"name", "scopes", "rate_limit_per_minute", "ip_allowlist", "description", "enabled"}
    set_fields = {k: v for k, v in updates.items() if k in allowed and v is not None}
    if not set_fields:
        return _public_key_doc(doc)
    set_fields["updated_at"] = _iso(_now())
    await db[KEYS_COLLECTION].update_one({"id": key_id, "tenant_id": tenant_id}, {"$set": set_fields})
    doc.update(set_fields)
    return _public_key_doc(doc)


async def revoke_key(tenant_id: str, key_id: str) -> Dict[str, Any]:
    doc = await db[KEYS_COLLECTION].find_one(_tenant_filter(tenant_id, {"id": key_id}))
    if not doc:
        raise HTTPException(status_code=404, detail="API key not found")
    now = _iso(_now())
    await db[KEYS_COLLECTION].update_one(
        {"id": key_id, "tenant_id": tenant_id},
        {"$set": {"revoked_at": now, "enabled": False, "updated_at": now}},
    )
    doc["revoked_at"] = now
    doc["enabled"] = False
    return _public_key_doc(doc)


async def rotate_key(
    tenant_id: str,
    key_id: str,
    *,
    grace_period_hours: int = 24,
) -> Tuple[Dict[str, Any], str]:
    doc = await db[KEYS_COLLECTION].find_one(_tenant_filter(tenant_id, {"id": key_id}))
    if not doc:
        raise HTTPException(status_code=404, detail="API key not found")
    if doc.get("revoked_at"):
        raise HTTPException(status_code=400, detail="Cannot rotate a revoked API key")

    raw_key = generate_api_key()
    new_hash = hash_api_key(raw_key)
    now_dt = _now()
    now = _iso(now_dt)
    grace_until = _iso(now_dt + timedelta(hours=grace_period_hours))
    previous = doc.get(GRACE_COLLECTION_FIELD) or []
    previous.append(
        {
            "key_hash": doc["key_hash"],
            "valid_until": grace_until,
            "rotated_at": now,
        }
    )
    await db[KEYS_COLLECTION].update_one(
        {"id": key_id, "tenant_id": tenant_id},
        {
            "$set": {
                "key_hash": new_hash,
                "key_prefix": raw_key[:16] + "…",
                "rotated_at": now,
                "updated_at": now,
                GRACE_COLLECTION_FIELD: previous,
            }
        },
    )
    doc["key_hash"] = new_hash
    doc["key_prefix"] = raw_key[:16] + "…"
    doc["rotated_at"] = now
    public = _public_key_doc(doc)
    public["api_key"] = raw_key
    return public, raw_key


def _is_ip_allowed(client_ip: Optional[str], allowlist: List[str]) -> bool:
    if not allowlist:
        return True
    if not client_ip:
        return False
    try:
        addr = ipaddress.ip_address(client_ip)
    except ValueError:
        return False
    for entry in allowlist:
        entry = (entry or "").strip()
        if not entry:
            continue
        try:
            if "/" in entry:
                if addr in ipaddress.ip_network(entry, strict=False):
                    return True
            elif addr == ipaddress.ip_address(entry):
                return True
        except ValueError:
            continue
    return False


def _valid_grace_hashes(doc: Dict[str, Any]) -> List[str]:
    now = _now()
    valid: List[str] = []
    for entry in doc.get(GRACE_COLLECTION_FIELD) or []:
        until_raw = entry.get("valid_until")
        if not until_raw:
            continue
        try:
            until = datetime.fromisoformat(until_raw.replace("Z", "+00:00"))
        except ValueError:
            continue
        if until > now and entry.get("key_hash"):
            valid.append(entry["key_hash"])
    return valid


async def authenticate_api_key(raw_key: str, *, required_scope: str, client_ip: Optional[str]) -> Dict[str, Any]:
    if not validate_api_key_format(raw_key):
        raise HTTPException(status_code=401, detail="Invalid API key format")
    key_hash = hash_api_key(raw_key)
    doc = await db[KEYS_COLLECTION].find_one({"key_hash": key_hash})
    if not doc:
        cursor = db[KEYS_COLLECTION].find({f"{GRACE_COLLECTION_FIELD}.key_hash": key_hash})
        candidates = await cursor.to_list(50)
        for candidate in candidates:
            if key_hash in _valid_grace_hashes(candidate):
                doc = candidate
                break
    if not doc:
        raise HTTPException(status_code=401, detail="Invalid API key")
    if doc.get("revoked_at"):
        raise HTTPException(status_code=401, detail="API key revoked")
    if not doc.get("enabled", True):
        raise HTTPException(status_code=401, detail="API key disabled")

    scopes = doc.get("scopes") or DEFAULT_SCOPES
    if required_scope not in scopes:
        raise HTTPException(status_code=403, detail=f"Missing scope: {required_scope}")

    allowlist = doc.get("ip_allowlist") or []
    if not _is_ip_allowed(client_ip, allowlist):
        raise HTTPException(status_code=403, detail="IP address not allowed")

    return doc


async def check_rate_limit(key_doc: Dict[str, Any]) -> None:
    limit = int(key_doc.get("rate_limit_per_minute") or 120)
    key_id = key_doc["id"]
    window_start = _now().replace(second=0, microsecond=0)
    window_id = window_start.isoformat()
    result = await db[KEYS_COLLECTION].find_one_and_update(
        {"id": key_id, "rate_window.window_id": window_id},
        {"$inc": {"rate_window.count": 1}},
        return_document=True,
    )
    if result:
        count = (result.get("rate_window") or {}).get("count", 1)
        if count > limit:
            raise HTTPException(status_code=429, detail="Rate limit exceeded")
        return

    await db[KEYS_COLLECTION].update_one(
        {"id": key_id},
        {"$set": {"rate_window": {"window_id": window_id, "count": 1}}},
    )


async def record_key_usage(
    key_doc: Dict[str, Any],
    *,
    success: bool,
    response_ms: float,
    observation_created: bool = False,
    equipment_request: bool = False,
) -> None:
    inc: Dict[str, Any] = {
        "usage.total_requests": 1,
        "usage.response_time_ms_total": max(0, int(response_ms)),
    }
    if not success:
        inc["usage.total_errors"] = 1
    if observation_created:
        inc["usage.observations_created"] = 1
    if equipment_request:
        inc["usage.equipment_requests"] = 1
    await db[KEYS_COLLECTION].update_one(
        {"id": key_doc["id"]},
        {
            "$inc": inc,
            "$set": {"last_used_at": _iso(_now())},
        },
    )


async def get_key_usage(tenant_id: str, key_id: str, *, limit: int = 50) -> Dict[str, Any]:
    doc = await db[KEYS_COLLECTION].find_one(_tenant_filter(tenant_id, {"id": key_id}))
    if not doc:
        raise HTTPException(status_code=404, detail="API key not found")
    usage = doc.get("usage") or {}
    total_requests = int(usage.get("total_requests") or 0)
    total_errors = int(usage.get("total_errors") or 0)
    observations_created = int(usage.get("observations_created") or 0)
    equipment_requests = int(usage.get("equipment_requests") or 0)
    ms_total = int(usage.get("response_time_ms_total") or 0)
    avg_ms = round(ms_total / total_requests, 1) if total_requests else None

    if doc.get("revoked_at"):
        health = "revoked"
    elif not doc.get("enabled", True):
        health = "disabled"
    elif total_requests == 0:
        health = "unused"
    elif total_errors and total_requests and (total_errors / total_requests) > 0.5:
        health = "degraded"
    else:
        health = "healthy"

    from services.external_api_audit_service import aggregate_usage_trends, list_recent_requests

    recent = await list_recent_requests(tenant_id, key_id, limit=limit)
    trends = await aggregate_usage_trends(tenant_id, key_id)
    return {
        "key_id": key_id,
        "total_requests": total_requests,
        "total_errors": total_errors,
        "observations_created": observations_created,
        "equipment_requests": equipment_requests,
        "avg_response_ms": avg_ms,
        "last_request_at": doc.get("last_used_at"),
        "health_status": health,
        "recent_requests": recent,
        "usage_trends": trends,
    }


def tenant_user_from_key(key_doc: Dict[str, Any]) -> dict:
    tenant_id = key_doc.get("tenant_id")
    return {
        "id": f"external-api:{key_doc.get('id')}",
        "role": "external_api",
        "company_id": tenant_id,
        "tenant_id": tenant_id,
        "external_api_key_id": key_doc.get("id"),
    }
