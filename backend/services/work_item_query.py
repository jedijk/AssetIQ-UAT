"""
Unified work-item reads for My Tasks and scheduler views.

Merges ``task_instances``, unbridged ``scheduled_tasks`` (maintenance v2 gap
between bridge runs), and open ``central_actions`` into one coherent list shape.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId

from database import db
from services.db_monitoring import timed_find
from utils.mongo_regex import case_insensitive_contains
from services.task_instance_bridge import (
    STATUS_MAP,
    _build_default_assignees,
    _build_program_discipline_map,
    _resolve_discipline,
)

logger = logging.getLogger(__name__)

# How far ahead to include unbridged maintenance in My Tasks.
MAINTENANCE_HORIZON_DAYS = 14
MAX_UNBRIDGED_ITEMS = 50


def _parse_due_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (TypeError, ValueError):
        return None


def _safe_iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def serialize_scheduled_task_as_work_item(
    scheduled_task: dict,
    *,
    canonical_discipline: Optional[str] = None,
    assigned_user_id: Optional[str] = None,
    assignee: Optional[str] = None,
) -> dict:
    """Shape a scheduled_task into the My Tasks list item format."""
    sched_id = scheduled_task.get("id") or ""
    due_dt = _parse_due_date(scheduled_task.get("due_date"))
    raw_status = scheduled_task.get("status", "scheduled")
    mapped_status = STATUS_MAP.get(raw_status, "pending")
    if due_dt and due_dt < datetime.now(timezone.utc) and mapped_status == "pending":
        mapped_status = "overdue"

    return {
        "id": f"sched:{sched_id}",
        "scheduled_task_id": sched_id,
        "title": scheduled_task.get("task_name") or "Maintenance task",
        "description": scheduled_task.get("task_description") or "",
        "status": mapped_status,
        "priority": scheduled_task.get("priority") or "medium",
        "due_date": _safe_iso(due_dt),
        "scheduled_date": _safe_iso(due_dt),
        "equipment_id": scheduled_task.get("equipment_id"),
        "equipment_name": scheduled_task.get("equipment_name") or "",
        "asset": scheduled_task.get("equipment_name") or "",
        "equipment_tag": scheduled_task.get("equipment_tag"),
        "mitigation_strategy": canonical_discipline or scheduled_task.get("discipline") or "maintenance",
        "type": canonical_discipline or scheduled_task.get("discipline") or "maintenance",
        "discipline": canonical_discipline or scheduled_task.get("discipline") or "",
        "is_recurring": False,
        "frequency": "",
        "source": "maintenance",
        "source_type": "scheduled_task",
        "assigned_user_id": assigned_user_id,
        "assigned_team": "",
        "assignee": assignee or "",
        "last_completed": None,
        "form_fields": [],
        "form_template_name": "",
        "form_documents": [],
        "template": {},
        "estimated_duration_minutes": scheduled_task.get("estimated_duration_minutes"),
        "can_quick_complete": True,
        "action_type": None,
        "risk_score": None,
        "rpn": None,
        "is_unbridged_maintenance": True,
    }


def _user_can_see_item(
    assigned_user_id: Optional[str],
    user_id: str,
) -> bool:
    """Match My Tasks visibility: assigned to user or unassigned."""
    if not assigned_user_id:
        return True
    return assigned_user_id == user_id


def _build_scheduled_task_query(
    *,
    filter_name: str,
    now: datetime,
    today_start: datetime,
    today_end: datetime,
    equipment_id: Optional[str],
) -> Optional[dict]:
    """Return a Mongo query for scheduled_tasks, or None when filter excludes maintenance."""
    if filter_name in ("recurring", "adhoc"):
        return None

    horizon_end = (now + timedelta(days=MAINTENANCE_HORIZON_DAYS)).date().isoformat()
    today_iso = today_start.date().isoformat()

    query: dict = {
        "status": {"$nin": ["completed", "cancelled"]},
    }

    if filter_name == "overdue":
        query["due_date"] = {"$lt": today_iso}
    elif filter_name == "today":
        query["due_date"] = {"$gte": today_iso, "$lt": today_end.date().isoformat()}
    else:
        # open / all / default
        query["due_date"] = {"$lte": horizon_end}

    if equipment_id:
        query["equipment_id"] = equipment_id

    return query


async def fetch_unbridged_maintenance_work_items(
    user_id: str,
    *,
    filter_name: str = "open",
    equipment_id: Optional[str] = None,
    discipline: Optional[str] = None,
    now: Optional[datetime] = None,
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

    cursor = await timed_find(db.scheduled_tasks, query, {"_id": 0})
    candidate_tasks = await cursor.sort("due_date", 1).to_list(MAX_UNBRIDGED_ITEMS * 2)

    if not candidate_tasks:
        return []

    candidate_ids = [t.get("id") for t in candidate_tasks if t.get("id")]
    existing_set: set = set()
    if candidate_ids:
        existing_cursor = await timed_find(
            db.task_instances,
            {"scheduled_task_id": {"$in": candidate_ids}},
            {"_id": 0, "scheduled_task_id": 1},
        )
        existing = await existing_cursor.to_list(len(candidate_ids))
        existing_set = {e["scheduled_task_id"] for e in existing if e.get("scheduled_task_id")}

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
        if len(items) >= MAX_UNBRIDGED_ITEMS:
            break

    return items


def safe_isoformat(value: Any) -> Optional[str]:
    """Safely convert a datetime or string to ISO format string."""
    return _safe_iso(value)


def serialize_task(task: dict) -> dict:
    """Serialize a task instance for API response."""
    if not task:
        return None

    title = task.get("title") or task.get("task_template_name") or "Untitled Task"

    return {
        "id": str(task.get("_id", "")),
        "title": title,
        "description": task.get("description", ""),
        "status": task.get("status", "scheduled"),
        "priority": task.get("priority", "medium"),
        "due_date": safe_isoformat(task.get("due_date")),
        "scheduled_date": safe_isoformat(task.get("scheduled_date")),
        "equipment_id": str(task.get("equipment_id", "")) if task.get("equipment_id") else None,
        "equipment_name": task.get("equipment_name", ""),
        "asset": task.get("equipment_name", ""),
        "mitigation_strategy": task.get("mitigation_strategy") or task.get("discipline", ""),
        "type": task.get("mitigation_strategy") or task.get("discipline", ""),
        "discipline": task.get("discipline", ""),
        "is_recurring": task.get("is_recurring", False),
        "frequency": task.get("frequency_display", ""),
        "source": task.get("source", "manual"),
        "source_type": task.get("source_type", "task"),
        "assigned_user_id": str(task.get("assigned_user_id", "")) if task.get("assigned_user_id") else None,
        "assigned_team": task.get("assigned_team", ""),
        "assignee": task.get("assignee", ""),
        "last_completed": safe_isoformat(task.get("last_completed")),
        "form_fields": task.get("form_fields", []),
        "form_template_name": task.get("form_template_name", ""),
        "form_documents": task.get("form_documents", []),
        "template": task.get("template", {}),
        "estimated_duration_minutes": task.get("estimated_duration_minutes"),
        "can_quick_complete": not task.get("form_fields") and not task.get("template", {}).get("form_fields"),
        "action_type": task.get("action_type"),
        "risk_score": task.get("risk_score"),
        "rpn": task.get("rpn"),
        "equipment_tag": task.get("equipment_tag"),
        "photo_extraction_config": task.get("photo_extraction_config"),
        "scheduled_task_id": task.get("scheduled_task_id"),
        "is_unbridged_maintenance": False,
    }


def serialize_action_as_task(action: dict) -> dict:
    """Serialize a central action as a task item for the My Tasks list."""
    if not action:
        return None

    due_date = action.get("due_date")
    if due_date and isinstance(due_date, str):
        try:
            due_date = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            due_date = None

    status_map = {
        "open": "planned",
        "in_progress": "in_progress",
        "completed": "completed",
    }

    return {
        "id": action.get("id", ""),
        "title": action.get("title", "Untitled Action"),
        "description": action.get("description", ""),
        "status": status_map.get(action.get("status", "open"), "planned"),
        "priority": action.get("priority", "medium"),
        "due_date": due_date.isoformat() if due_date else None,
        "scheduled_date": None,
        "equipment_id": None,
        "equipment_name": action.get("source_name", ""),
        "asset": action.get("source_name", ""),
        "mitigation_strategy": action.get("action_type", "corrective"),
        "type": action.get("action_type", "corrective"),
        "discipline": action.get("discipline", ""),
        "is_recurring": False,
        "frequency": "",
        "source": action.get("source_type", "observation"),
        "source_type": "action",
        "source_id": action.get("source_id", ""),
        "assigned_user_id": None,
        "assigned_team": "",
        "assignee": action.get("assignee", ""),
        "last_completed": None,
        "form_fields": [],
        "form_documents": action.get("form_documents", []),
        "template": {},
        "estimated_duration_minutes": None,
        "can_quick_complete": True,
        "action_type": action.get("action_type"),
        "comments": action.get("comments", ""),
        "risk_score": action.get("threat_risk_score") or action.get("risk_score"),
        "rpn": action.get("threat_rpn") or action.get("rpn"),
        "equipment_tag": action.get("equipment_tag"),
        "is_unbridged_maintenance": False,
    }


def work_item_sort_key(item: dict, now: datetime) -> tuple:
    """Sort combined work items: risk → status → priority → due date."""
    risk_score = item.get("risk_score") or 0
    risk_val = -risk_score
    rpn = item.get("rpn") or 0
    rpn_val = -rpn

    status_order = {"overdue": 0, "in_progress": 1, "planned": 2, "scheduled": 2, "pending": 2}
    status_val = status_order.get(item.get("status", "planned"), 2)

    priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    priority_val = priority_order.get(item.get("priority", "medium"), 2)

    due_date = item.get("due_date")
    if due_date:
        try:
            due_dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
            if due_dt < now:
                status_val = 0
            due_val = due_dt.timestamp()
        except (ValueError, TypeError):
            due_val = float("inf")
    else:
        due_val = float("inf")

    return (risk_val, rpn_val, status_val, priority_val, due_val)


async def fetch_work_items(
    user_id: str,
    *,
    filter_name: str = "open",
    date: Optional[str] = None,
    equipment_id: Optional[str] = None,
    status: Optional[str] = None,
    discipline: Optional[str] = None,
    now: Optional[datetime] = None,
) -> List[dict]:
    """
    Unified read: task_instances + unbridged scheduled_tasks + central_actions.

    ``filter_name``: open | overdue | recurring | adhoc | today | all
    """
    now = now or datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    user_id_query = []
    try:
        user_id_query.append({"assigned_user_id": ObjectId(user_id)})
    except Exception:
        user_id_query.append({"assigned_user_id": user_id})
    user_id_query.extend([
        {"assigned_user_id": None},
        {"assigned_user_id": {"$exists": False}},
    ])

    query: dict = {
        "$or": user_id_query,
        "status": {"$nin": ["completed", "cancelled"]},
    }

    if discipline:
        discipline_match = case_insensitive_contains(discipline)
        if discipline_match:
            query["discipline"] = discipline_match

    if filter_name == "open":
        query["status"] = {"$in": ["pending", "in_progress"]}
        if date:
            try:
                filter_date = datetime.fromisoformat(date)
                day_start = filter_date.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc)
                day_end = day_start + timedelta(days=1)
                query["due_date"] = {"$gte": day_start, "$lt": day_end}
            except ValueError:
                pass
    elif filter_name == "overdue":
        query["$or"] = [
            {"status": "overdue"},
            {"due_date": {"$lt": today_start}, "status": {"$nin": ["completed", "cancelled"]}},
        ]
    elif filter_name == "recurring":
        query["task_plan_id"] = {"$exists": True, "$nin": [None, ""]}
        if "status" not in query:
            query["status"] = {"$nin": ["completed", "cancelled"]}
    elif filter_name == "adhoc":
        query["$or"] = [
            {"task_plan_id": None},
            {"task_plan_id": {"$exists": False}},
            {"source": "manual"},
        ]

    if equipment_id:
        try:
            query["equipment_id"] = ObjectId(equipment_id)
        except Exception:
            query["equipment_id"] = equipment_id

    if status:
        query["status"] = status

    tasks_cursor = await timed_find(db.task_instances, query)
    tasks_cursor = tasks_cursor.sort([
        ("status", 1),
        ("priority", 1),
        ("due_date", 1),
    ]).limit(100)
    raw_tasks = await tasks_cursor.to_list(length=100)

    equipment_ids = set()
    plan_ids_oid = set()
    for task in raw_tasks:
        if task.get("equipment_id"):
            equipment_ids.add(task["equipment_id"])
        task_plan_id = task.get("task_plan_id")
        if task_plan_id:
            if isinstance(task_plan_id, str):
                try:
                    plan_ids_oid.add(ObjectId(task_plan_id))
                except Exception:
                    pass
            else:
                plan_ids_oid.add(task_plan_id)

    equipment_map: Dict[Any, Any] = {}
    if equipment_ids:
        equip_nodes_cursor = db.equipment_nodes.find(
            {"id": {"$in": list(equipment_ids)}},
            {"_id": 0, "id": 1, "name": 1, "tag": 1},
        )
        async for eq in equip_nodes_cursor:
            equipment_map[eq["id"]] = {"name": eq.get("name", "Unknown"), "tag": eq.get("tag")}

        missing_ids = [eid for eid in equipment_ids if eid not in equipment_map]
        if missing_ids:
            oid_list = []
            for eid in missing_ids:
                try:
                    oid_list.append(ObjectId(eid))
                except Exception:
                    pass
            if oid_list:
                legacy_cursor = db.equipment.find(
                    {"_id": {"$in": oid_list}},
                    {"_id": 1, "name": 1, "tag": 1},
                )
                async for eq in legacy_cursor:
                    equipment_map[str(eq["_id"])] = {"name": eq.get("name", "Unknown"), "tag": eq.get("tag")}

    plan_map: Dict[str, dict] = {}
    if plan_ids_oid:
        plans_cursor = db.task_plans.find({"_id": {"$in": list(plan_ids_oid)}})
        async for plan in plans_cursor:
            plan_map[str(plan["_id"])] = plan

    template_ids_oid = set()
    for plan in plan_map.values():
        if plan.get("task_template_id"):
            try:
                template_ids_oid.add(ObjectId(str(plan["task_template_id"])))
            except Exception:
                pass
    for task in raw_tasks:
        if task.get("task_template_id"):
            try:
                template_ids_oid.add(ObjectId(str(task["task_template_id"])))
            except Exception:
                pass

    template_map: Dict[str, dict] = {}
    if template_ids_oid:
        templates_cursor = db.task_templates.find({"_id": {"$in": list(template_ids_oid)}})
        async for tmpl in templates_cursor:
            template_map[str(tmpl["_id"])] = tmpl

    form_template_ids = set()
    for plan in plan_map.values():
        if plan.get("form_template_id"):
            form_template_ids.add(str(plan["form_template_id"]))
    for tmpl in template_map.values():
        if tmpl.get("form_template_id"):
            form_template_ids.add(str(tmpl["form_template_id"]))
    for task in raw_tasks:
        if task.get("form_template_id"):
            form_template_ids.add(str(task["form_template_id"]))

    form_template_map: Dict[str, dict] = {}
    if form_template_ids:
        form_ids_oid = []
        for fid in form_template_ids:
            try:
                form_ids_oid.append(ObjectId(fid))
            except Exception:
                pass
        if form_ids_oid:
            form_cursor = db.form_templates.find({"_id": {"$in": form_ids_oid}})
            async for ft in form_cursor:
                form_template_map[str(ft["_id"])] = ft

    items: List[dict] = []
    for task in raw_tasks:
        if task.get("equipment_id"):
            eid = str(task["equipment_id"])
            eq_data = equipment_map.get(eid, {})
            if isinstance(eq_data, dict):
                if not task.get("equipment_name"):
                    task["equipment_name"] = eq_data.get("name", "Unknown")
                if not task.get("equipment_tag"):
                    task["equipment_tag"] = eq_data.get("tag")
            elif not task.get("equipment_name"):
                task["equipment_name"] = eq_data

        task_plan_id = task.get("task_plan_id")
        plan = None
        template = None
        form_template_id = task.get("form_template_id")

        if task_plan_id:
            plan_key = str(task_plan_id) if isinstance(task_plan_id, ObjectId) else task_plan_id
            plan = plan_map.get(plan_key)

            if filter_name == "recurring" and not plan:
                continue

            if plan:
                task["is_recurring"] = True
                interval = plan.get("interval_value", 0)
                unit = plan.get("interval_unit", "days")
                task["frequency_display"] = f"Every {interval} {unit}"

                if plan.get("task_template_id"):
                    template = template_map.get(str(plan["task_template_id"]))
                    if template:
                        if not task.get("title"):
                            task["title"] = template.get("name", "")
                        task["task_template_name"] = template.get("name", "")
                        task["template"] = {
                            "name": template.get("name"),
                            "mitigation_strategy": template.get("mitigation_strategy"),
                            "procedure_steps": template.get("procedure_steps", []),
                        }
                        task["mitigation_strategy"] = template.get("mitigation_strategy", "")

                if not form_template_id:
                    form_template_id = plan.get("form_template_id")
                    if not form_template_id and template:
                        form_template_id = template.get("form_template_id")

        if not form_template_id:
            task_template_id = task.get("task_template_id")
            if task_template_id:
                if not template:
                    template = template_map.get(str(task_template_id))
                if template:
                    task["task_template_name"] = template.get("name", "")
                    form_template_id = template.get("form_template_id")

        if form_template_id:
            form_template = form_template_map.get(str(form_template_id))
            if form_template:
                task["form_fields"] = form_template.get("fields", [])
                task["form_template_name"] = form_template.get("name", "")
                task["form_documents"] = form_template.get("documents", [])
                task["photo_extraction_config"] = form_template.get("photo_extraction_config")
                task["label_print_config"] = form_template.get("label_print_config")
                task["has_form"] = True

        if task.get("created_from_observation"):
            task["source"] = "observation"
        elif task.get("created_from_fmea"):
            task["source"] = "fmea"
        elif task.get("is_recurring") or task.get("task_plan_id"):
            task["source"] = "recurring"
        else:
            task["source"] = "manual"

        task["source_type"] = "task"
        items.append(serialize_task(task))

    if filter_name not in ("recurring", "adhoc"):
        try:
            maintenance_items = await fetch_unbridged_maintenance_work_items(
                user_id,
                filter_name=filter_name,
                equipment_id=equipment_id,
                discipline=discipline,
                now=now,
            )
            existing_ids = {t.get("scheduled_task_id") for t in items if t.get("scheduled_task_id")}
            for item in maintenance_items:
                sid = item.get("scheduled_task_id")
                if sid and sid in existing_ids:
                    continue
                items.append(item)
        except Exception as exc:
            logger.warning("unbridged maintenance work items skipped: %s", exc)

    if filter_name != "recurring":
        action_query: dict = {
            "created_by": user_id,
            "status": {"$in": ["open", "in_progress"]},
        }
        if discipline:
            discipline_match = case_insensitive_contains(discipline)
            if discipline_match:
                action_query["discipline"] = discipline_match

        if filter_name == "today":
            today_str = today_start.isoformat()
            tomorrow_str = today_end.isoformat()
            action_query["$or"] = [
                {"due_date": {"$gte": today_str, "$lt": tomorrow_str}},
                {"due_date": None},
                {"due_date": ""},
            ]
        elif filter_name == "overdue":
            now_str = now.isoformat()
            action_query["$and"] = [
                {"due_date": {"$lt": now_str}},
                {"due_date": {"$ne": None}},
                {"due_date": {"$ne": ""}},
            ]

        raw_actions = await db.central_actions.find(action_query, {"_id": 0}).to_list(length=100)

        threat_source_ids = set()
        investigation_source_ids = set()
        for a in raw_actions:
            sid = a.get("source_id")
            if not sid:
                continue
            if a.get("threat_id"):
                threat_source_ids.add(a["threat_id"])
            elif a.get("source_type") == "investigation":
                investigation_source_ids.add(sid)
            else:
                threat_source_ids.add(sid)

        inv_threat_map: Dict[str, str] = {}
        if investigation_source_ids:
            inv_cursor = db.investigations.find(
                {"id": {"$in": list(investigation_source_ids)}},
                {"_id": 0, "id": 1, "threat_id": 1},
            )
            async for inv in inv_cursor:
                if inv.get("threat_id"):
                    inv_threat_map[inv["id"]] = inv["threat_id"]
                    threat_source_ids.add(inv["threat_id"])

        threat_map: Dict[str, dict] = {}
        threat_equipment_ids = set()
        if threat_source_ids:
            threats_cursor = db.threats.find(
                {"id": {"$in": list(threat_source_ids)}},
                {"_id": 0, "id": 1, "fmea_rpn": 1, "risk_score": 1, "risk_level": 1, "linked_equipment_id": 1},
            )
            async for threat in threats_cursor:
                threat_map[threat["id"]] = threat
                if threat.get("linked_equipment_id"):
                    threat_equipment_ids.add(threat["linked_equipment_id"])

        action_equip_tag_map: Dict[str, str] = {}
        if threat_equipment_ids:
            equip_cursor = db.equipment_nodes.find(
                {"id": {"$in": list(threat_equipment_ids)}},
                {"_id": 0, "id": 1, "tag": 1},
            )
            async for eq in equip_cursor:
                if eq.get("tag"):
                    action_equip_tag_map[eq["id"]] = eq["tag"]

        for action in raw_actions:
            threat = None
            if action.get("threat_id"):
                threat = threat_map.get(action["threat_id"])
            elif action.get("source_type") == "investigation" and action.get("source_id"):
                inv_threat_id = inv_threat_map.get(action["source_id"])
                if inv_threat_id:
                    threat = threat_map.get(inv_threat_id)
            elif action.get("source_id"):
                threat = threat_map.get(action["source_id"])

            if threat:
                action["threat_rpn"] = threat.get("fmea_rpn")
                action["threat_risk_score"] = threat.get("risk_score")
                equip_id = threat.get("linked_equipment_id")
                if equip_id:
                    action["equipment_tag"] = action_equip_tag_map.get(equip_id)
            items.append(serialize_action_as_task(action))

    items.sort(key=lambda item: work_item_sort_key(item, now))
    return items
