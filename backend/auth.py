"""
Authentication helpers: password hashing, JWT tokens, current user dependency.
"""
import os
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta
from fastapi import Depends, HTTPException, Query, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional

from database import db, client, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRATION_HOURS

security = HTTPBearer(auto_error=False)

# Cookie auth configuration (opt-in).
AUTH_COOKIE_NAME = os.environ.get("AUTH_COOKIE_NAME", "assetiq_token")
CSRF_COOKIE_NAME = os.environ.get("CSRF_COOKIE_NAME", "assetiq_csrf")
ALLOW_COOKIE_AUTH = os.environ.get("ALLOW_COOKIE_AUTH", "true").lower() == "true"

# Always use production database for user authentication
# This ensures tokens work across database environments
AUTH_DB = client[os.environ.get("DB_NAME", "assetiq")]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))


def create_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def _validate_token(token: str) -> dict:
    """Internal helper to validate a JWT token and return the user.
    
    Note: Always validates against the production database to ensure
    tokens work across database environments (production/UAT).
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        # Always use AUTH_DB (production) for user lookup
        user = await AUTH_DB.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    token: Optional[str] = Query(None, description="Auth token (alternative to header)"),
    request: Request = None,
):
    """Get current user from Authorization header or query parameter token.
    
    This supports both:
    - Authorization: Bearer <token> header (standard)
    - ?token=<token> query parameter (for image loading in browsers)
    """
    # Try header first
    if credentials and credentials.credentials:
        return await _validate_token(credentials.credentials)

    # Cookie-based auth (preferred when enabled): HttpOnly cookie cannot be read by JS,
    # reducing XSS blast radius. Works cross-origin with allow_credentials CORS.
    if ALLOW_COOKIE_AUTH and request is not None:
        try:
            cookie_token = request.cookies.get(AUTH_COOKIE_NAME)
        except Exception:
            cookie_token = None
        if cookie_token:
            return await _validate_token(cookie_token)
    
    # Query parameter auth is OFF by default because tokens in URLs can leak via logs,
    # browser history, referrers, and proxy traces. Enable explicitly only if you have
    # a constrained use-case (e.g., short-lived signed URLs for media).
    allow_query_token = os.environ.get("ALLOW_QUERY_TOKEN_AUTH", "false").lower() == "true"
    if allow_query_token and token:
        return await _validate_token(token)
    
    # No auth provided
    raise HTTPException(status_code=401, detail="Not authenticated")

