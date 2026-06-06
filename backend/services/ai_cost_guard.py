"""
AI cost protection: per-user / per-company rate limits and daily spend caps.
"""
from __future__ import annotations

import logging
import os
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException

logger = logging.getLogger("assetiq.ai_guard")

# Defaults (override via environment)
DEFAULT_USER_PER_MINUTE = int(os.environ.get("AI_RATE_LIMIT_USER_PER_MINUTE", "20"))
DEFAULT_COMPANY_PER_MINUTE = int(os.environ.get("AI_RATE_LIMIT_COMPANY_PER_MINUTE", "100"))
DEFAULT_USER_DAILY_REQUESTS = int(os.environ.get("AI_DAILY_USER_REQUEST_LIMIT", "500"))
DEFAULT_COMPANY_DAILY_REQUESTS = int(os.environ.get("AI_DAILY_COMPANY_REQUEST_LIMIT", "5000"))
DEFAULT_DAILY_SPEND_CAP_USD = float(os.environ.get("AI_DAILY_SPEND_CAP_USD", "50"))


# Rough USD per 1K tokens (configurable average for gpt-4o-mini class models)
COST_PER_1K_TOKENS_USD = float(os.environ.get("AI_COST_PER_1K_TOKENS_USD", "0.002"))


@dataclass
class AIUsageRecord:
    user_id: str
    company_id: str
    endpoint: str
    prompt_tokens: int
    completion_tokens: int
    estimated_cost_usd: float
    model: str = ""


