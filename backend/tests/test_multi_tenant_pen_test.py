"""Unit tests for cross-tenant pen-test helpers (live DB script: run_cross_tenant_pen_test.py)."""
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
sys.path.insert(0, str(BACKEND_ROOT / "scripts"))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")


def test_tenant_a_cannot_read_tenant_b_via_merge_filter(monkeypatch):
    monkeypatch.setenv("TENANT_STRICT_MODE", "true")
    import importlib

    import services.tenant_schema as ts

    importlib.reload(ts)

    user_a = {"company_id": "tenant-a", "tenant_id": "tenant-a", "id": "a"}
    query = ts.merge_tenant_filter({"id": "proof-b-action"}, user_a)
    assert query == {
        "$and": [
            {"id": "proof-b-action"},
            {
                "$or": [
                    {"tenant_id": "tenant-a"},
                    {"company_id": "tenant-a"},
                ]
            },
        ]
    }


def _mock_db(collections: dict):
    db = MagicMock()
    for name, coll in collections.items():
        setattr(db, name, coll)
    default = MagicMock(find_one=AsyncMock(return_value=None))
    db.central_actions = collections.get("central_actions", default)
    db.scheduled_tasks = collections.get("scheduled_tasks", default)
    db.task_instances = collections.get("task_instances", default)
    db.form_templates = collections.get("form_templates", default)
    db.spare_parts = collections.get("spare_parts", default)
    db.background_jobs = collections.get("background_jobs", default)
    return db


@pytest.mark.asyncio
async def test_pen_test_assert_cannot_read_foreign():
    from run_cross_tenant_pen_test import _assert_cannot_read_foreign

    db = _mock_db(
        {
            "equipment_nodes": MagicMock(find_one=AsyncMock(return_value=None)),
            "observations": MagicMock(find_one=AsyncMock(return_value=None)),
        }
    )

    user_a = {"company_id": "Tyromer", "tenant_id": "Tyromer", "id": "a"}
    failures = await _assert_cannot_read_foreign(
        db,
        user_a,
        "Tenant B",
        {"equipment_id": "proof-b-equipment", "observation_id": "proof-b-observation"},
    )
    assert failures == []


@pytest.mark.asyncio
async def test_pen_test_detects_foreign_leak():
    from run_cross_tenant_pen_test import _assert_cannot_read_foreign

    db = _mock_db(
        {
            "equipment_nodes": MagicMock(
                find_one=AsyncMock(
                    return_value={"id": "proof-b-equipment", "tenant_id": "proof-b-uuid"}
                )
            ),
        }
    )

    user_a = {"company_id": "Tyromer", "tenant_id": "Tyromer", "id": "a"}
    failures = await _assert_cannot_read_foreign(
        db,
        user_a,
        "Tenant B",
        {"equipment_id": "proof-b-equipment"},
    )
    assert len(failures) == 1
    assert "proof-b-equipment" in failures[0]
