"""Tests for GET /api/admin/maintenance-readiness."""
import importlib.util
import sys
import types
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

ADMIN_PATH = Path(__file__).resolve().parents[1] / "routes" / "admin.py"


def _load_admin_module(mock_db):
    database_mod = types.ModuleType("database")
    database_mod.db = mock_db
    database_mod.ai_usage_tracker = MagicMock()
    sys.modules["database"] = database_mod

    auth_mod = types.ModuleType("routes.auth")

    def get_current_user():
        return {}

    auth_mod.get_current_user = get_current_user
    sys.modules.setdefault("routes", types.ModuleType("routes"))
    sys.modules["routes.auth"] = auth_mod

    ai_cost_mod = types.ModuleType("services.ai_cost_guard")
    ai_cost_mod.ai_cost_guard = MagicMock()
    sys.modules["services.ai_cost_guard"] = ai_cost_mod

    spec = importlib.util.spec_from_file_location("admin_routes_test", ADMIN_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.mark.asyncio
async def test_maintenance_readiness_snapshot(monkeypatch):
    monkeypatch.delenv("READ_LEGACY_MAINTENANCE_PROGRAMS", raising=False)
    monkeypatch.delenv("SYNC_LEGACY_MAINTENANCE_PROGRAMS", raising=False)
    monkeypatch.delenv("USE_EXTERNAL_BACKGROUND_WORKER", raising=False)

    mock_db = MagicMock()
    mock_db.equipment_type_strategies.count_documents = AsyncMock(side_effect=[2, 5])
    mock_db.maintenance_programs_v2.count_documents = AsyncMock(return_value=100)
    mock_db.maintenance_programs.count_documents = AsyncMock(return_value=10)
    mock_db.reliability_edges.count_documents = AsyncMock(return_value=42)

    admin_mod = _load_admin_module(mock_db)
    queue_health = {"status": "ok", "by_status": {"pending": 1}, "dead_letter_total": 0}

    with patch(
        "services.background_jobs.background_job_service.get_queue_health",
        AsyncMock(return_value=queue_health),
    ):
        result = await admin_mod.get_maintenance_readiness(current_user={"role": "admin"})

    assert result["read_legacy_maintenance_programs"] is False
    assert result["sync_legacy_maintenance_programs"] is False
    assert result["use_external_background_worker"] is False
    assert result["strategy_needs_apply_count"] == 2
    assert result["active_strategies"] == 5
    assert result["v2_program_count"] == 100
    assert result["legacy_program_count"] == 10
    assert result["reliability_edges_total"] == 42
    assert result["background_jobs"] == queue_health
    assert result["uat_gates_script"] == "backend/scripts/verify_uat_gates.py"
