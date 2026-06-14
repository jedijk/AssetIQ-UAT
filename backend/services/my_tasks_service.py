"""My Tasks read service — Wave 6 convergence."""
from __future__ import annotations

from typing import Any, Dict, Optional

from services.work_execution_kpi_materializer import get_or_compute_work_execution_kpis
from services.work_item_query import fetch_work_items


async def get_my_tasks_kpis(user: dict) -> Dict[str, Any]:
    return await get_or_compute_work_execution_kpis(user)


async def list_my_tasks(
    user: dict,
    *,
    filter_name: str = "open",
    date: Optional[str] = None,
    equipment_id: Optional[str] = None,
    status: Optional[str] = None,
    discipline: Optional[str] = None,
) -> Dict[str, Any]:
    tasks = await fetch_work_items(
        user["id"],
        filter_name=filter_name,
        date=date,
        equipment_id=equipment_id,
        status=status,
        discipline=discipline,
        user=user,
    )
    return {"tasks": tasks, "count": len(tasks), "filter": filter_name}
