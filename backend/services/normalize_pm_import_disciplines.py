"""
Backfill legacy PM import discipline values to the standard taxonomy.

Targets:
- pm_import_sessions.tasks_extracted[].discipline
- maintenance_programs_v2 PM import tasks
- failure_modes created from PM import (recommended_actions + category)
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from models.disciplines import DISCIPLINE_LIST, normalize_discipline, normalize_discipline_or_default


def _canonical_discipline(value: Optional[str]) -> Tuple[Optional[str], bool]:
    """Return (canonical_value, changed). None means leave field unchanged."""
    if value is None or not str(value).strip():
        return None, False

    raw = str(value).strip()
    if raw.lower() in DISCIPLINE_LIST:
        return raw.lower(), raw.lower() != raw

    normalized = normalize_discipline(raw)
    if normalized:
        return normalized, normalized != raw

    fallback = normalize_discipline_or_default(raw)
    return fallback, fallback != raw


def _is_pm_import_program_task(task: Dict[str, Any]) -> bool:
    if task.get("task_source") == "customer_imported":
        return True
    if str(task.get("id") or "").startswith("pm-import:"):
        return True
    trace = task.get("traceability") or {}
    return bool(trace.get("pm_import_task_id") or trace.get("import_session_id"))


async def normalize_pm_import_disciplines_backfill(
    db,
    *,
    dry_run: bool = True,
) -> Dict[str, Any]:
    from services.pm_import_constants import normalize_pm_import_discipline
    from services.tenant_scope import scoped_job

    stats: Dict[str, Any] = {
        "dry_run": dry_run,
        "sessions_scanned": 0,
        "sessions_updated": 0,
        "session_tasks_updated": 0,
        "programs_scanned": 0,
        "programs_updated": 0,
        "program_tasks_updated": 0,
        "failure_modes_scanned": 0,
        "failure_modes_updated": 0,
        "samples": [],
    }

    def _sample(kind: str, doc_id: str, field: str, old: str, new: str) -> None:
        if len(stats["samples"]) >= 20:
            return
        stats["samples"].append(
            {"kind": kind, "id": doc_id, "field": field, "from": old, "to": new}
        )

    async for session in db.pm_import_sessions.find(scoped_job(), {"session_id": 1, "tasks_extracted": 1}):
        stats["sessions_scanned"] += 1
        tasks = session.get("tasks_extracted") or []
        session_changed = False
        for task in tasks:
            old = task.get("discipline")
            new = normalize_pm_import_discipline(old)
            if old != new:
                session_changed = True
                stats["session_tasks_updated"] += 1
                _sample("pm_import_session", session.get("session_id", ""), "discipline", old, new)
                if not dry_run:
                    task["discipline"] = new
        if session_changed:
            stats["sessions_updated"] += 1
            if not dry_run:
                await db.pm_import_sessions.update_one(
                    scoped_job({"session_id": session["session_id"]}),
                    {"$set": {"tasks_extracted": tasks}},
                )

    async for program in db.maintenance_programs_v2.find(
        scoped_job(),
        {"equipment_id": 1, "tasks": 1},
    ):
        stats["programs_scanned"] += 1
        tasks = program.get("tasks") or []
        program_changed = False
        for task in tasks:
            if not _is_pm_import_program_task(task):
                continue
            old = task.get("discipline")
            new = normalize_pm_import_discipline(old)
            if old != new:
                program_changed = True
                stats["program_tasks_updated"] += 1
                _sample(
                    "maintenance_program_v2",
                    program.get("equipment_id", ""),
                    "discipline",
                    old,
                    new,
                )
                if not dry_run:
                    task["discipline"] = new
        if program_changed:
            stats["programs_updated"] += 1
            if not dry_run:
                await db.maintenance_programs_v2.update_one(
                    scoped_job({"equipment_id": program["equipment_id"]}),
                    {"$set": {"tasks": tasks}},
                )

    async for fm in db.failure_modes.find(
        scoped_job(),
        {"id": 1, "source": 1, "category": 1, "recommended_actions": 1},
    ):
        stats["failure_modes_scanned"] += 1
        is_pm = (fm.get("source") or "").lower() == "pm_import"
        updates: Dict[str, Any] = {}
        actions = fm.get("recommended_actions") or []
        new_actions: List[Any] = []
        actions_changed = False

        for action in actions:
            if not isinstance(action, dict):
                new_actions.append(action)
                continue
            old = action.get("discipline")
            canonical, changed = _canonical_discipline(old)
            if changed and canonical:
                actions_changed = True
                action = {**action, "discipline": canonical}
                if is_pm:
                    _sample("failure_mode_action", fm.get("id", ""), "discipline", old, canonical)
            new_actions.append(action)

        if actions_changed:
            updates["recommended_actions"] = new_actions

        if is_pm:
            old_cat = fm.get("category")
            canonical_cat, cat_changed = _canonical_discipline(old_cat)
            if cat_changed and canonical_cat:
                updates["category"] = canonical_cat
                _sample("failure_mode", fm.get("id", ""), "category", old_cat, canonical_cat)

        if updates:
            stats["failure_modes_updated"] += 1
            if not dry_run:
                await db.failure_modes.update_one(scoped_job({"id": fm["id"]}), {"$set": updates})

    return stats
