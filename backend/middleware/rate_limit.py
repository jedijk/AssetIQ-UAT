"""
Default API rate limiting for /api/* routes.

Routes under /api/auth and /api/ai keep their stricter per-route SlowAPI limits
and are exempt from the global default bucket to avoid double-counting.
"""
from __future__ import annotations

import inspect
import logging
import os
from typing import Iterable

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger(__name__)

DEFAULT_RATE_LIMIT = os.environ.get("DEFAULT_RATE_LIMIT", "120/minute")

_ENV = os.environ.get("ENVIRONMENT", "development").lower()
_DEFAULT_ENABLED = _ENV not in ("test", "testing")
RATE_LIMIT_ENABLED = os.environ.get(
    "RATE_LIMIT_ENABLED",
    "true" if _DEFAULT_ENABLED else "false",
).lower() == "true"

EXEMPT_EXACT = frozenset({"/", "/health", "/api/health"})
EXEMPT_PREFIXES: Iterable[str] = ("/static", "/assets", "/api/auth", "/api/ai")
API_PREFIX = "/api"


def is_rate_limit_exempt(path: str) -> bool:
    if path in EXEMPT_EXACT:
        return True
    return any(path.startswith(prefix) for prefix in EXEMPT_PREFIXES)


class DefaultRateLimitMiddleware(BaseHTTPMiddleware):
    """Apply shared limiter default_limits to API routes not handled elsewhere."""

    async def dispatch(self, request: Request, call_next):
        limiter = getattr(request.app.state, "limiter", None)
        if not limiter or not getattr(limiter, "enabled", True):
            return await call_next(request)

        path = request.url.path
        if not path.startswith(API_PREFIX) or is_rate_limit_exempt(path):
            return await call_next(request)

        try:
            limiter._check_request_limit(request, None, in_middleware=True)
        except RateLimitExceeded as exc:
            handler = request.app.exception_handlers.get(
                RateLimitExceeded, _rate_limit_exceeded_handler
            )
            if inspect.iscoroutinefunction(handler):
                return await handler(request, exc)
            return handler(request, exc)
        except Exception as exc:
            logger.warning("Rate limit check skipped: %s", exc)

        return await call_next(request)
