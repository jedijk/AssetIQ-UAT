"""
Visual display device tokens and pairing codes.

Pairing codes: 6 uppercase chars, no ambiguous 0/O/1/I.
Device tokens: ``dvc_`` prefix + 32-byte hex; stored as SHA-256 hash only.
"""
from __future__ import annotations

import hashlib
import secrets
from typing import Tuple

PAIR_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
PAIR_CODE_LENGTH = 6
DEVICE_TOKEN_PREFIX = "dvc_"


def generate_pair_code() -> str:
    return "".join(secrets.choice(PAIR_CODE_CHARS) for _ in range(PAIR_CODE_LENGTH))


def hash_device_token(raw_token: str) -> str:
    normalized = normalize_device_token(raw_token)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def generate_device_token() -> Tuple[str, str]:
    raw = f"{DEVICE_TOKEN_PREFIX}{secrets.token_hex(32)}"
    return raw, hash_device_token(raw)


def normalize_device_token(raw: str) -> str:
    token = (raw or "").strip()
    if not token.startswith(DEVICE_TOKEN_PREFIX):
        token = f"{DEVICE_TOKEN_PREFIX}{token}"
    return token


def validate_device_token_format(raw_token: str) -> bool:
    try:
        normalized = normalize_device_token(raw_token)
    except ValueError:
        return False
    body = normalized[len(DEVICE_TOKEN_PREFIX) :]
    return len(body) == 64 and all(c in "0123456789abcdef" for c in body)
