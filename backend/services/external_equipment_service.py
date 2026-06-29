"""External Equipment read API — hierarchy and detail serializers."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from database import db
from services.tenant_scope import scoped

OPEN_THREAT_STATUSES = ["Open", "open", "In Progress", "in_progress", "active"]
OPEN_OBS_STATUSES = ["open", "observation", "in_progress", "in progress", "active"]
CLOSED_TASK_STATUSES = ["completed", "cancelled"]
OPEN_INSTANCE_STATUSES = ["open", "pending", "overdue", "in_progress", "scheduled", "assigned"]


def build_equipment_path(node: dict, node_lookup: Dict[str, dict]) -> str:
    """Generate full path from root to node (same pattern as equipment_nodes_service)."""
    if not isinstance(node, dict):
        return ""
    path_parts = [node.get("name") or ""]
    current = node
    visited: set[str] = set()
    while isinstance(current, dict) and current.get("parent_id"):
        parent_id = current["parent_id"]
        if parent_id in visited or parent_id not in node_lookup:
            break
        visited.add(parent_id)
        current = node_lookup[parent_id]
        if isinstance(current, dict):
            path_parts.insert(0, current.get("name") or "")
        else:
            break
    return " > ".join(p for p in path_parts if p)


def depth_from_installation(
    node: dict,
    installation_id: str,
    node_lookup: Dict[str, dict],
) -> int:
    depth = 0
    current = node
    visited: set[str] = set()
    while current.get("id") != installation_id:
        parent_id = current.get("parent_id")
        if not parent_id or parent_id in visited or parent_id not in node_lookup:
            break
        visited.add(parent_id)
        depth += 1
        current = node_lookup[parent_id]
    return depth


def serialize_criticality(crit: Optional[dict]) -> Dict[str, Any]:
    if not isinstance(crit, dict):
        return {
            "rating": None,
            "classification": None,
            "safety_impact": None,
            "production_impact": None,
            "environmental_impact": None,
            "reputation_impact": None,
            "total_score": 0,
        }
    safety = crit.get("safety_impact", crit.get("safety"))
    production = crit.get("production_impact", crit.get("production"))
    environmental = crit.get("environmental_impact", crit.get("environmental"))
    reputation = crit.get("reputation_impact", crit.get("reputation"))
    scores = [s for s in (safety, production, environmental, reputation) if isinstance(s, (int, float))]
    total = sum(scores) if scores else 0
    return {
        "rating": crit.get("rating") or crit.get("profile_id"),
        "classification": crit.get("classification"),
        "safety_impact": safety,
        "production_impact": production,
        "environmental_impact": environmental,
        "reputation_impact": reputation,
        "total_score": total,
        "business_critical": bool(crit.get("business_critical")),
        "safety_critical": bool(crit.get("safety_critical") or (isinstance(safety, (int, float)) and safety >= 4)),
        "environmental_critical": bool(
            crit.get("environmental_critical") or (isinstance(environmental, (int, float)) and environmental >= 4)
        ),
    }


def _default_operational_summary() -> Dict[str, Any]:
    return {
        "open_observation_count": 0,
        "open_planned_task_count": 0,
        "active_maintenance_program": False,
        "last_observation_date": None,
    }


def serialize_metadata(node: dict) -> Dict[str, Any]:
    return {
        "tags": node.get("tags") or [],
        "custom_fields": node.get("custom_fields") or {},
        "external_mappings": node.get("external_mappings") or {},
        "external_references": node.get("external_references") or {},
        "created_at": node.get("created_at"),
        "updated_at": node.get("updated_at"),
        "discipline": node.get("discipline"),
        "equipment_type_id": node.get("equipment_type_id"),
        "process_step": node.get("process_step"),
        "description": node.get("description"),
        "manufacturer": node.get("manufacturer"),
        "model": node.get("model"),
        "serial_number": node.get("serial_number"),
        "commission_date": node.get("commission_date"),
    }


def serialize_identification(node: dict) -> Dict[str, Any]:
    is_active = node.get("is_active")
    if is_active is False:
        status = "inactive"
    else:
        status = node.get("status") or "active"
    return {
        "id": node.get("id"),
        "name": node.get("name"),
        "tag": node.get("tag"),
        "level": node.get("level"),
        "parent_id": node.get("parent_id"),
        "installation_id": node.get("installation_id"),
        "equipment_type_id": node.get("equipment_type_id"),
        "discipline": node.get("discipline"),
        "description": node.get("description"),
        "status": status,
    }


def serialize_equipment_object(
    node: dict,
    *,
    equipment_path: str,
    depth: int,
    operational_summary: Optional[dict] = None,
    include_metadata: bool = True,
    children: Optional[List[dict]] = None,
    maintenance_summary: Optional[dict] = None,
) -> Dict[str, Any]:
    obj: Dict[str, Any] = {
        **serialize_identification(node),
        "equipment_path": equipment_path,
        "depth": depth,
        "criticality": serialize_criticality(node.get("criticality")),
        "operational_summary": operational_summary or _default_operational_summary(),
    }
    if include_metadata:
        obj["metadata"] = serialize_metadata(node)
    if children is not None:
        obj["children"] = children
    if maintenance_summary is not None:
        obj["maintenance_summary"] = maintenance_summary
    return obj


def _node_sort_key(node: dict) -> tuple:
    has_sort = node.get("sort_order") is not None
    sort_val = node.get("sort_order", 0) if has_sort else float("inf")
    tag = (node.get("tag") or "").lower()
    name = (node.get("name") or "").lower()
    return (0 if has_sort else 1, sort_val, tag, name)


async def _batch_operational_summaries(
    equipment_ids: List[str],
    nodes_by_id: Dict[str, dict],
    user: dict,
) -> Dict[str, Dict[str, Any]]:
    if not equipment_ids:
        return {}

    summaries = {eid: _default_operational_summary() for eid in equipment_ids}
    id_set = set(equipment_ids)

    async def count_threats() -> Dict[str, int]:
        counts: Dict[str, int] = {}
        cursor = db.threats.find(
            scoped(
                user,
                {
                    "status": {"$in": OPEN_THREAT_STATUSES},
                    "$or": [
                        {"linked_equipment_id": {"$in": equipment_ids}},
                        {"equipment_id": {"$in": equipment_ids}},
                    ],
                },
            ),
            {"_id": 0, "linked_equipment_id": 1, "equipment_id": 1},
        )
        async for threat in cursor:
            eid = threat.get("linked_equipment_id") or threat.get("equipment_id")
            if eid in id_set:
                counts[eid] = counts.get(eid, 0) + 1
        return counts

    async def count_observations() -> Dict[str, int]:
        counts: Dict[str, int] = {}
        cursor = db.observations.find(
            scoped(
                user,
                {
                    "status": {"$in": OPEN_OBS_STATUSES},
                    "equipment_id": {"$in": equipment_ids},
                },
            ),
            {"_id": 0, "equipment_id": 1},
        )
        async for obs in cursor:
            eid = obs.get("equipment_id")
            if eid in id_set:
                counts[eid] = counts.get(eid, 0) + 1
        return counts

    async def count_scheduled_tasks() -> Dict[str, int]:
        counts: Dict[str, int] = {}
        cursor = db.scheduled_tasks.find(
            scoped(
                user,
                {
                    "equipment_id": {"$in": equipment_ids},
                    "status": {"$nin": CLOSED_TASK_STATUSES},
                },
            ),
            {"_id": 0, "equipment_id": 1},
        )
        async for task in cursor:
            eid = task.get("equipment_id")
            if eid in id_set:
                counts[eid] = counts.get(eid, 0) + 1
        return counts

    async def count_task_instances() -> Dict[str, int]:
        counts: Dict[str, int] = {}
        cursor = db.task_instances.find(
            scoped(
                user,
                {
                    "equipment_id": {"$in": equipment_ids},
                    "status": {"$in": OPEN_INSTANCE_STATUSES},
                },
            ),
            {"_id": 0, "equipment_id": 1},
        )
        async for inst in cursor:
            eid = inst.get("equipment_id")
            if eid in id_set:
                counts[eid] = counts.get(eid, 0) + 1
        return counts

    async def load_programs() -> Dict[str, dict]:
        programs: Dict[str, dict] = {}
        cursor = db.maintenance_programs_v2.find(
            scoped(user, {"equipment_id": {"$in": equipment_ids}}),
            {"_id": 0, "equipment_id": 1, "is_active": 1, "status": 1},
        )
        async for prog in cursor:
            eid = prog.get("equipment_id")
            if eid:
                programs[eid] = prog
        return programs

    async def last_observation_dates() -> Dict[str, str]:
        dates: Dict[str, str] = {}

        async def _scan(collection, field: str) -> None:
            cursor = collection.find(
                scoped(user, {field: {"$in": equipment_ids}}),
                {"_id": 0, field: 1, "created_at": 1},
            ).sort("created_at", -1)
            async for doc in cursor:
                eid = doc.get(field)
                if eid in id_set and eid not in dates and doc.get("created_at"):
                    dates[eid] = str(doc["created_at"])

        await _scan(db.observations, "equipment_id")
        await _scan(db.threats, "linked_equipment_id")
        return dates

    (
        threat_counts,
        obs_counts,
        sched_counts,
        inst_counts,
        programs,
        last_dates,
    ) = await asyncio.gather(
        count_threats(),
        count_observations(),
        count_scheduled_tasks(),
        count_task_instances(),
        load_programs(),
        last_observation_dates(),
    )

    for eid in equipment_ids:
        open_obs = threat_counts.get(eid, 0) + obs_counts.get(eid, 0)
        open_tasks = sched_counts.get(eid, 0) + inst_counts.get(eid, 0)
        prog = programs.get(eid) or {}
        active_program = bool(
            prog
            and (
                prog.get("is_active") is True
                or (prog.get("status") or "").lower() in ("active", "draft")
            )
        )
        summaries[eid] = {
            "open_observation_count": open_obs,
            "open_planned_task_count": open_tasks,
            "active_maintenance_program": active_program,
            "last_observation_date": last_dates.get(eid),
        }
    return summaries


async def _load_node_context(user: dict, equipment_id: str) -> tuple[dict, Dict[str, dict]]:
    node = await db.equipment_nodes.find_one(scoped(user, {"id": equipment_id}), {"_id": 0})
    if not node:
        raise HTTPException(status_code=404, detail="Equipment not found")

    installation_id = node.get("installation_id") or (
        node["id"] if node.get("level") == "installation" else None
    )
    if not installation_id:
        parent_id = node.get("parent_id")
        if parent_id:
            installation_id = parent_id

    query: Dict[str, Any] = {"id": equipment_id}
    if installation_id:
        query = scoped(
            user,
            {"$or": [{"id": installation_id}, {"installation_id": installation_id}]},
        )
    else:
        query = scoped(user, {"id": equipment_id})

    nodes = await db.equipment_nodes.find(query, {"_id": 0}).to_list(10000)
    node_lookup = {n["id"]: n for n in nodes}
    if equipment_id not in node_lookup:
        node_lookup[equipment_id] = node
    return node, node_lookup


async def _maintenance_summary_for_equipment(user: dict, node: dict) -> Dict[str, Any]:
    equipment_id = node["id"]
    equipment_type_id = node.get("equipment_type_id")

    program = await db.maintenance_programs_v2.find_one(
        scoped(user, {"equipment_id": equipment_id}),
        {"_id": 0, "tasks": 1, "is_active": 1, "status": 1},
    )
    program_tasks = len((program or {}).get("tasks") or [])
    active_program = bool(
        program
        and (
            program.get("is_active") is True
            or (program.get("status") or "").lower() in ("active", "draft")
        )
    )

    strategy_fm_count = 0
    if equipment_type_id:
        strategy = await db.equipment_type_strategies.find_one(
            scoped(user, {"equipment_type_id": equipment_type_id, "status": "active"}),
            {"_id": 0, "failure_mode_strategies": 1},
        )
        strategy_fm_count = len((strategy or {}).get("failure_mode_strategies") or [])

    return {
        "active_maintenance_program": active_program,
        "program_task_count": program_tasks,
        "strategy_failure_mode_count": strategy_fm_count,
    }


async def get_equipment_detail(user: dict, equipment_id: str, *, include_metadata: bool = True) -> dict:
    node, node_lookup = await _load_node_context(user, equipment_id)
    installation_id = node.get("installation_id") or (
        node["id"] if node.get("level") == "installation" else node.get("parent_id")
    )
    depth = (
        depth_from_installation(node, installation_id, node_lookup)
        if installation_id
        else 0
    )
    summaries = await _batch_operational_summaries([equipment_id], node_lookup, user)
    maintenance_summary = await _maintenance_summary_for_equipment(user, node)

    return serialize_equipment_object(
        node,
        equipment_path=build_equipment_path(node, node_lookup),
        depth=depth,
        operational_summary=summaries.get(equipment_id),
        include_metadata=include_metadata,
        maintenance_summary=maintenance_summary,
    )


async def get_installation_hierarchy(
    user: dict,
    installation_id: str,
    *,
    include_inactive: bool = True,
    include_metadata: bool = True,
    max_depth: Optional[int] = None,
    flat: bool = False,
    last_modified_after: Optional[str] = None,
) -> dict:
    inst = await db.equipment_nodes.find_one(
        scoped(user, {"id": installation_id, "level": "installation"}),
        {"_id": 0},
    )
    if not inst:
        raise HTTPException(status_code=404, detail="Installation not found")

    node_filter: Dict[str, Any] = {
        "$or": [{"id": installation_id}, {"installation_id": installation_id}],
    }
    if not include_inactive:
        node_filter["is_active"] = {"$ne": False}
    if last_modified_after:
        node_filter["updated_at"] = {"$gte": last_modified_after}

    nodes = await db.equipment_nodes.find(scoped(user, node_filter), {"_id": 0}).to_list(10000)
    node_lookup = {n["id"]: n for n in nodes}
    if installation_id not in node_lookup:
        node_lookup[installation_id] = inst
        nodes.append(inst)

    equipment_ids = [n["id"] for n in nodes]
    summaries = await _batch_operational_summaries(equipment_ids, node_lookup, user)

    children_by_parent: Dict[str, List[dict]] = {}
    for n in nodes:
        parent_id = n.get("parent_id")
        if parent_id:
            children_by_parent.setdefault(parent_id, []).append(n)

    for parent_id in children_by_parent:
        children_by_parent[parent_id].sort(key=_node_sort_key)

    def build_node(node: dict, *, with_children: bool) -> Optional[dict]:
        depth = depth_from_installation(node, installation_id, node_lookup)
        if max_depth is not None and depth > max_depth:
            return None
        children: Optional[List[dict]] = None
        if with_children:
            child_nodes = children_by_parent.get(node["id"], [])
            built_children = []
            for child in child_nodes:
                built = build_node(child, with_children=True)
                if built is not None:
                    built_children.append(built)
            children = built_children
        return serialize_equipment_object(
            node,
            equipment_path=build_equipment_path(node, node_lookup),
            depth=depth,
            operational_summary=summaries.get(node["id"]),
            include_metadata=include_metadata,
            children=children if with_children else None,
        )

    if flat:
        flat_items: List[dict] = []
        for node in sorted(nodes, key=_node_sort_key):
            depth = depth_from_installation(node, installation_id, node_lookup)
            if max_depth is not None and depth > max_depth:
                continue
            flat_items.append(
                serialize_equipment_object(
                    node,
                    equipment_path=build_equipment_path(node, node_lookup),
                    depth=depth,
                    operational_summary=summaries.get(node["id"]),
                    include_metadata=include_metadata,
                )
            )
        return {
            "installation_id": installation_id,
            "installation_name": inst.get("name"),
            "flat": True,
            "count": len(flat_items),
            "equipment": flat_items,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    root = build_node(inst, with_children=True)
    return {
        "installation_id": installation_id,
        "installation_name": inst.get("name"),
        "flat": False,
        "count": len(nodes),
        "equipment": root,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
