"""
Structured request logging middleware: request ID, timing, slow request warnings.
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("assetiq.request")

SLOW_API_MS = int(__import__("os").environ.get("SLOW_API_MS", "1000"))

_SECRET_KEYS = frozenset(
    {
        "password",
        "token",
        "authorization",
        "api_key",
        "apikey",
        "secret",
        "cookie",
        "session",
    }
)


def _mask_secrets(mapping: dict) -> dict:
    masked = {}
    for key, value in mapping.items():
        key_lower = str(key).lower()
        if any(s in key_lower for s in _SECRET_KEYS):
            masked[key] = "[REDACTED]"
        else:
            masked[key] = value
    return masked


class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        correlation_id = request.headers.get("X-Correlation-ID") or request_id
        start = time.perf_counter()

        request.state.request_id = request_id
        request.state.correlation_id = correlation_id

        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            logger.exception(
                "request failed",
                extra={
                    "request_id": request_id,
                    "correlation_id": correlation_id,
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": duration_ms,
                    "status_code": 500,
                },
            )
            raise
        else:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            log_extra = {
                "request_id": request_id,
                "correlation_id": correlation_id,
                "method": request.method,
                "path": request.url.path,
                "duration_ms": duration_ms,
                "status_code": status_code,
            }
            user = getattr(request.state, "user", None)
            if isinstance(user, dict):
                log_extra["user_id"] = user.get("id")
                log_extra["company_id"] = user.get("company_id") or user.get("organization_id")
            log_extra = _mask_secrets(log_extra)

            if duration_ms >= SLOW_API_MS:
                logger.warning("slow request", extra=log_extra)
            else:
                logger.info("request completed", extra=log_extra)

            response.headers["X-Request-ID"] = request_id
            response.headers["X-Correlation-ID"] = correlation_id
            return response


def configure_json_logging() -> None:
    """Enable JSON log formatting when LOG_FORMAT=json."""
    import os

    if os.environ.get("LOG_FORMAT", "").lower() != "json":
        return

    class JsonFormatter(logging.Formatter):
        def format(self, record: logging.LogRecord) -> str:
            payload = {
                "timestamp": self.formatTime(record),
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage(),
            }
            for key, value in record.__dict__.items():
                if key.startswith("_") or key in (
                    "name",
                    "msg",
                    "args",
                    "levelname",
                    "levelno",
                    "pathname",
                    "filename",
                    "module",
                    "exc_info",
                    "exc_text",
                    "stack_info",
                    "lineno",
                    "funcName",
                    "created",
                    "msecs",
                    "relativeCreated",
                    "thread",
                    "threadName",
                    "processName",
                    "process",
                    "message",
                ):
                    continue
                if key in ("request_id", "correlation_id", "cache_event", "ai_event"):
                    payload[key] = value
                elif key == "extra" and isinstance(value, dict):
                    payload.update(value)
            if record.exc_info:
                payload["exception"] = self.formatException(record.exc_info)
            return json.dumps(payload, default=str)

    root = logging.getLogger()
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root.handlers = [handler]
    root.setLevel(logging.INFO)
