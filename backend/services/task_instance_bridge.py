"""
Task Instance Bridge — converts the strategy world (`scheduled_tasks`) into
the execution world (`task_instances`) that "My Tasks" reads from.

Runs weekly (cron) or on-demand (manual). Idempotent via the
`scheduled_task_id` unique reference on task_instances: re-running for the
same window never produces duplicates.

Each run is logged to `task_generation_runs` for the history view.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from database import db

logger = logging.getLogger(__name__)

# Map scheduled_tasks.status -> task_instances.status
STATUS_MAP = {
    "scheduled": "pending",
    "in_progress": "in_progress",
    "completed": "completed",
    "cancelled": "cancelled",
    "assigned": "pending",
}


async def _resolve_discipline(
    raw: Optional[str],
    discipline_cache: Dict[str, str],
) -> Optional[str]:
    """Resolve a raw discipline string to its canonical value using the
    configurator collection. Caches lookups per run."""
    if not raw:
        return None
    raw_lo = str(raw).strip().lower()
    if not raw_lo:
        return None
    if raw_lo in discipline_cache:
        return discipline_cache[raw_lo]
    # Direct match on value or label
    direct = await db.disciplines.find_one(
        {"$or": [{"value": raw_lo}, {"label": {"$regex": f"^{raw}$", "$options": "i"}}]},
        {"_id": 0, "value": 1},
    )
    if direct:
        discipline_cache[raw_lo] = direct["value"]
        return direct["value"]
    # Alias match
    via_alias = await db.disciplines.find_one(
        {"aliases": raw_lo}, {"_id": 0, "value": 1}
    )
    if via_alias:
        discipline_cache[raw_lo] = via_alias["value"]
        return via_alias["value"]
    discipline_cache[raw_lo] = raw_lo  # keep as-is, but cache so we don't query again
    return raw_lo


async def _get_program_discipline(program_id: Optional[str]) -> Optional[str]:
    """Resolve a program's discipline by looking up the v2 / legacy program."""
    if not program_id:
        return None
    prog = await db.maintenance_programs_v2.find_one(
        {"id": program_id}, {"_id": 0, "discipline": 1}
    ) or await db.maintenance_programs.find_one(
        {"id": program_id}, {"_id": 0, "discipline": 1}
    )
    return prog.get("discipline") if prog else None


async def _build_default_assignees() -> Dict[str, Dict[str, Optional[str]]]:
    """Map canonical discipline value -> { user_id, user_name } if configured."""
    discipline_rows = await db.disciplines.find(
        {"default_assignee_user_id": {"$ne": None}},
        {"_id": 0, "value": 1, "default_assignee_user_id": 1},
    ).to_list(500)
    user_ids = [
        d["default_assignee_user_id"]
        for d in discipline_rows
        if d.get("default_assignee_user_id")
    ]
    users_by_id: Dict[str, Dict[str, Any]] = {}
    if user_ids:
        users = await db.users.find(
            {"id": {"$in": user_ids}},
            {"_id": 0, "id": 1, "name": 1, "email": 1},
        ).to_list(len(user_ids))
        users_by_id = {u["id"]: u for u in users if u.get("id")}

    out: Dict[str, Dict[str, Optional[str]]] = {}
    for d in discipline_rows:
        uid = d.get("default_assignee_user_id")
        if not uid:
            continue
        user = users_by_id.get(uid) or {}
        out[d["value"]] = {
            "user_id": uid,
            "user_name": user.get("name") or user.get("email") or None,
        }
    return out


async def _build_program_discipline_map(program_ids: List[str]) -> Dict[str, Optional[str]]:
    """Batch-load discipline for maintenance programs referenced by scheduled tasks."""
    if not program_ids:
        return {}
    unique_ids = list(dict.fromkeys(pid for pid in program_ids if pid))
    out: Dict[str, Optional[str]] = {}

    v2_rows = await db.maintenance_programs_v2.find(
        {"id": {"$in": unique_ids}},
        {"_id": 0, "id": 1, "discipline": 1},
    ).to_list(len(unique_ids))
    for row in v2_rows:
        if row.get("id"):
            out[row["id"]] = row.get("discipline")

    missing = [pid for pid in unique_ids if pid not in out]
    if missing:
        legacy_rows = await db.maintenance_programs.find(
            {"id": {"$in": missing}},
            {"_id": 0, "id": 1, "discipline": 1},
        ).to_list(len(missing))
        for row in legacy_rows:
            if row.get("id"):
                out[row["id"]] = row.get("discipline")

    return out


