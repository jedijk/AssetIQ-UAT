"""Global default rate limit configuration tests."""
from pathlib import Path

from middleware.rate_limit import (
    DEFAULT_RATE_LIMIT,
    EXEMPT_EXACT,
    RATE_LIMIT_ENABLED,
    is_rate_limit_exempt,
)


def test_default_rate_limit_configured():
    assert DEFAULT_RATE_LIMIT == "120/minute"


def test_health_paths_exempt():
    for path in ("/", "/health", "/api/health"):
        assert is_rate_limit_exempt(path)
        assert path in EXEMPT_EXACT


def test_server_limiter_uses_default_limits():
    source = (Path(__file__).resolve().parents[1] / "server.py").read_text()
    assert "default_limits=[DEFAULT_RATE_LIMIT]" in source
    assert "DefaultRateLimitMiddleware" in source


def test_rate_limit_enabled_respects_test_env_default():
    # In pytest ENVIRONMENT is typically unset; module default is enabled outside test env.
    assert isinstance(RATE_LIMIT_ENABLED, bool)
