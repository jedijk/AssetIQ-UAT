"""Tests for optional Redis store."""
import os

import pytest

from services import redis_store


@pytest.fixture(autouse=True)
def reset_redis_state():
    redis_store._redis_checked = False
    redis_store._redis_enabled = False
    redis_store._redis_client = None
    yield


def test_redis_status_not_configured(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    status = redis_store.redis_status()
    assert status["enabled"] is False
    assert status["configured"] is False


def test_get_redis_returns_none_without_url(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    assert redis_store.get_redis() is None


def test_incr_with_ttl_falls_back_without_redis(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    assert redis_store.incr_with_ttl("test:key", 60) is None


def test_get_int_falls_back_without_redis(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    assert redis_store.get_int("test:key") is None
