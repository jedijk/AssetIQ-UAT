"""Tests for AI cost guard."""
import pytest
from fastapi import HTTPException

from services.ai_cost_guard import AIUsageRecord, ai_cost_guard, guard_ai_request
from services import redis_store


@pytest.fixture(autouse=True)
def reset_guard(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    redis_store._redis_checked = False
    redis_store._redis_enabled = False
    redis_store._redis_client = None
    ai_cost_guard._minute_buckets.clear()
    ai_cost_guard._daily_requests.clear()
    ai_cost_guard._daily_spend_usd.clear()
    yield


def test_allows_request_under_limit():
    guard_ai_request(user_id="u1", company_id="c1", endpoint="test")


def test_blocks_burst_rate_limit(monkeypatch):
    monkeypatch.setattr(
        "services.ai_cost_guard.DEFAULT_USER_PER_MINUTE",
        2,
    )
    guard_ai_request(user_id="u1", company_id="c1", endpoint="test")
    guard_ai_request(user_id="u1", company_id="c1", endpoint="test")
    with pytest.raises(HTTPException) as exc:
        guard_ai_request(user_id="u1", company_id="c1", endpoint="test")
    assert exc.value.status_code == 429


def test_daily_summary_uses_memory_backend_without_redis():
    summary = ai_cost_guard.get_daily_summary("c1")
    assert summary["backend"] == "memory"
    assert "requests" in summary
    assert "spend_usd" in summary


def test_record_usage_increments_memory_counters_once():
    record = AIUsageRecord(
        user_id="u1",
        company_id="c1",
        endpoint="test",
        prompt_tokens=100,
        completion_tokens=50,
        estimated_cost_usd=0.01,
        model="gpt-4o-mini",
    )
    ai_cost_guard.record_usage(record)
    ai_cost_guard.record_usage(record)

    summary = ai_cost_guard.get_daily_summary("c1")
    assert summary["requests"] == 2
    assert summary["spend_usd"] == pytest.approx(0.02)


def test_get_limits_and_usage_shape():
    limits = ai_cost_guard.get_limits_and_usage("c1")
    assert "rate_limit" in limits
    assert "daily" in limits
    assert "usage_today" in limits
    assert "utilization" in limits
    assert limits["usage_today"]["backend"] == "memory"


def test_record_usage_does_not_double_count_when_redis_partial(monkeypatch):
    """User counter in Redis; company/spend fall back to memory — no duplicate user count."""
    calls = {"n": 0}

    def fake_incr(key, ttl):
        calls["n"] += 1
        if key.endswith(":user:u1"):
            return 1
        return None

    monkeypatch.setattr("services.redis_store.incr_with_ttl", fake_incr)
    monkeypatch.setattr("services.redis_store.get_redis", lambda: None)

    record = AIUsageRecord(
        user_id="u1",
        company_id="c1",
        endpoint="test",
        prompt_tokens=10,
        completion_tokens=10,
        estimated_cost_usd=0.001,
    )
    ai_cost_guard.record_usage(record)

    assert calls["n"] == 2
    summary = ai_cost_guard.get_daily_summary("c1")
    assert summary["backend"] == "memory"
    assert summary["requests"] == 1
    assert summary["spend_usd"] == pytest.approx(0.001)
