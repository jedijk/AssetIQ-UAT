"""Tests for maintenance scheduler query scoping."""
from unittest.mock import AsyncMock, patch

import pytest

from services.maintenance_scheduler_scope import scope_scheduled_tasks_query


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
  assert "$or" in scope
  assert {"maintenance_program_id": {"$in": ["prog-1"]}} in scope["$or"]
  assert {"equipment_id": {"$in": ["eq-1"]}} in scope["$or"]


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
