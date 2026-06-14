"""Tests for threat cascade delete repository."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

USER = {"company_id": "co-a", "id": "user-a", "role": "admin"}


@pytest.mark.asyncio
async def test_delete_threat_cascade_not_found():
    with patch("repositories.threat_repository.ThreatRepository") as MockRepo:
        instance = MockRepo.return_value
        instance.find_by_id = AsyncMock(return_value=None)
        from repositories.threat_repository import delete_threat_cascade

        with pytest.raises(ValueError, match="not_found"):
            await delete_threat_cascade(threat_id="t-1", user=USER)


@pytest.mark.asyncio
async def test_delete_threat_cascade_runs_transaction():
    threat = {"id": "t-1", "created_by": "user-a"}

    async def fake_transactional(callback, **kwargs):
        return await callback(None)

    with patch("repositories.threat_repository.ThreatRepository") as MockRepo:
        instance = MockRepo.return_value
        instance.find_by_id = AsyncMock(return_value=threat)
        instance.delete_filter = MagicMock(return_value={"id": "t-1"})

        with patch("repositories.threat_repository.run_transactional", side_effect=fake_transactional):
            with patch("repositories.threat_repository.db") as mock_db:
                mock_db.threats.delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))
                from repositories.threat_repository import delete_threat_cascade

                result = await delete_threat_cascade(threat_id="t-1", user=USER)

    assert result["threat_id"] == "t-1"
    mock_db.threats.delete_one.assert_called_once()
