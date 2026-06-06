"""Tests for maintenance readiness snapshot builder."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.maintenance_readiness import build_maintenance_readiness_snapshot


@pytest.mark.asyncio
async def test_build_maintenance_readiness_snapshot(monkeypatch):
    monkeypatch.delenv("READ_LEGACY_MAINTENANCE_PROGRAMS", raising=False)
    monkeypatch.delenv("SYNC_LEGACY_MAINTENANCE_PROGRAMS", raising=False)
    monkeypatch.delenv("USE_EXTERNAL_BACKGROUND_WORKER", raising=False)

    mock_db = MagicMock()
    mock_db.equipment_type_strategies.count_documents = AsyncMock(side_effect=[2, 5])
    mock_db.maintenance_programs_v2.count_documents = AsyncMock(return_value=100)
    mock_db.maintenance_programs.count_documents = AsyncMock(return_value=10)
    mock_db.reliability_edges.count_documents = AsyncMock(return_value=42)

    queue_health = {"status": "ok", "by_status": {"pending": 1}, "dead_letter_total": 0}

    with patch("services.maintenance_readiness.db", mock_db), patch(
        "services.maintenance_readiness.background_job_service.get_queue_health",
        AsyncMock(return_value=queue_health),
    ):
        snapshot = await build_maintenance_readiness_snapshot()

    assert snapshot["strategy_needs_apply_count"] == 2
    assert snapshot["active_strategies"] == 5
    assert snapshot["v2_program_count"] == 100
    assert snapshot["legacy_program_count"] == 10
    assert snapshot["reliability_edges_total"] == 42
    assert snapshot["background_jobs"] == queue_health
    assert snapshot["uat_gates_script"] == "backend/scripts/verify_uat_gates.py"
