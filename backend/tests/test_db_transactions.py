"""Tests for MongoDB transaction helper fallback behavior."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.db_transactions import run_transactional, _transactions_unavailable


@pytest.mark.asyncio
async def test_run_transactional_executes_callback_without_session_on_fallback():
    calls = []

    async def callback(session):
        calls.append(session)
        return {"ok": True}

    with patch("services.db_transactions.client") as mock_client:
        mock_client.start_session = AsyncMock(
            side_effect=Exception("Transaction numbers are only allowed on a replica set member")
        )
        result = await run_transactional(callback, operation="test_op")

    assert result == {"ok": True}
    assert calls == [None]


@pytest.mark.asyncio
async def test_run_transactional_uses_session_when_available():
    session = MagicMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=None)
    session.start_transaction = MagicMock()
    session.start_transaction.return_value.__aenter__ = AsyncMock(return_value=None)
    session.start_transaction.return_value.__aexit__ = AsyncMock(return_value=None)

    async def callback(sess):
        assert sess is session
        return "done"

    with patch("services.db_transactions.client") as mock_client:
        mock_client.start_session = AsyncMock(return_value=session)
        result = await run_transactional(callback)

    assert result == "done"


def test_transactions_unavailable_detection():
    assert _transactions_unavailable(Exception("replica set member")) is True
    assert _transactions_unavailable(Exception("other error")) is False
