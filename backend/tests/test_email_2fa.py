"""Email 2FA and trusted-device login tests."""
from __future__ import annotations

import os

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-email-2fa-32chars")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DISABLE_EMAIL_2FA", "true")

from services.email_2fa_service import (  # noqa: E402
    email_2fa_enabled,
    hash_verification_code,
    mask_email,
)
from services.trusted_device_service import hash_token, hash_user_agent  # noqa: E402


def test_mask_email():
    assert mask_email("john@example.com") == "j***@example.com"
    assert mask_email("a@example.com") == "*@example.com"


def test_hash_verification_code_is_stable():
    a = hash_verification_code("123456")
    b = hash_verification_code("123456")
    assert a == b
    assert a != hash_verification_code("654321")


def test_trusted_device_default_expiry_days():
    from services.trusted_device_service import TRUSTED_DEVICE_DAYS

    assert TRUSTED_DEVICE_DAYS == 180


def test_trusted_device_token_hash():
    assert hash_token("abc") != "abc"
    assert hash_token("abc") == hash_token("abc")


def test_hash_user_agent():
    assert hash_user_agent("Mozilla/5.0") == hash_user_agent("Mozilla/5.0")
    assert len(hash_user_agent("Mozilla/5.0")) == 32


def test_email_2fa_disabled_in_test_env():
    assert email_2fa_enabled() is False


@pytest.mark.asyncio
async def test_create_challenge_hashes_code(monkeypatch):
    os.environ["DISABLE_EMAIL_2FA"] = "false"
    monkeypatch.setenv("DISABLE_EMAIL_2FA", "false")

    inserted = {}

    class FakeChallenges:
        async def insert_one(self, doc):
            inserted.update(doc)

        async def update_many(self, *args, **kwargs):
            return None

        async def delete_one(self, *args, **kwargs):
            return None

    class FakeDb:
        email_2fa_challenges = FakeChallenges()

    async def fake_send(email, name, code):
        inserted["sent_code"] = code
        return True

    async def fake_invalidate(user_id):
        return None

    async def fake_audit(*args, **kwargs):
        return None

    monkeypatch.setattr("services.email_2fa_service.db", FakeDb())
    monkeypatch.setattr("services.email_2fa_service.send_2fa_code_email", fake_send)
    monkeypatch.setattr("services.email_2fa_service.invalidate_challenges_for_user", fake_invalidate)
    monkeypatch.setattr("services.email_2fa_service.log_login_security_event", fake_audit)

    from services.email_2fa_service import create_email_challenge

    user = {"id": "u-1", "email": "user@example.com", "name": "User", "company_id": "Tyromer"}
    raw_token, masked = await create_email_challenge(
        user,
        ip_address="127.0.0.1",
        user_agent="test-agent",
    )

    assert raw_token
    assert "@" in masked
    assert inserted["code_hash"] == hash_verification_code(inserted["sent_code"])
    assert len(inserted["sent_code"]) == 6

    os.environ["DISABLE_EMAIL_2FA"] = "true"


def test_user_email_2fa_role_defaults():
    from services.email_2fa_service import user_email_2fa_enabled

    os.environ["DISABLE_EMAIL_2FA"] = "false"
    os.environ["EMAIL_2FA_IN_TEST"] = "true"
    assert user_email_2fa_enabled({"id": "u-1", "role": "admin"}) is False
    assert user_email_2fa_enabled({"id": "u-2", "role": "owner"}) is True
    assert user_email_2fa_enabled({"id": "u-1", "role": "admin", "preferences": {"email_2fa_enabled": True}}) is True
    assert user_email_2fa_enabled({"id": "u-2", "role": "owner", "preferences": {"email_2fa_enabled": False}}) is False
    os.environ["DISABLE_EMAIL_2FA"] = "true"
    assert user_email_2fa_enabled({"id": "u-2", "role": "owner"}) is False

