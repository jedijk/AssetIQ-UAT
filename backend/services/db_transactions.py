"""
MongoDB multi-document transaction helper with replica-set fallback.

When transactions are unavailable (standalone MongoDB), operations run
sequentially without a session so local dev and CI still function.
"""
from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable, Optional, TypeVar

from database import client

logger = logging.getLogger(__name__)

T = TypeVar("T")

_TRANSACTION_UNAVAILABLE_MARKERS = (
    "Transaction numbers are only allowed",
    "replica set member",
    "not a replica set",
    "Transactions are not supported",
)


def _transactions_unavailable(exc: BaseException) -> bool:
    message = str(exc).lower()
    return any(marker.lower() in message for marker in _TRANSACTION_UNAVAILABLE_MARKERS)


async def run_transactional(
    callback: Callable[[Optional[Any]], Awaitable[T]],
    *,
    operation: str = "transaction",
) -> T:
    """
    Run ``callback(session)`` inside a MongoDB transaction when supported.

    ``session`` is None when transactions are unavailable; callers should
    pass ``session=session`` only when session is not None.
    """
    try:
        async with await client.start_session() as session:
            async with session.start_transaction():
                return await callback(session)
    except Exception as exc:
        if _transactions_unavailable(exc):
            logger.warning(
                "Transactions unavailable for %s — running without session: %s",
                operation,
                exc,
            )
            return await callback(None)
        raise
