"""
Application observability metrics — Wave 3 foundation.

Tracks API latency, worker/event processing counters in-memory.
Exposed via /api/metrics when integrated with system routes.
"""
from __future__ import annotations

import logging
import time
from threading import Lock
from typing import Any, Dict, Optional

logger = logging.getLogger("assetiq.observability")

_lock = Lock()
_counters: Dict[str, int] = {
    "http_requests_total": 0,
    "http_errors_total": 0,
    "graph_sync_enqueued_total": 0,
    "graph_sync_inline_total": 0,
    "outbox_processed_total": 0,
    "outbox_failed_total": 0,
    "worker_jobs_processed_total": 0,
}
_latency_ms: Dict[str, float] = {}
_last_slow_requests: list = []


def inc(metric: str, n: int = 1) -> None:
    with _lock:
        _counters[metric] = _counters.get(metric, 0) + n


def observe_latency(name: str, duration_ms: float) -> None:
    with _lock:
        _latency_ms[name] = duration_ms


def record_slow_request(path: str, duration_ms: float, status: int) -> None:
    with _lock:
        _last_slow_requests.append({
            "path": path,
            "duration_ms": round(duration_ms, 2),
            "status": status,
        })
        if len(_last_slow_requests) > 50:
            _last_slow_requests.pop(0)


def snapshot() -> Dict[str, Any]:
    with _lock:
        return {
            "counters": dict(_counters),
            "latency_ms": dict(_latency_ms),
            "slow_requests_recent": list(_last_slow_requests[-10:]),
        }


class RequestMetricsMiddleware:
    """Starlette-compatible middleware recording request latency."""

    def __init__(self, app, *, slow_ms: float = 2000.0):
        self.app = app
        self.slow_ms = slow_ms

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()
        status_code = 500

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message.get("status", 500)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration_ms = (time.perf_counter() - start) * 1000
            path = scope.get("path", "")
            inc("http_requests_total")
            if status_code >= 500:
                inc("http_errors_total")
            observe_latency("http_last_request_ms", duration_ms)
            if duration_ms >= self.slow_ms:
                record_slow_request(path, duration_ms, status_code)
                logger.warning(
                    "slow request",
                    extra={
                        "obs_event": "slow_request",
                        "path": path,
                        "duration_ms": round(duration_ms, 2),
                        "status": status_code,
                    },
                )
