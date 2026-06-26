"""
Unified work-item reads for My Tasks and scheduler views.

Merges ``task_instances``, unbridged ``scheduled_tasks`` (maintenance v2 gap
between bridge runs), and open ``central_actions`` into one coherent list shape.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId

from database import db
from services.db_monitoring import timed_find
from services.scheduler_job import get_task_generation_config
from services.tenant_schema import merge_tenant_filter
from services.work_execution_config import work_items_source_mode
from services.work_item_filters import (
    MAX_ACTION_ITEMS,
    MAX_TASK_INSTANCES,
    _resolve_linked_signal_id,
    should_exclude_pm_import_from_my_tasks,
)
from services.work_item_serializers import (
    _merge_work_items_prefer_instances,
    safe_isoformat,
    serialize_action_as_task,
    serialize_task,
    work_item_sort_key,
)
from services.work_item_unbridged import _maybe_fetch_unbridged
from services.work_signal_projection import project_list_item
from utils.mongo_regex import case_insensitive_contains

logger = logging.getLogger(__name__)

# Re-exports for routes and tests
from services.work_item_filters import (  # noqa: E402
    MAINTENANCE_HORIZON_DAYS,
    MAX_UNBRIDGED_ITEMS,
    _build_scheduled_task_query,
    _user_can_see_item,
    should_exclude_pm_import_overdue_from_my_tasks,
    should_exclude_unbridged_scheduled_task_from_my_tasks,
)
from services.work_item_serializers import (  # noqa: E402
    _work_item_dedupe_key,
    serialize_scheduled_task_as_work_item,
)
from services.work_item_unbridged import fetch_unbridged_maintenance_work_items  # noqa: E402


async def fetch_work_items(
    user_id: str,
    *,
    filter_name: str = "open",
    date: Optional[str] = None,
    equipment_id: Optional[str] = None,
    status: Optional[str] = None,
    discipline: Optional[str] = None,
    now: Optional[datetime] = None,
    user: Optional[dict] = None,
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

    try:
        gen_cfg = await get_task_generation_config()
        if not gen_cfg.get("enabled", True):
            existing_source = query.get("source")
            block = {"$ne": "maintenance"}
            if existing_source is None:
                query["source"] = block
            elif isinstance(existing_source, dict):
                existing_source["$ne"] = "maintenance"
    except Exception as exc:
        logger.warning("task_generation config lookup skipped: %s", exc)

    query = merge_tenant_filter(query, user)

    tasks_cursor = await timed_find(db.task_instances, query)
    tasks_cursor = tasks_cursor.sort([
        ("status", 1),
        ("priority", 1),
        ("due_date", 1),
    ]).limit(MAX_TASK_INSTANCES)
    raw_tasks = await tasks_cursor.to_list(length=MAX_TASK_INSTANCES)

    maintenance_task = None
    include_unbridged = (
        work_items_source_mode() != "v2_instances"
        and filter_name not in ("recurring", "adhoc")
    )
    if include_unbridged:
        maintenance_task = asyncio.create_task(
            _maybe_fetch_unbridged(
                user_id,
                filter_name=filter_name,
                equipment_id=equipment_id,
                discipline=discipline,
                now=now,
                user=user,
            )
        )

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

    async def _load_equipment_nodes() -> Dict[Any, Any]:
        equip_map: Dict[Any, Any] = {}
        if not equipment_ids:
            return equip_map
        cursor = await timed_find(
            db.equipment_nodes,
            merge_tenant_filter({"id": {"$in": list(equipment_ids)}}, user),
            {"_id": 0, "id": 1, "name": 1, "tag": 1},
        )
        for eq in await cursor.to_list(len(equipment_ids)):
            equip_map[eq["id"]] = {"name": eq.get("name", "Unknown"), "tag": eq.get("tag")}
        return equip_map

    async def _load_task_plans() -> Dict[str, dict]:
        plan_map_local: Dict[str, dict] = {}
        if not plan_ids_oid:
            return plan_map_local
        cursor = await timed_find(
            db.task_plans,
            merge_tenant_filter({"_id": {"$in": list(plan_ids_oid)}}, user),
        )
        for plan in await cursor.to_list(len(plan_ids_oid)):
            plan_map_local[str(plan["_id"])] = plan
        return plan_map_local

    equipment_map, plan_map = await asyncio.gather(_load_equipment_nodes(), _load_task_plans())

    missing_ids = [eid for eid in equipment_ids if eid not in equipment_map]
    if missing_ids:
        oid_list = []
        for eid in missing_ids:
            try:
                oid_list.append(ObjectId(eid))
            except Exception:
                pass
        if oid_list:
            legacy_cursor = await timed_find(
                db.equipment,
                {"_id": {"$in": oid_list}},
                {"_id": 1, "name": 1, "tag": 1},
            )
            for eq in await legacy_cursor.to_list(len(oid_list)):
                equipment_map[str(eq["_id"])] = {"name": eq.get("name", "Unknown"), "tag": eq.get("tag")}

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
        templates_cursor = await timed_find(
            db.task_templates,
            {"_id": {"$in": list(template_ids_oid)}},
        )
        for tmpl in await templates_cursor.to_list(len(template_ids_oid)):
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
            form_cursor = await timed_find(
                db.form_templates,
                merge_tenant_filter({"_id": {"$in": form_ids_oid}}, user),
            )
            for ft in await form_cursor.to_list(len(form_ids_oid)):
                form_template_map[str(ft["_id"])] = ft

    linked_signal_ids = {
        sid for task in raw_tasks if (sid := _resolve_linked_signal_id(task))
    }
    task_signal_map: Dict[str, dict] = {}
    if linked_signal_ids:
        sig_cursor = await timed_find(
            db.threats,
            merge_tenant_filter({"id": {"$in": list(linked_signal_ids)}}, user),
            {"_id": 0},
        )
        for threat in await sig_cursor.to_list(len(linked_signal_ids)):
            if threat.get("id"):
                task_signal_map[threat["id"]] = threat

    items: List[dict] = []
    for task in raw_tasks:
        if should_exclude_pm_import_from_my_tasks(task_instance=task):
            continue
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

        signal_id = _resolve_linked_signal_id(task)
        if signal_id and signal_id in task_signal_map:
            task["work_signal"] = project_list_item(task_signal_map[signal_id])

        items.append(serialize_task(task))

    if maintenance_task is not None:
        try:
            maintenance_items = await maintenance_task
            items = _merge_work_items_prefer_instances(items, maintenance_items)
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

        raw_actions = await db.central_actions.find(
            merge_tenant_filter(action_query, user),
            {"_id": 0},
        ).to_list(length=MAX_ACTION_ITEMS)

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
            inv_cursor = await timed_find(
                db.investigations,
                merge_tenant_filter({"id": {"$in": list(investigation_source_ids)}}, user),
                {"_id": 0, "id": 1, "threat_id": 1},
            )
            for inv in await inv_cursor.to_list(len(investigation_source_ids)):
                if inv.get("threat_id"):
                    inv_threat_map[inv["id"]] = inv["threat_id"]
                    threat_source_ids.add(inv["threat_id"])

        threat_map: Dict[str, dict] = {}
        threat_equipment_ids = set()

        async def _load_threats() -> Dict[str, dict]:
            result: Dict[str, dict] = {}
            if not threat_source_ids:
                return result
            threats_cursor = await timed_find(
                db.threats,
                merge_tenant_filter({"id": {"$in": list(threat_source_ids)}}, user),
                {"_id": 0, "id": 1, "fmea_rpn": 1, "risk_score": 1, "risk_level": 1, "linked_equipment_id": 1},
            )
            for threat in await threats_cursor.to_list(len(threat_source_ids)):
                result[threat["id"]] = threat
            return result

        threat_map = await _load_threats()
        for threat in threat_map.values():
            if threat.get("linked_equipment_id"):
                threat_equipment_ids.add(threat["linked_equipment_id"])

        action_equip_tag_map: Dict[str, str] = {}
        if threat_equipment_ids:
            equip_cursor = await timed_find(
                db.equipment_nodes,
                merge_tenant_filter({"id": {"$in": list(threat_equipment_ids)}}, user),
                {"_id": 0, "id": 1, "tag": 1},
            )
            for eq in await equip_cursor.to_list(len(threat_equipment_ids)):
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
