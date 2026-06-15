"""
Web Push notification delivery (VAPID / Push API).

Requires environment variables:
  VAPID_PUBLIC_KEY  - URL-safe base64 public key
  VAPID_PRIVATE_KEY - PEM or URL-safe base64 private key
  VAPID_SUBJECT     - mailto: or https:// contact URI (default mailto:support@assetiq.app)
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)

VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:support@assetiq.app").strip()


def _vapid_public_key() -> str:
    return os.environ.get("VAPID_PUBLIC_KEY", "").strip()


def _vapid_private_key() -> str:
    return os.environ.get("VAPID_PRIVATE_KEY", "").strip()


def is_push_configured() -> bool:
    return bool(_vapid_public_key() and _vapid_private_key())


def get_vapid_public_key() -> Optional[str]:
    key = _vapid_public_key()
    return key or None


def _subscription_doc(
    user_id: str,
    subscription: dict,
    *,
    user_agent: Optional[str] = None,
) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": str(uuid4()),
        "user_id": user_id,
        "endpoint": subscription["endpoint"],
        "keys": subscription.get("keys") or {},
        "expiration_time": subscription.get("expirationTime"),
        "user_agent": user_agent,
        "created_at": now,
        "updated_at": now,
    }


async def save_subscription(
    user_id: str,
    subscription: dict,
    *,
    user_agent: Optional[str] = None,
) -> dict:
    from database import db

    if not subscription.get("endpoint"):
        raise ValueError("Push subscription endpoint is required")

    doc = _subscription_doc(user_id, subscription, user_agent=user_agent)
    await db.push_subscriptions.update_one(
        {"user_id": user_id, "endpoint": doc["endpoint"]},
        {"$set": doc},
        upsert=True,
    )
    return doc


async def remove_subscription(user_id: str, endpoint: str) -> int:
    from database import db

    result = await db.push_subscriptions.delete_one(
        {"user_id": user_id, "endpoint": endpoint}
    )
    return result.deleted_count


async def remove_all_subscriptions(user_id: str) -> int:
    from database import db

    result = await db.push_subscriptions.delete_many({"user_id": user_id})
    return result.deleted_count


async def list_subscriptions(user_id: str) -> list[dict]:
    from database import db

    cursor = db.push_subscriptions.find({"user_id": user_id}, {"_id": 0})
    return await cursor.to_list(length=50)


async def send_push_to_user(
    user_id: str,
    payload: dict[str, Any],
    *,
    notification_type: Optional[str] = None,
) -> dict[str, int]:
    """Send a Web Push payload to all subscriptions for a user."""
    if not is_push_configured():
        logger.warning("Web Push skipped: VAPID keys not configured")
        return {"sent": 0, "failed": 0, "removed": 0}

    from database import db

    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        logger.error("pywebpush is not installed")
        return {"sent": 0, "failed": 0, "removed": 0}

    body = dict(payload)
    if notification_type:
        body.setdefault("type", notification_type)

    data = json.dumps(body)
    subs = await list_subscriptions(user_id)
    sent = failed = removed = 0

    for sub in subs:
        subscription_info = {
            "endpoint": sub["endpoint"],
            "keys": sub.get("keys") or {},
        }
        try:
            webpush(
                subscription_info=subscription_info,
                data=data,
                vapid_private_key=_vapid_private_key(),
                vapid_claims={"sub": VAPID_SUBJECT},
            )
            sent += 1
        except WebPushException as exc:
            failed += 1
            status = getattr(getattr(exc, "response", None), "status_code", None)
            logger.warning(
                "Web Push failed for user %s (status=%s): %s",
                user_id,
                status,
                exc,
            )
            if status in (404, 410):
                await db.push_subscriptions.delete_one(
                    {"user_id": user_id, "endpoint": sub["endpoint"]}
                )
                removed += 1
        except Exception as exc:
            failed += 1
            logger.exception("Unexpected Web Push error for user %s: %s", user_id, exc)

    return {"sent": sent, "failed": failed, "removed": removed}


async def send_test_push(user_id: str) -> dict[str, int]:
    return await send_push_to_user(
        user_id,
        {
            "title": "🔔 Test Notification",
            "body": "Push notifications are working! You will receive alerts even when AssetIQ is closed.",
            "url": "/dashboard",
            "tag": "assetiq-test-push",
            "type": "system",
        },
        notification_type="system",
    )
