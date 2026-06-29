"""FastAPI dependency for External API key authentication."""
from __future__ import annotations

import time
from typing import Optional

from fastapi import Depends, HTTPException, Request

from services.external_api_key_service import (
    authenticate_api_key,
    check_rate_limit,
    tenant_user_from_key,
)


def _client_ip(request: Request) -> Optional[str]:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if forwarded:
        return forwarded
    if request.client:
        return request.client.host
    return None


def extract_api_key(request: Request) -> Optional[str]:
    auth = (request.headers.get("authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    header_key = (request.headers.get("x-api-key") or "").strip()
    if header_key:
        return header_key
    return None


async def require_external_api_key(
    request: Request,
    *,
    required_scope: str = "observations:create",
) -> dict:
    raw_key = extract_api_key(request)
    if not raw_key:
        raise HTTPException(status_code=401, detail="API key required (Bearer or X-API-Key)")

    key_doc = await authenticate_api_key(
        raw_key,
        required_scope=required_scope,
        client_ip=_client_ip(request),
    )
    await check_rate_limit(key_doc)
    user = tenant_user_from_key(key_doc)
    request.state.external_api_key = key_doc
    request.state.tenant_id = key_doc.get("tenant_id")
    request.state.external_api_start = time.perf_counter()
    return user


async def external_observations_auth(request: Request) -> dict:
    return await require_external_api_key(request, required_scope="observations:create")


async def external_equipment_auth(request: Request) -> dict:
    return await require_external_api_key(request, required_scope="equipment:read")
