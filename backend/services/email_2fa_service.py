"""Email verification codes for new-device login."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from fastapi import HTTPException

from database import JWT_SECRET, db
from services.login_security_audit import log_login_security_event
from services.tenant_schema import tenant_id_from_user

logger = logging.getLogger(__name__)

CODE_EXPIRY_MINUTES = int(os.environ.get("EMAIL_2FA_CODE_EXPIRY_MINUTES", "10"))
MAX_VERIFY_ATTEMPTS = int(os.environ.get("EMAIL_2FA_MAX_ATTEMPTS", "5"))
MAX_RESEND_COUNT = int(os.environ.get("EMAIL_2FA_MAX_RESENDS", "3"))
RESEND_COOLDOWN_SECONDS = int(os.environ.get("EMAIL_2FA_RESEND_COOLDOWN_SECONDS", "60"))


def email_2fa_enabled() -> bool:
    if os.environ.get("DISABLE_EMAIL_2FA", "").lower() == "true":
        return False
    if os.environ.get("EMAIL_2FA_ENABLED", "true").lower() == "false":
        return False
    env = os.environ.get("ENVIRONMENT", "development").lower()
    if env in ("test", "testing") and os.environ.get("EMAIL_2FA_IN_TEST", "").lower() != "true":
        return False
    return True


def default_email_2fa_for_user(user: dict) -> bool:
    """Owners default to 2FA on; all other roles default off."""
    return (user.get("role") or "").lower() == "owner"


def user_email_2fa_enabled(user: dict) -> bool:
    """Per-user opt-in/out with role-based defaults when unset."""
    if not email_2fa_enabled():
        return False
    preferences = user.get("preferences") or {}
    if "email_2fa_enabled" in preferences:
        return bool(preferences["email_2fa_enabled"])
    return default_email_2fa_for_user(user)


def resolve_email_2fa_preference(user: dict, preferences: Optional[dict] = None) -> bool:
    """Effective 2FA preference for API responses."""
    prefs = preferences if preferences is not None else (user.get("preferences") or {})
    if not email_2fa_enabled():
        return False
    if "email_2fa_enabled" in prefs:
        return bool(prefs["email_2fa_enabled"])
    return default_email_2fa_for_user(user)


def mask_email(email: str) -> str:
    if "@" not in email:
        return "***"
    local, domain = email.split("@", 1)
    if len(local) <= 1:
        masked_local = "*"
    else:
        masked_local = f"{local[0]}***"
    return f"{masked_local}@{domain}"


def hash_challenge_token(raw: str) -> str:
    return hashlib.sha256(f"{JWT_SECRET}:challenge:{raw}".encode()).hexdigest()


def hash_verification_code(code: str) -> str:
    return hmac.new(JWT_SECRET.encode(), code.encode(), hashlib.sha256).hexdigest()


def generate_verification_code() -> str:
    return f"{secrets.randbelow(900000) + 100000:06d}"


def generate_challenge_token() -> str:
    return secrets.token_urlsafe(32)


async def invalidate_challenges_for_user(user_id: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    await db.email_2fa_challenges.update_many(
        {"user_id": user_id, "consumed_at": None},
        {"$set": {"consumed_at": now, "updated_at": now}},
    )


async def _get_active_challenge(raw_token: str) -> Optional[dict]:
    return await db.email_2fa_challenges.find_one(
        {
            "challenge_token_hash": hash_challenge_token(raw_token),
            "consumed_at": None,
        },
        {"_id": 0},
    )


def _ensure_challenge_active(challenge: Optional[dict]) -> dict:
    if not challenge:
        raise HTTPException(status_code=401, detail="Invalid or expired verification session")
    expires_at = challenge.get("expires_at")
    if expires_at:
        exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > exp:
            raise HTTPException(status_code=401, detail="Verification code expired. Please log in again.")
    if challenge.get("attempts_count", 0) >= challenge.get("max_attempts", MAX_VERIFY_ATTEMPTS):
        raise HTTPException(status_code=429, detail="Too many attempts. Please log in again.")
    return challenge


async def create_email_challenge(
    user: dict,
    *,
    ip_address: str,
    user_agent: Optional[str],
) -> Tuple[str, str]:
    """Return (raw_challenge_token, masked_email)."""
    from services.trusted_device_service import hash_user_agent

    user_id = user["id"]
    tenant_id = tenant_id_from_user(user)
    email = user["email"]
    await invalidate_challenges_for_user(user_id)

    raw_token = generate_challenge_token()
    code = generate_verification_code()
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=CODE_EXPIRY_MINUTES)

    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "user_id": user_id,
        "challenge_token_hash": hash_challenge_token(raw_token),
        "code_hash": hash_verification_code(code),
        "expires_at": expires.isoformat(),
        "attempts_count": 0,
        "max_attempts": MAX_VERIFY_ATTEMPTS,
        "resend_count": 0,
        "last_resend_at": None,
        "consumed_at": None,
        "ip_address": ip_address,
        "user_agent_hash": hash_user_agent(user_agent),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    await db.email_2fa_challenges.insert_one(doc)

    sent = await send_2fa_code_email(email, user.get("name", ""), code)
    if not sent:
        await db.email_2fa_challenges.delete_one({"id": doc["id"]})
        raise HTTPException(
            status_code=503,
            detail="Could not send verification code. Please try again or contact your administrator.",
        )

    await log_login_security_event(
        "login_2fa_email_sent",
        tenant_id=tenant_id,
        user_id=user_id,
        email=email,
        ip_address=ip_address,
        user_agent_hash=doc["user_agent_hash"],
    )
    return raw_token, mask_email(email)


async def verify_email_challenge(
    raw_token: str,
    code: str,
    *,
    ip_address: str,
) -> dict:
    challenge = _ensure_challenge_active(await _get_active_challenge(raw_token))
    user_id = challenge["user_id"]
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is not active")

    if not hmac.compare_digest(hash_verification_code(code.strip()), challenge["code_hash"]):
        attempts = challenge.get("attempts_count", 0) + 1
        now = datetime.now(timezone.utc).isoformat()
        await db.email_2fa_challenges.update_one(
            {"id": challenge["id"]},
            {"$set": {"attempts_count": attempts, "updated_at": now}},
        )
        await log_login_security_event(
            "login_2fa_failed",
            tenant_id=challenge.get("tenant_id"),
            user_id=user_id,
            email=user.get("email"),
            ip_address=ip_address,
            result="failure",
            reason="invalid_code",
        )
        if attempts >= challenge.get("max_attempts", MAX_VERIFY_ATTEMPTS):
            await db.email_2fa_challenges.update_one(
                {"id": challenge["id"]},
                {"$set": {"consumed_at": now}},
            )
            raise HTTPException(status_code=429, detail="Too many attempts. Please log in again.")
        raise HTTPException(status_code=401, detail="Invalid verification code")

    now = datetime.now(timezone.utc).isoformat()
    await db.email_2fa_challenges.update_one(
        {"id": challenge["id"]},
        {"$set": {"consumed_at": now, "updated_at": now}},
    )
    await log_login_security_event(
        "login_2fa_success",
        tenant_id=challenge.get("tenant_id"),
        user_id=user_id,
        email=user.get("email"),
        ip_address=ip_address,
    )
    return user


async def resend_email_challenge(raw_token: str, *, ip_address: str) -> str:
    challenge = _ensure_challenge_active(await _get_active_challenge(raw_token))
    resend_count = challenge.get("resend_count", 0)
    if resend_count >= MAX_RESEND_COUNT:
        raise HTTPException(status_code=429, detail="Maximum resend attempts reached. Please log in again.")

    last_resend = challenge.get("last_resend_at")
    if last_resend:
        last_dt = datetime.fromisoformat(last_resend.replace("Z", "+00:00"))
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - last_dt).total_seconds()
        if elapsed < RESEND_COOLDOWN_SECONDS:
            wait = int(RESEND_COOLDOWN_SECONDS - elapsed)
            raise HTTPException(
                status_code=429,
                detail=f"Please wait {wait} seconds before requesting a new code.",
                headers={"Retry-After": str(wait)},
            )

    user = await db.users.find_one({"id": challenge["user_id"]}, {"_id": 0, "email": 1, "name": 1})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired verification session")

    code = generate_verification_code()
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=CODE_EXPIRY_MINUTES)
    sent = await send_2fa_code_email(user["email"], user.get("name", ""), code)
    if not sent:
        raise HTTPException(
            status_code=503,
            detail="Could not send verification code. Please try again or contact your administrator.",
        )

    await db.email_2fa_challenges.update_one(
        {"id": challenge["id"]},
        {
            "$set": {
                "code_hash": hash_verification_code(code),
                "expires_at": expires.isoformat(),
                "attempts_count": 0,
                "last_resend_at": now.isoformat(),
                "updated_at": now.isoformat(),
            },
            "$inc": {"resend_count": 1},
        },
    )
    await log_login_security_event(
        "login_2fa_email_sent",
        tenant_id=challenge.get("tenant_id"),
        user_id=challenge.get("user_id"),
        email=user.get("email"),
        ip_address=ip_address,
        details={"resend": True},
    )
    return mask_email(user["email"])


async def send_2fa_code_email(email: str, user_name: str, code: str) -> bool:
    """Send 6-digit verification code via Resend."""
    try:
        import resend
    except ImportError:
        logger.warning("Resend not installed; 2FA email not sent")
        return os.environ.get("ENVIRONMENT", "").lower() == "test"

    api_key = os.environ.get("RESEND_API_KEY", "")
    if not api_key:
        logger.warning("RESEND_API_KEY not set; 2FA email not sent")
        return os.environ.get("ENVIRONMENT", "").lower() == "test"

    sender = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
    resend.api_key = api_key
    html = f"""
    <html><body style="font-family: sans-serif; color: #1e293b;">
      <h2>AssetIQ verification code</h2>
      <p>Hi {user_name or 'there'},</p>
      <p>Your AssetIQ verification code is:</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">{code}</p>
      <p>This code expires in {CODE_EXPIRY_MINUTES} minutes.</p>
      <p>If you did not try to log in, you can ignore this email or contact your administrator.</p>
    </body></html>
    """
    try:
        await asyncio.to_thread(
            resend.Emails.send,
            {
                "from": sender,
                "to": [email],
                "subject": "AssetIQ verification code",
                "html": html,
            },
        )
        return True
    except Exception as exc:
        logger.error("Failed to send 2FA email to %s: %s", email, exc)
        return False
