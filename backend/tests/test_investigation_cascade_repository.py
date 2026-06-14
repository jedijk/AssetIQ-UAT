"""Tests for investigation cascade delete repository."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

USER = {"company_id": "co-a", "id": "user-a", "role": "admin"}


@pytest.mark.asyncio
async def test_delete_investigation_cascade_not_found():
    with patch("repositories.investigation_repository.InvestigationRepository") as MockRepo:
        instance = MockRepo.return_value
        instance.find_by_id = AsyncMock(return_value=None)
        from repositories.investigation_repository import delete_investigation_cascade

        with pytest.raises(ValueError, match="not_found"):
            await delete_investigation_cascade(inv_id="inv-1", user=USER)


@pytest.mark.asyncio
async def test_delete_investigation_cascade_runs_transaction():
    inv = {"id": "inv-1", "threat_id": "t-1"}

    async def fake_transactional(callback, **kwargs):
        return await callback(None)

    with patch("repositories.investigation_repository.InvestigationRepository") as MockRepo:
        instance = MockRepo.return_value
        instance.find_by_id = AsyncMock(return_value=inv)

        with patch(
            "repositories.investigation_repository.run_transactional",
            side_effect=fake_transactional,
        ):
            with patch(
                "repositories.investigation_repository.delete_single_investigation_cascade",
                new_callable=AsyncMock,
                return_value=2,
            ) as mock_cascade:
                from repositories.investigation_repository import delete_investigation_cascade

                result = await delete_investigation_cascade(
                    inv_id="inv-1",
                    delete_central_actions=True,
                    user=USER,
                )

    assert result["investigation_id"] == "inv-1"
    assert result["deleted_central_actions"] == 2
    mock_cascade.assert_called_once()
