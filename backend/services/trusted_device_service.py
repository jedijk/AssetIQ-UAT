"""Trusted-device tokens for new-device email 2FA."""
from __future__ import annotations

import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Request, Response

from auth import cookie_security_attrs
from database import db, JWT_SECRET

TRUSTED_DEVICE_COOKIE = os.environ.get("TRUSTED_DEVICE_COOKIE_NAME", "assetiq_trusted_device")
TRUSTED_DEVICE_DAYS = int(os.environ.get("TRUSTED_DEVICE_DAYS", "180"))


def hash_token(raw: str) -> str:
    return hashlib.sha256(f"{JWT_SECRET}:{raw}".encode()).hexdigest()


def hash_user_agent(user_agent: Optional[str]) -> str:
    return hashlib.sha256((user_agent or "").encode()).hexdigest()[:32]


def read_trusted_device_cookie(request: Request) -> Optional[str]:
    return request.cookies.get(TRUSTED_DEVICE_COOKIE)


def set_trusted_device_cookie(response: Response, request: Request, raw_token: str) -> None:
    secure, same_site = cookie_security_attrs(request)
    max_age = int(timedelta(days=TRUSTED_DEVICE_DAYS).total_seconds())
    response.set_cookie(
        key=TRUSTED_DEVICE_COOKIE,
        value=raw_token,
        httponly=True,
        secure=secure,
        samesite=same_site,
        path="/",
        max_age=max_age,
    )


def clear_trusted_device_cookie(response: Response, request: Request) -> None:
    secure, same_site = cookie_security_attrs(request)
    response.set_cookie(
        key=TRUSTED_DEVICE_COOKIE,
        value="",
        httponly=True,
        secure=secure,
        samesite=same_site,
        path="/",
        max_age=0,
    )


async def find_valid_trusted_device(
    *,
    user_id: str,
    tenant_id: Optional[str],
    raw_token: str,
) -> Optional[dict]:
    if not raw_token:
        return None
    now = datetime.now(timezone.utc)
    filt = {
        "user_id": user_id,
        "device_token_hash": hash_token(raw_token),
        "revoked_at": None,
        "expires_at": {"$gt": now.isoformat()},
    }
    if tenant_id:
        filt["tenant_id"] = tenant_id
    return await db.trusted_devices.find_one(filt, {"_id": 0})


async def register_trusted_device(
    *,
    user_id: str,
    tenant_id: Optional[str],
    ip_address: str,
    user_agent: Optional[str],
    device_label: Optional[str] = None,
) -> str:
    raw_token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=TRUSTED_DEVICE_DAYS)
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "user_id": user_id,
        "device_token_hash": hash_token(raw_token),
        "device_label": device_label or "Browser",
        "user_agent_hash": hash_user_agent(user_agent),
        "ip_first_seen": ip_address,
        "ip_last_seen": ip_address,
        "first_seen_at": now.isoformat(),
        "last_seen_at": now.isoformat(),
        "expires_at": expires.isoformat(),
        "revoked_at": None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    await db.trusted_devices.insert_one(doc)
    return raw_token


async def touch_trusted_device(device_id: str, ip_address: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    await db.trusted_devices.update_one(
        {"id": device_id},
        {"$set": {"ip_last_seen": ip_address, "last_seen_at": now, "updated_at": now}},
    )


async def revoke_trusted_devices_for_user(user_id: str, *, tenant_id: Optional[str] = None) -> int:
    now = datetime.now(timezone.utc).isoformat()
    filt: dict = {"user_id": user_id, "revoked_at": None}
    if tenant_id:
        filt["tenant_id"] = tenant_id
    result = await db.trusted_devices.update_many(
        filt,
        {"$set": {"revoked_at": now, "updated_at": now}},
    )
    return result.modified_count


async def revoke_all_trusted_devices_for_tenant(tenant_id: str) -> int:
    now = datetime.now(timezone.utc).isoformat()
    result = await db.trusted_devices.update_many(
        {"tenant_id": tenant_id, "revoked_at": None},
        {"$set": {"revoked_at": now, "updated_at": now}},
    )
    return result.modified_count
