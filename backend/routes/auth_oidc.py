"""
SSO OIDC spike — authorization URL + callback token exchange stub.

Enable with environment variables:
  OIDC_ENABLED=true
  OIDC_ISSUER=https://login.example.com/realms/assetiq
  OIDC_CLIENT_ID=assetiq-web
  OIDC_CLIENT_SECRET=...          # optional for public clients
  OIDC_REDIRECT_URI=https://app.example.com/api/auth/oidc/callback
  OIDC_SCOPES=openid profile email
"""
from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from auth import create_token, get_current_user
from database import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/oidc", tags=["SSO OIDC"])

OIDC_ENABLED = os.environ.get("OIDC_ENABLED", "false").lower() == "true"
OIDC_ISSUER = os.environ.get("OIDC_ISSUER", "").rstrip("/")
OIDC_CLIENT_ID = os.environ.get("OIDC_CLIENT_ID", "")
OIDC_CLIENT_SECRET = os.environ.get("OIDC_CLIENT_SECRET", "")
OIDC_REDIRECT_URI = os.environ.get("OIDC_REDIRECT_URI", "")
OIDC_SCOPES = os.environ.get("OIDC_SCOPES", "openid profile email")


class OIDCConfigResponse(BaseModel):
    enabled: bool
    issuer: Optional[str] = None
    client_id: Optional[str] = None
    redirect_uri: Optional[str] = None
    scopes: str = OIDC_SCOPES
    authorization_endpoint: Optional[str] = None


def _require_oidc_enabled() -> None:
    if not OIDC_ENABLED:
        raise HTTPException(status_code=503, detail="OIDC SSO is not enabled")
    if not OIDC_ISSUER or not OIDC_CLIENT_ID or not OIDC_REDIRECT_URI:
        raise HTTPException(status_code=503, detail="OIDC is misconfigured")


async def _discover() -> Dict[str, Any]:
    url = f"{OIDC_ISSUER}/.well-known/openid-configuration"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.json()


@router.get("/config", response_model=OIDCConfigResponse)
async def oidc_config():
    """Public OIDC client configuration for the SPA login button."""
    auth_endpoint = None
    if OIDC_ENABLED and OIDC_ISSUER:
        try:
            meta = await _discover()
            auth_endpoint = meta.get("authorization_endpoint")
        except Exception as exc:
            logger.warning("OIDC discovery failed: %s", exc)
    return OIDCConfigResponse(
        enabled=OIDC_ENABLED,
        issuer=OIDC_ISSUER or None,
        client_id=OIDC_CLIENT_ID or None,
        redirect_uri=OIDC_REDIRECT_URI or None,
        authorization_endpoint=auth_endpoint,
    )


@router.get("/authorize")
async def oidc_authorize(state: Optional[str] = None):
    """Return authorization URL for SPA redirect (PKCE-ready spike)."""
    _require_oidc_enabled()
    meta = await _discover()
    auth_endpoint = meta.get("authorization_endpoint")
    if not auth_endpoint:
        raise HTTPException(status_code=503, detail="OIDC authorization_endpoint missing")

    state = state or secrets.token_urlsafe(16)
    params = {
        "client_id": OIDC_CLIENT_ID,
        "response_type": "code",
        "scope": OIDC_SCOPES,
        "redirect_uri": OIDC_REDIRECT_URI,
        "state": state,
    }
    return {
        "authorization_url": f"{auth_endpoint}?{urlencode(params)}",
        "state": state,
    }


@router.post("/callback")
async def oidc_callback(
    request: Request,
    code: str = Query(...),
    state: Optional[str] = None,
):
    """
    Exchange authorization code for tokens and issue AssetIQ JWT.

    Spike: maps OIDC email claim to existing user; auto-provision disabled.
    """
    _require_oidc_enabled()
    meta = await _discover()
    token_endpoint = meta.get("token_endpoint")
    if not token_endpoint:
        raise HTTPException(status_code=503, detail="OIDC token_endpoint missing")

    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": OIDC_REDIRECT_URI,
        "client_id": OIDC_CLIENT_ID,
    }
    if OIDC_CLIENT_SECRET:
        data["client_secret"] = OIDC_CLIENT_SECRET

    async with httpx.AsyncClient(timeout=15.0) as client:
        token_resp = await client.post(token_endpoint, data=data)
        if token_resp.status_code >= 400:
            logger.error("OIDC token exchange failed: %s", token_resp.text)
            raise HTTPException(status_code=401, detail="OIDC token exchange failed")
        tokens = token_resp.json()

        access_token = tokens.get("access_token")
        if not access_token:
            raise HTTPException(status_code=401, detail="No access_token from IdP")

        userinfo_endpoint = meta.get("userinfo_endpoint")
        email = None
        name = None
        sub = tokens.get("id_token") or access_token[:32]
        if userinfo_endpoint:
            ui_resp = await client.get(
                userinfo_endpoint,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if ui_resp.status_code == 200:
                profile = ui_resp.json()
                email = profile.get("email")
                name = profile.get("name") or profile.get("preferred_username")
                sub = profile.get("sub") or sub

    if not email:
        raise HTTPException(status_code=401, detail="OIDC profile missing email")

    user = await db.users.find_one({"email": email.lower()})
    if not user:
        await db.security_audit_log.insert_one({
            "event": "oidc_login_failed",
            "email": email,
            "reason": "user_not_provisioned",
            "ts": datetime.now(timezone.utc),
        })
        raise HTTPException(status_code=403, detail="User not provisioned for SSO")

    jwt_token = create_token(user)
    await db.security_audit_log.insert_one({
        "event": "oidc_login_success",
        "user_id": user.get("id"),
        "email": email,
        "oidc_sub": sub,
        "ts": datetime.now(timezone.utc),
    })

    return {
        "token": jwt_token,
        "user": {
            "id": user.get("id"),
            "email": user.get("email"),
            "name": user.get("name") or name,
            "role": user.get("role"),
        },
        "sso": True,
        "state": state,
    }


@router.get("/status")
async def oidc_status(current_user: dict = Depends(get_current_user)):
    """Authenticated probe — confirms OIDC routes are mounted."""
    return {
        "enabled": OIDC_ENABLED,
        "user_id": current_user.get("id"),
    }