class AICostGuard:
    """In-process rate limiting and daily usage tracking (single-instance safe)."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._minute_buckets: Dict[str, list] = defaultdict(list)
        self._daily_requests: Dict[str, int] = defaultdict(int)
        self._daily_spend_usd: Dict[str, float] = defaultdict(float)
        self._daily_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def _roll_day_if_needed(self) -> None:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if today != self._daily_date:
            self._daily_requests.clear()
            self._daily_spend_usd.clear()
            self._daily_date = today

    def _prune_minute(self, key: str, now: float) -> None:
        window = self._minute_buckets[key]
        self._minute_buckets[key] = [t for t in window if now - t < 60.0]

    def _check_minute_limit(self, key: str, limit: int, label: str) -> None:
        from services.redis_store import incr_with_ttl

        redis_count = incr_with_ttl(f"ai_guard:min:{key}", 60)
        if redis_count is not None:
            if redis_count > limit:
                logger.warning(
                    "AI rate limit exceeded (redis)",
                    extra={"ai_event": "rate_limit", "scope": label, "key": key, "limit": limit},
                )
                raise HTTPException(
                    status_code=429,
                    detail=f"AI rate limit exceeded ({label}). Try again in a minute.",
                )
            return

        now = time.time()
        with self._lock:
            self._prune_minute(key, now)
            if len(self._minute_buckets[key]) >= limit:
                logger.warning(
                    "AI rate limit exceeded",
                    extra={
                        "ai_event": "rate_limit",
                        "scope": label,
                        "key": key,
                        "limit": limit,
                    },
                )
                raise HTTPException(
                    status_code=429,
                    detail=f"AI rate limit exceeded ({label}). Try again in a minute.",
                )
            self._minute_buckets[key].append(now)

    def _check_daily_requests(self, key: str, limit: int, label: str) -> None:
        from services.redis_store import get_int

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        redis_count = get_int(f"ai_guard:day:{today}:{key}")
        if redis_count is not None:
            if redis_count >= limit:
                raise HTTPException(
                    status_code=429,
                    detail=f"Daily AI request limit exceeded ({label}).",
                )
            return

        with self._lock:
            self._roll_day_if_needed()
            if self._daily_requests[key] >= limit:
                raise HTTPException(
                    status_code=429,
                    detail=f"Daily AI request limit exceeded ({label}).",
                )

    def _check_daily_spend(self, company_id: str, additional_usd: float) -> None:
        cap = DEFAULT_DAILY_SPEND_CAP_USD
        if cap <= 0:
            return

        from services.redis_store import get_int

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        spend_key = f"ai_guard:spend:{today}:company:{company_id}"
        redis_spend = get_int(spend_key)
        if redis_spend is not None:
            # get_int returns int; spend is float — use get_redis directly
            from services.redis_store import get_redis

            client = get_redis()
            if client:
                try:
                    current = float(client.get(spend_key) or 0)
                    if current + additional_usd > cap:
                        raise HTTPException(
                            status_code=429,
                            detail="Daily AI spending cap exceeded for your organization.",
                        )
                    return
                except HTTPException:
                    raise
                except Exception:
                    pass

        with self._lock:
            self._roll_day_if_needed()
            spend_key = f"company:{company_id}"
            projected = self._daily_spend_usd[spend_key] + additional_usd
            if projected > cap:
                raise HTTPException(
                    status_code=429,
                    detail="Daily AI spending cap exceeded for your organization.",
                )

    def estimate_cost_usd(self, prompt_tokens: int, completion_tokens: int) -> float:
        total = prompt_tokens + completion_tokens
        return round((total / 1000.0) * COST_PER_1K_TOKENS_USD, 6)

    def check_and_reserve(
        self,
        *,
        user_id: str,
        company_id: str,
        endpoint: str,
        estimated_tokens: int = 1000,
    ) -> None:
        """Call before an AI request. Raises HTTP 429 when limits exceeded."""
        company_id = company_id or "default"
        est_cost = self.estimate_cost_usd(estimated_tokens, 0)

        self._check_minute_limit(f"user:{user_id}", DEFAULT_USER_PER_MINUTE, "user")
        self._check_minute_limit(f"company:{company_id}", DEFAULT_COMPANY_PER_MINUTE, "company")
        self._check_daily_requests(f"user:{user_id}", DEFAULT_USER_DAILY_REQUESTS, "user")
        self._check_daily_requests(f"company:{company_id}", DEFAULT_COMPANY_DAILY_REQUESTS, "company")
        self._check_daily_spend(company_id, est_cost)

        logger.info(
            "AI request allowed",
            extra={
                "ai_event": "request_allowed",
                "user_id": user_id,
                "company_id": company_id,
                "endpoint": endpoint,
                "estimated_cost_usd": est_cost,
            },
        )

    def record_usage(self, record: AIUsageRecord) -> None:
        from services.redis_store import get_redis, incr_with_ttl

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        user_key = f"user:{record.user_id}"
        company_key = f"company:{record.company_id}"

        user_redis_ok = (
            incr_with_ttl(f"ai_guard:day:{today}:{user_key}", 86400 * 2) is not None
        )
        company_redis_ok = (
            incr_with_ttl(f"ai_guard:day:{today}:{company_key}", 86400 * 2) is not None
        )

        spend_redis_ok = False
        client = get_redis()
        if client:
            spend_key = f"ai_guard:spend:{today}:{company_key}"
            try:
                client.incrbyfloat(spend_key, record.estimated_cost_usd)
                client.expire(spend_key, 86400 * 2)
                spend_redis_ok = True
            except Exception:
                pass

        if not user_redis_ok or not company_redis_ok or not spend_redis_ok:
            with self._lock:
                self._roll_day_if_needed()
                if not user_redis_ok:
                    self._daily_requests[user_key] += 1
                if not company_redis_ok:
                    self._daily_requests[company_key] += 1
                if not spend_redis_ok:
                    self._daily_spend_usd[company_key] += record.estimated_cost_usd

        logger.info(
            "AI usage recorded",
            extra={
                "ai_event": "usage_recorded",
                "user_id": record.user_id,
                "company_id": record.company_id,
                "endpoint": record.endpoint,
                "prompt_tokens": record.prompt_tokens,
                "completion_tokens": record.completion_tokens,
                "estimated_cost_usd": record.estimated_cost_usd,
                "model": record.model,
            },
        )

    def get_limits_config(self) -> dict:
        return {
            "rate_limit": {
                "user_per_minute": DEFAULT_USER_PER_MINUTE,
                "company_per_minute": DEFAULT_COMPANY_PER_MINUTE,
            },
            "daily": {
                "user_request_limit": DEFAULT_USER_DAILY_REQUESTS,
                "company_request_limit": DEFAULT_COMPANY_DAILY_REQUESTS,
                "spend_cap_usd": DEFAULT_DAILY_SPEND_CAP_USD,
            },
        }

    def get_daily_summary(self, company_id: str) -> dict:
        from services.redis_store import get_redis

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        key = f"company:{company_id or 'default'}"
        client = get_redis()
        if client:
            try:
                requests = int(client.get(f"ai_guard:day:{today}:{key}") or 0)
                spend = float(client.get(f"ai_guard:spend:{today}:{key}") or 0)
                return {
                    "date": today,
                    "requests": requests,
                    "spend_usd": round(spend, 4),
                    "cap_usd": DEFAULT_DAILY_SPEND_CAP_USD,
                    "request_cap": DEFAULT_COMPANY_DAILY_REQUESTS,
                    "backend": "redis",
                }
            except Exception:
                pass

        with self._lock:
            self._roll_day_if_needed()
            return {
                "date": self._daily_date,
                "requests": self._daily_requests.get(key, 0),
                "spend_usd": round(self._daily_spend_usd.get(key, 0.0), 4),
                "cap_usd": DEFAULT_DAILY_SPEND_CAP_USD,
                "request_cap": DEFAULT_COMPANY_DAILY_REQUESTS,
                "backend": "memory",
            }

    def get_limits_and_usage(self, company_id: str) -> dict:
        config = self.get_limits_config()
        daily = self.get_daily_summary(company_id)
        request_cap = config["daily"]["company_request_limit"]
        spend_cap = config["daily"]["spend_cap_usd"]
        requests = daily["requests"]
        spend = daily["spend_usd"]
        return {
            **config,
            "usage_today": {
                "date": daily["date"],
                "company_requests": requests,
                "company_spend_usd": spend,
                "backend": daily.get("backend", "memory"),
            },
            "utilization": {
                "company_requests_pct": round(requests / request_cap * 100, 1)
                if request_cap > 0
                else 0,
                "spend_pct": round(spend / spend_cap * 100, 1) if spend_cap > 0 else 0,
            },
        }


ai_cost_guard = AICostGuard()


def guard_ai_request(
    *,
    user_id: str,
    company_id: Optional[str],
    endpoint: str,
    estimated_tokens: int = 1000,
) -> None:
    ai_cost_guard.check_and_reserve(
        user_id=user_id or "anonymous",
        company_id=company_id or "default",
        endpoint=endpoint,
        estimated_tokens=estimated_tokens,
    )


def record_ai_tokens(
    *,
    user_id: str,
    company_id: Optional[str],
    endpoint: str,
    prompt_tokens: int,
    completion_tokens: int,
    model: str = "",
    feature: Optional[str] = None,
    installation_id: Optional[str] = None,
    installation_name: Optional[str] = None,
) -> float:
    cost = ai_cost_guard.estimate_cost_usd(prompt_tokens, completion_tokens)
    resolved_company = company_id or "default"
    ai_cost_guard.record_usage(
        AIUsageRecord(
            user_id=user_id or "anonymous",
            company_id=resolved_company,
            endpoint=endpoint,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            estimated_cost_usd=cost,
            model=model,
        )
    )

    from services.ai_usage_service import schedule_log_usage

    schedule_log_usage(
        installation_id=installation_id or resolved_company,
        installation_name=installation_name or resolved_company,
        user_id=user_id or "anonymous",
        model=model or "unknown",
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        feature=feature or endpoint,
    )
    return cost
