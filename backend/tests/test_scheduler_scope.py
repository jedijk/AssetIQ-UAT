"""Tests for maintenance scheduler query scoping."""
from unittest.mock import AsyncMock, patch

import pytest

from services.maintenance_scheduler_scope import (
    load_schedulable_program_rows,
    scope_scheduled_tasks_query,
)


@pytest.mark.asyncio
async def test_scope_preserves_due_date_filter():
  query = {
      "due_date": {"$gte": "2026-01-01", "$lte": "2026-12-31"},
      "status": {"$nin": ["cancelled"]},
  }
  rows = [
      {"id": "prog-1", "equipment_id": "eq-1"},
  ]

  with patch(
      "services.maintenance_scheduler_scope.load_schedulable_program_rows",
      new=AsyncMock(return_value=rows),
  ):
      await scope_scheduled_tasks_query(query, equipment_type_id="type-1")

  assert "$and" in query
  assert query["$and"][0]["due_date"]["$gte"] == "2026-01-01"
  assert query["$and"][0]["status"] == {"$nin": ["cancelled"]}
  scope = query["$and"][1]
  assert scope == {"maintenance_program_id": {"$in": ["prog-1"]}}


@pytest.mark.asyncio
async def test_scope_empty_programs_returns_no_results():
  query = {"due_date": {"$gte": "2026-01-01"}}

  with patch(
      "services.maintenance_scheduler_scope.load_schedulable_program_rows",
      new=AsyncMock(return_value=[]),
  ):
      await scope_scheduled_tasks_query(query, equipment_type_id="type-1")

  assert "$and" in query
  assert query["$and"][1] == {"_id": {"$exists": False}}


@pytest.mark.asyncio
async def test_scope_applies_tenant_filter_not_user_fields():
  """Regression: scheduler_scoped(user, query) must not receive swapped args."""
  query = {"due_date": {"$gte": "2026-01-01"}}
  rows = [{"id": "prog-1", "equipment_id": "eq-1"}]
  user = {"company_id": "tenant-abc", "user_id": "user-1"}

  with patch(
      "services.maintenance_scheduler_scope.load_schedulable_program_rows",
      new=AsyncMock(return_value=rows),
  ):
      await scope_scheduled_tasks_query(query, equipment_type_id="type-1", user=user)

  assert "user_id" not in query
  assert "$and" in query
  scope_part = query["$and"][1]
  assert "user_id" not in scope_part
  # scope + tenant merged (nested $and), not the raw user dict
  inner = scope_part.get("$and", [scope_part])
  scope_prog = next((p for p in inner if "maintenance_program_id" in p), None)
  assert scope_prog == {"maintenance_program_id": {"$in": ["prog-1"]}}
  tenant_part = next((p for p in inner if "tenant_id" in str(p)), None)
  assert tenant_part is not None


@pytest.mark.asyncio
async def test_scope_passes_user_to_load_schedulable_program_rows():
  """Regression: program ids must resolve under the request tenant, not BACKFILL_TENANT_ID."""
  query = {"due_date": {"$gte": "2026-01-01"}}
  user = {"company_id": "tenant-abc", "user_id": "user-1"}
  mock_load = AsyncMock(return_value=[{"id": "prog-1", "equipment_id": "eq-1"}])

  with patch(
      "services.maintenance_scheduler_scope.load_schedulable_program_rows",
      new=mock_load,
  ):
      await scope_scheduled_tasks_query(query, equipment_type_id="type-1", user=user)

  mock_load.assert_awaited_once_with("type-1", user=user)


@pytest.mark.asyncio
async def test_load_schedulable_program_rows_forwards_user():
  mock_programs = AsyncMock(return_value=[{"id": "prog-1"}])

  with patch(
      "services.scheduler_program_source.load_schedulable_programs",
      new=mock_programs,
  ):
      rows = await load_schedulable_program_rows("type-1", user={"company_id": "tenant-abc"})

  assert rows == [{"id": "prog-1"}]
  mock_programs.assert_awaited_once_with(
      equipment_type_id="type-1",
      user={"company_id": "tenant-abc"},
  )
