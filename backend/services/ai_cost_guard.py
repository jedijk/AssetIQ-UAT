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
        with self._lock:
            self._roll_day_if_needed()
            self._daily_requests[f"user:{record.user_id}"] += 1
            self._daily_requests[f"company:{record.company_id}"] += 1
            self._daily_spend_usd[f"company:{record.company_id}"] += record.estimated_cost_usd

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

    def get_daily_summary(self, company_id: str) -> dict:
        with self._lock:
            self._roll_day_if_needed()
            key = f"company:{company_id or 'default'}"
            return {
                "date": self._daily_date,
                "requests": self._daily_requests.get(key, 0),
                "spend_usd": round(self._daily_spend_usd.get(key, 0.0), 4),
                "cap_usd": DEFAULT_DAILY_SPEND_CAP_USD,
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
) -> float:
    cost = ai_cost_guard.estimate_cost_usd(prompt_tokens, completion_tokens)
    ai_cost_guard.record_usage(
        AIUsageRecord(
            user_id=user_id or "anonymous",
            company_id=company_id or "default",
            endpoint=endpoint,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            estimated_cost_usd=cost,
            model=model,
        )
    )
    return cost
