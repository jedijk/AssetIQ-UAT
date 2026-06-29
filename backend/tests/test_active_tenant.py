"""Tests for owner active-tenant override (header + switch endpoint)."""
from __future__ import annotations

import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")
os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest")

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from services.active_tenant import (
    ACTIVE_TENANT_HEADER,
    apply_active_tenant_override,
    read_active_tenant_override,
    resolve_owner_tenant_switch,
)


def _make_request(*, header: str | None = None, cookie: str | None = None):
    request = MagicMock()
    request.headers = {ACTIVE_TENANT_HEADER: header} if header else {}
    request.cookies = {"assetiq_active_tenant": cookie} if cookie else {}
    return request


@pytest.mark.asyncio
async def test_non_owner_header_ignored():
    user = {"id": "u1", "role": "admin", "company_id": "home-tenant"}
    request = _make_request(header="other-tenant")
    result = await apply_active_tenant_override(user, request)
    assert result is user
    assert result["company_id"] == "home-tenant"


@pytest.mark.asyncio
async def test_owner_header_scopes_to_tenant(monkeypatch):
    user = {"id": "u1", "role": "owner", "company_id": "home-tenant"}
    request = _make_request(header="other-tenant")
    tenant_doc = {"tenant_id": "other-tenant", "status": "active", "name": "Other Co"}

    monkeypatch.setattr("database.get_request_db", lambda: MagicMock())
    monkeypatch.setattr(
        "services.tenant_management_service._resolve_tenant_doc",
        AsyncMock(return_value=tenant_doc),
    )
    monkeypatch.setattr(
        "services.tenant_registry.is_tenant_login_allowed",
        AsyncMock(return_value=True),
    )

    result = await apply_active_tenant_override(user, request)

    assert result["company_id"] == "other-tenant"
    assert result["tenant_id"] == "other-tenant"
    assert result["_home_tenant_id"] == "home-tenant"
    assert result["_active_tenant_override"] is True


@pytest.mark.asyncio
async def test_owner_same_as_home_unchanged():
    user = {"id": "u1", "role": "owner", "company_id": "home-tenant"}
    request = _make_request(header="home-tenant")
    result = await apply_active_tenant_override(user, request)
    assert result is user


@pytest.mark.asyncio
async def test_suspended_tenant_header_ignored(monkeypatch):
    user = {"id": "u1", "role": "owner", "company_id": "home-tenant"}
    request = _make_request(header="bad-tenant")
    tenant_doc = {"tenant_id": "bad-tenant", "status": "suspended"}

    monkeypatch.setattr("database.get_request_db", lambda: MagicMock())
    monkeypatch.setattr(
        "services.tenant_management_service._resolve_tenant_doc",
        AsyncMock(return_value=tenant_doc),
    )

    result = await apply_active_tenant_override(user, request)

    assert result is user


def test_read_override_from_header():
    request = _make_request(header="tenant-a")
    assert read_active_tenant_override(request) == "tenant-a"


def test_read_override_from_cookie():
    request = _make_request(cookie="tenant-b")
    assert read_active_tenant_override(request) == "tenant-b"


@pytest.mark.asyncio
async def test_switch_tenant_rejects_non_owner():
    with pytest.raises(HTTPException) as exc:
        await resolve_owner_tenant_switch(
            {"id": "u1", "role": "admin", "company_id": "home"},
            "other",
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_switch_tenant_rejects_suspended(monkeypatch):
    monkeypatch.setattr(
        "services.tenant_registry.is_tenant_login_allowed",
        AsyncMock(return_value=False),
    )
    with pytest.raises(HTTPException) as exc:
        await resolve_owner_tenant_switch(
            {"id": "u1", "role": "owner", "company_id": "home"},
            "suspended-tenant",
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_switch_tenant_clears_to_home(monkeypatch):
    tenant_doc = {"tenant_id": "home", "status": "active", "name": "Home Org"}

    monkeypatch.setattr("database.get_request_db", lambda: MagicMock())
    monkeypatch.setattr(
        "services.tenant_management_service._resolve_tenant_doc",
        AsyncMock(return_value=tenant_doc),
    )

    result = await resolve_owner_tenant_switch(
        {"id": "u1", "role": "owner", "company_id": "home"},
        None,
    )

    assert result["tenant_id"] == "home"
    assert result["home_tenant_id"] == "home"
    assert result["name"] == "Home Org"
