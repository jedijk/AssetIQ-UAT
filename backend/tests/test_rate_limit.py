"""Tests for default API rate limiting middleware."""
from pathlib import Path

from middleware.rate_limit import (
    DEFAULT_RATE_LIMIT,
    DefaultRateLimitMiddleware,
    is_rate_limit_exempt,
)


def test_default_rate_limit_env_default():
    assert DEFAULT_RATE_LIMIT == "120/minute"


def test_health_and_auth_paths_exempt():
    assert is_rate_limit_exempt("/health")
    assert is_rate_limit_exempt("/api/health")
    assert is_rate_limit_exempt("/api/auth/login")
    assert is_rate_limit_exempt("/api/ai/chat")
    assert not is_rate_limit_exempt("/api/threats")


def test_server_registers_rate_limit_middleware():
    source = (Path(__file__).resolve().parents[1] / "server.py").read_text()
    assert "DefaultRateLimitMiddleware" in source
    assert "default_limits=[DEFAULT_RATE_LIMIT]" in source
    assert "app.state.limiter = limiter" in source


def test_rate_limit_middleware_class_exported():
    assert DefaultRateLimitMiddleware.__name__ == "DefaultRateLimitMiddleware"
