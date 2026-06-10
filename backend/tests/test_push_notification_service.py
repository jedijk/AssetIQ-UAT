"""Tests for Web Push notification service helpers."""
import os

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("VAPID_PUBLIC_KEY", "test-public-key")
os.environ.setdefault("VAPID_PRIVATE_KEY", "test-private-key")

from services import push_notification_service as push_svc


def test_is_push_configured_with_keys():
    assert push_svc.is_push_configured() is True
    assert push_svc.get_vapid_public_key() == "test-public-key"


def test_subscription_doc_shape():
    doc = push_svc._subscription_doc(
        "user-1",
        {
            "endpoint": "https://push.example/abc",
            "keys": {"p256dh": "key", "auth": "auth"},
            "expirationTime": None,
        },
        user_agent="test-agent",
    )
    assert doc["user_id"] == "user-1"
    assert doc["endpoint"] == "https://push.example/abc"
    assert doc["keys"]["p256dh"] == "key"
    assert doc["user_agent"] == "test-agent"