async def sync_scheduled_tasks_to_instances(
    week_start: datetime,
    week_end: datetime,
    dry_run: bool = False,
    triggered_by: Optional[str] = None,
    triggered_by_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate task_instances for scheduled_tasks due in [week_start, week_end].

    Idempotent: skips any scheduled_task that already has a matching
    task_instance (matched via task_instances.scheduled_task_id).

    Returns: { created, skipped, errors, by_discipline, run_id, week_start, week_end }
    """
    run_id = str(uuid4())
    started_at = datetime.now(timezone.utc)

    week_start_iso = week_start.date().isoformat()
    week_end_iso = week_end.date().isoformat()

    # Pull every scheduled_task in the window that is still open
    cursor = db.scheduled_tasks.find(
        {
            "due_date": {"$gte": week_start_iso, "$lte": week_end_iso},
            "status": {"$nin": ["completed", "cancelled"]},
        },
        {"_id": 0},
    )
    candidate_tasks = await cursor.to_list(10000)

    # Existing instances in this window (to skip duplicates)
    candidate_ids = [t.get("id") for t in candidate_tasks if t.get("id")]
    existing_set: set = set()
    if candidate_ids:
        existing = await db.task_instances.find(
            {"scheduled_task_id": {"$in": candidate_ids}},
            {"_id": 0, "scheduled_task_id": 1},
        ).to_list(len(candidate_ids))
        existing_set = {e["scheduled_task_id"] for e in existing if e.get("scheduled_task_id")}

    default_assignees = await _build_default_assignees()
    discipline_cache: Dict[str, str] = {}
    program_ids = [
        st.get("maintenance_program_id")
        for st in candidate_tasks
        if st.get("maintenance_program_id")
    ]
    program_disciplines = await _build_program_discipline_map(program_ids)

    created = 0
    skipped = 0
    by_discipline: Dict[str, int] = {}
    errors: List[Dict[str, str]] = []
    to_insert: List[dict] = []

    for st in candidate_tasks:
        sched_id = st.get("id")
        if not sched_id or sched_id in existing_set:
            skipped += 1
            continue

        try:
            # Discipline: prefer the program's discipline; fall back to whatever
            # is on the scheduled_task (unlikely today but future-proof).
            program_disc = program_disciplines.get(st.get("maintenance_program_id"))
            raw_discipline = program_disc or st.get("discipline")
            canonical_discipline = await _resolve_discipline(raw_discipline, discipline_cache)

            # Due date: scheduled_tasks stores ISO strings; task_instances uses datetime.
            try:
                due_dt = datetime.fromisoformat(st.get("due_date") or week_start_iso).replace(
                    tzinfo=timezone.utc
                )
            except Exception:
                due_dt = week_start

            assignee_meta = default_assignees.get(canonical_discipline or "") or {}

            instance = {
                "id": str(uuid4()),
                "scheduled_task_id": sched_id,
                "task_plan_id": st.get("maintenance_program_id"),
                "task_template_id": None,
                "task_template_name": None,
                "title": st.get("task_name") or "Maintenance task",
                "description": st.get("task_description") or "",
                "discipline": canonical_discipline,
                "priority": st.get("priority") or "medium",
                "status": STATUS_MAP.get(st.get("status"), "pending"),
                "source": "maintenance",
                "source_type": st.get("task_source") or "strategy_generated",
                "due_date": due_dt,
                "scheduled_date": due_dt,
                "equipment_id": st.get("equipment_id"),
                "equipment_name": st.get("equipment_name"),
                "assigned_user_id": assignee_meta.get("user_id"),
                "assignee": assignee_meta.get("user_name") or "",
                "is_adhoc": False,
                "follow_up_required": False,
                "attachments": [],
                "issues_found": [],
                "form_data": {
                    "failure_mode_id": st.get("failure_mode_id"),
                    "failure_mode_name": st.get("failure_mode_name"),
                    "strategy_id": st.get("strategy_id"),
                    "pm_import_task_id": st.get("pm_import_task_id"),
                },
                "form_fields": [],
                "form_documents": [],
                "created_at": started_at,
                "updated_at": started_at,
                "created_by": triggered_by_user_id,
            }
            to_insert.append(instance)
            by_discipline[canonical_discipline or "_unknown"] = (
                by_discipline.get(canonical_discipline or "_unknown", 0) + 1
            )
            created += 1
        except Exception as ex:
            errors.append({"scheduled_task_id": sched_id, "error": str(ex)})

    if to_insert and not dry_run:
        # Bulk insert (idempotency was handled via existing_set above)
        await db.task_instances.insert_many(to_insert)

    completed_at = datetime.now(timezone.utc)
    run_record = {
        "id": run_id,
        "week_start": week_start_iso,
        "week_end": week_end_iso,
        "started_at": started_at,
        "completed_at": completed_at,
        "duration_ms": int((completed_at - started_at).total_seconds() * 1000),
        "triggered_by": triggered_by or "manual",
        "triggered_by_user_id": triggered_by_user_id,
        "dry_run": dry_run,
        "created": created,
        "skipped": skipped,
        "errors": errors,
        "by_discipline": by_discipline,
        "candidate_total": len(candidate_tasks),
    }
    if not dry_run:
        await db.task_generation_runs.insert_one(run_record.copy())

    logger.info(
        "task_instance_bridge run_id=%s week=%s..%s created=%d skipped=%d errors=%d dry_run=%s",
        run_id, week_start_iso, week_end_iso, created, skipped, len(errors), dry_run,
    )

    return {
        "run_id": run_id,
        "week_start": week_start_iso,
        "week_end": week_end_iso,
        "created": created,
        "skipped": skipped,
        "errors": errors,
        "by_discipline": by_discipline,
        "candidate_total": len(candidate_tasks),
        "dry_run": dry_run,
        "duration_ms": run_record["duration_ms"],
    }


def next_monday(reference: Optional[datetime] = None) -> datetime:
    """Return Monday 00:00 UTC at or after `reference` (default: today)."""
    ref = reference or datetime.now(timezone.utc)
    # Monday is weekday 0
    days_ahead = (0 - ref.weekday()) % 7
    if days_ahead == 0 and (ref.hour or ref.minute or ref.second):
        days_ahead = 7
    target = (ref + timedelta(days=days_ahead)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return target
