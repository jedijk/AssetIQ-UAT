#!/usr/bin/env python3
"""Seed approved test users for CI HTTP integration tests."""
from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from auth import hash_password  # noqa: E402
from database import db  # noqa: E402
from utils.mongo_regex import exact_case_insensitive  # noqa: E402

CI_USER_SCOPE = {
    "assigned_installations": ["Tyromer"],
    "department": "Engineering",
    "company_id": "default",
}

CI_USERS = [
    {
        "email": "test@test.com",
        "password": "test",
        "name": "CI Test Admin",
        "role": "admin",
    },
    {
        "email": "test@example.com",
        "password": "test123",
        "name": "CI Test User",
        "role": "admin",
    },
    {
        "email": "jedijk@gmail.com",
        "password": "admin123",
        "name": "CI Test Owner",
        "role": "owner",
    },
]


async def _upsert_user(spec: dict) -> None:
    email = spec["email"]
    now = datetime.now(timezone.utc).isoformat()
    existing = await db.users.find_one({"email": exact_case_insensitive(email)})
    fields = {
        "email": email,
        "name": spec["name"],
        "password_hash": hash_password(spec["password"]),
        "role": spec["role"],
        "approval_status": "approved",
        "is_active": True,
        "updated_at": now,
        **CI_USER_SCOPE,
    }
    if existing:
        await db.users.update_one(
            {"email": exact_case_insensitive(email)},
            {"$set": fields},
        )
        print(f"updated user {email} ({spec['role']})")
        return

    await db.users.insert_one(
        {
            "id": str(uuid.uuid4()),
            "created_at": now,
            "has_seen_intro": True,
            **fields,
        }
    )
    print(f"created user {email} ({spec['role']})")


async def main() -> int:
    if not os.environ.get("MONGO_URL"):
        print("MONGO_URL not set", file=sys.stderr)
        return 1
    for spec in CI_USERS:
        await _upsert_user(spec)
    emails = [spec["email"].lower() for spec in CI_USERS]
    result = await db.login_attempts.delete_many({"email": {"$in": emails}})
    print(f"cleared {result.deleted_count} login_attempts record(s) for CI users")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
