"""
Security middleware: headers and request body size limits.
"""
from __future__ import annotations

import logging
import os
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger("assetiq.security")

MAX_BODY_BYTES = int(os.environ.get("MAX_REQUEST_BODY_BYTES", str(25 * 1024 * 1024)))  # 25MB default

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}
if os.environ.get("ENABLE_HSTS", "").lower() == "true":
    SECURITY_HEADERS["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
elif os.environ.get("ENVIRONMENT", "development").lower() in ("production", "prod"):
    SECURITY_HEADERS["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        for key, value in SECURITY_HEADERS.items():
            if key not in response.headers:
                response.headers[key] = value
        return response


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > MAX_BODY_BYTES:
                    return JSONResponse(
                        status_code=413,
                        content={"detail": "Request body too large"},
                    )
            except ValueError:
                pass
        return await call_next(request)
