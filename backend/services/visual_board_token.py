"""
Visual Management Board token generation and validation.

Tokens use prefix ``vmb_`` and are stored as SHA-256 hashes only.
"""
from __future__ import annotations

import hashlib
import re
import secrets
from typing import Tuple

TOKEN_PREFIX = "vmb_"
_TOKEN_BODY_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def generate_board_token() -> str:
    """Generate a cryptographically secure 256-bit board token."""
    return f"{TOKEN_PREFIX}{secrets.token_hex(32)}"


def hash_board_token(raw_token: str) -> str:
    return hashlib.sha256(normalize_token(raw_token).encode("utf-8")).hexdigest()


def generate_token() -> Tuple[str, str]:
    """Return (raw_token, token_hash) for storage."""
    raw = generate_board_token()
    return raw, hash_board_token(raw)


def hash_token(raw_token: str) -> str:
    return hash_board_token(raw_token)


def normalize_token(raw: str) -> str:
    token = (raw or "").strip()
    if not token:
        raise ValueError("Token is required")
    if not token.startswith(TOKEN_PREFIX):
        token = f"{TOKEN_PREFIX}{token}"
    return token


def validate_token_format(raw_token: str) -> bool:
    try:
        normalized = normalize_token(raw_token)
    except ValueError:
        return False
    body = normalized[len(TOKEN_PREFIX) :]
    return bool(_TOKEN_BODY_PATTERN.match(body))


def extract_token_from_path(path_token: str) -> str:
    return normalize_token(path_token)


def mask_token(raw_token: str) -> str:
    try:
        normalized = normalize_token(raw_token)
    except ValueError:
        return "***"
    if len(normalized) <= 12:
        return "***"
    return f"{normalized[:8]}…{normalized[-4:]}"


def token_display_suffix(raw_token: str) -> str:
    return raw_token[-8:] if raw_token else ""
