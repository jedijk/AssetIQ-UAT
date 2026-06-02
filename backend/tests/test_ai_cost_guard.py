"""Tests for AI cost guard."""
import pytest
from fastapi import HTTPException

from services.ai_cost_guard import ai_cost_guard, guard_ai_request


@pytest.fixture(autouse=True)
def reset_guard():
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
