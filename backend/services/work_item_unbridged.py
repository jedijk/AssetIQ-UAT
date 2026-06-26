"""Unbridged scheduled_task work-item fetch."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from database import db
from services.db_monitoring import timed_find
from services.scheduler_job import get_task_generation_config
from services.tenant_schema import merge_tenant_filter
from services.task_instance_bridge import (
    _build_default_assignees,
    _build_program_discipline_map,
    _resolve_discipline,
)
from services.work_execution_config import should_include_unbridged_work_items
from services.work_item_filters import (
    MAX_UNBRIDGED_ITEMS,
    _build_scheduled_task_query,
    _user_can_see_item,
    should_exclude_unbridged_scheduled_task_from_my_tasks,
)
from services.work_item_serializers import (
    _safe_iso,
    _work_item_dedupe_key,
    serialize_scheduled_task_as_work_item,
)

logger = logging.getLogger(__name__)


async def _maybe_fetch_unbridged(
    user_id: str,
    *,
    filter_name: str = "open",
    equipment_id: Optional[str] = None,
    discipline: Optional[str] = None,
    now: Optional[datetime] = None,
    user: Optional[dict] = None,
) -> List[dict]:
    if not await should_include_unbridged_work_items():
        return []
    try:
        gen_cfg = await get_task_generation_config()
        if not gen_cfg.get("enabled", True):
            return []
    except Exception as exc:
        logger.warning("task_generation config lookup skipped: %s", exc)
    return await fetch_unbridged_maintenance_work_items(
        user_id,
        filter_name=filter_name,
        equipment_id=equipment_id,
        discipline=discipline,
        now=now,
        user=user,
    )


async def fetch_unbridged_maintenance_work_items(
    user_id: str,
    *,
    filter_name: str = "open",
    equipment_id: Optional[str] = None,
    discipline: Optional[str] = None,
    now: Optional[datetime] = None,
    user: Optional[dict] = None,
) -> List[dict]:
    """Load open scheduled_tasks not yet mirrored in task_instances."""
    now = now or datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    query = _build_scheduled_task_query(
        filter_name=filter_name,
        now=now,
        today_start=today_start,
        today_end=today_end,
        equipment_id=equipment_id,
    )
    if query is None:
        return []

    query = merge_tenant_filter(query, user)

    cursor = await timed_find(db.scheduled_tasks, query, {"_id": 0})
    candidate_tasks = await cursor.sort("due_date", 1).to_list(MAX_UNBRIDGED_ITEMS * 2)

    if not candidate_tasks:
        return []

    candidate_ids = [t.get("id") for t in candidate_tasks if t.get("id")]
    existing_set: set = set()
    existing_fingerprints: set = set()
    if candidate_ids:
        existing_cursor = await timed_find(
            db.task_instances,
            merge_tenant_filter(
                {"scheduled_task_id": {"$in": candidate_ids}},
                user,
            ),
            {
                "_id": 0,
                "scheduled_task_id": 1,
                "equipment_id": 1,
                "due_date": 1,
                "scheduled_date": 1,
                "v2_task_id": 1,
                "maintenance_program_id": 1,
                "task_plan_id": 1,
            },
        )
        existing = await existing_cursor.to_list(len(candidate_ids))
        for row in existing:
            if row.get("scheduled_task_id"):
                existing_set.add(row["scheduled_task_id"])
            existing_fingerprints.add(
                _work_item_dedupe_key(
                    {
                        "scheduled_task_id": row.get("scheduled_task_id"),
                        "equipment_id": row.get("equipment_id"),
                        "v2_task_id": row.get("v2_task_id"),
                        "maintenance_program_id": row.get("maintenance_program_id")
                        or row.get("task_plan_id"),
                        "due_date": _safe_iso(row.get("due_date")) or row.get("due_date"),
                        "scheduled_date": row.get("scheduled_date"),
                    }
                )
            )

    eq_ids = list({t.get("equipment_id") for t in candidate_tasks if t.get("equipment_id")})
    if eq_ids:
        overlap_cursor = await timed_find(
            db.task_instances,
            merge_tenant_filter(
                {
                    "equipment_id": {"$in": eq_ids},
                    "status": {"$nin": ["completed", "cancelled"]},
                },
                user,
            ),
            {
                "_id": 0,
                "scheduled_task_id": 1,
                "equipment_id": 1,
                "due_date": 1,
                "scheduled_date": 1,
                "v2_task_id": 1,
                "maintenance_program_id": 1,
                "task_plan_id": 1,
            },
        )
        for row in await overlap_cursor.to_list(MAX_UNBRIDGED_ITEMS * 4):
            existing_fingerprints.add(
                _work_item_dedupe_key(
                    {
                        "scheduled_task_id": row.get("scheduled_task_id"),
                        "equipment_id": row.get("equipment_id"),
                        "v2_task_id": row.get("v2_task_id"),
                        "maintenance_program_id": row.get("maintenance_program_id")
                        or row.get("task_plan_id"),
                        "due_date": _safe_iso(row.get("due_date")) or row.get("due_date"),
                        "scheduled_date": row.get("scheduled_date"),
                    }
                )
            )

    default_assignees = await _build_default_assignees()
    discipline_cache: Dict[str, str] = {}
    program_ids = [
        st.get("maintenance_program_id")
        for st in candidate_tasks
        if st.get("maintenance_program_id")
    ]
    program_disciplines = await _build_program_discipline_map(program_ids)

    items: List[dict] = []
    discipline_lo = discipline.lower() if discipline else None

    for st in candidate_tasks:
        sched_id = st.get("id")
        if not sched_id or sched_id in existing_set:
            continue

        if should_exclude_unbridged_scheduled_task_from_my_tasks(st):
            continue

        fp = _work_item_dedupe_key(
            {
                "scheduled_task_id": sched_id,
                "equipment_id": st.get("equipment_id"),
                "v2_task_id": st.get("v2_task_id"),
                "maintenance_program_id": st.get("maintenance_program_id"),
                "program_task_id": st.get("program_task_id"),
                "due_date": st.get("due_date"),
            }
        )
        if fp in existing_fingerprints and fp != (None, None, None, None):
            continue

        program_disc = program_disciplines.get(st.get("maintenance_program_id"))
        raw_discipline = program_disc or st.get("discipline")
        canonical_discipline = await _resolve_discipline(raw_discipline, discipline_cache)

        if discipline_lo:
            disc = (canonical_discipline or raw_discipline or "").lower()
            if discipline_lo not in disc:
                continue

        assignee_meta = default_assignees.get(canonical_discipline or "") or {}
        assigned_user_id = assignee_meta.get("user_id")
        if not _user_can_see_item(assigned_user_id, user_id):
            continue

        items.append(
            serialize_scheduled_task_as_work_item(
                st,
                canonical_discipline=canonical_discipline,
                assigned_user_id=assigned_user_id,
                assignee=assignee_meta.get("user_name"),
            )
        )
        existing_fingerprints.add(fp)
        if len(items) >= MAX_UNBRIDGED_ITEMS:
            break

    return items
