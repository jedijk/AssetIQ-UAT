"""
HTTP middleware: attach tenant_id to request.state from the authenticated user.
"""
from __future__ import annotations

import logging
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from auth import get_optional_user_from_request
from services.tenant_schema import tenant_id_from_user

logger = logging.getLogger(__name__)


class TenantContextMiddleware(BaseHTTPMiddleware):
    """Set ``request.state.tenant_id`` from JWT user org context when present."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        user = await get_optional_user_from_request(request)
        request.state.tenant_id = tenant_id_from_user(user)
        return await call_next(request)
