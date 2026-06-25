"""Spare part requirements on maintenance program tasks and central actions."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from database import db
from models.spare_parts import SparePartRequirement
from services.spare_parts_graph_sync import sync_entity_requires_spare_parts
from services.tenant_schema import merge_tenant_filter, tenant_id_from_user

_REPLACEMENT_KEYWORDS = ("replace", "replacement", "swap", "change out", "overhaul")


def _contains_replacement_keyword(*texts: Optional[str]) -> bool:
    combined = " ".join((text or "").lower() for text in texts)
    return any(keyword in combined for keyword in _REPLACEMENT_KEYWORDS)


def task_consumes_spare_parts(task: dict) -> bool:
    """Whether a program task may reference SpareIQ parts."""
    if task.get("spare_part_requirements"):
        return True
    if task.get("consumes_spare_parts") is True:
        return True
    return _contains_replacement_keyword(task.get("task_title"), task.get("task_description"))


def action_consumes_spare_parts(action: dict) -> bool:
    """Whether a central action may reference SpareIQ parts."""
    if action.get("spare_part_requirements"):
        return True
    if action.get("consumes_spare_parts") is True:
        return True
    if action.get("action_type") == "CM":
        return _contains_replacement_keyword(action.get("title"), action.get("description"))
    return _contains_replacement_keyword(action.get("title"), action.get("description"))


def _serialize_requirements(requirements: List[SparePartRequirement | dict]) -> List[dict]:
    out: List[dict] = []
    seen = set()
    for item in requirements or []:
        if isinstance(item, SparePartRequirement):
            req = item.model_dump()
        else:
            req = SparePartRequirement(**item).model_dump()
        part_id = req["spare_part_id"]
        if part_id in seen:
            continue
        seen.add(part_id)
        out.append(req)
    return out


async def _validate_requirements_for_equipment(
    user: dict,
    equipment_id: Optional[str],
    requirements: List[dict],
) -> None:
    if not requirements:
        return
    if not equipment_id:
        raise HTTPException(
            status_code=400,
            detail="Equipment context is required to assign spare parts",
        )

    part_ids = [req["spare_part_id"] for req in requirements]
    parts = await db.spare_parts.find(
        merge_tenant_filter({"id": {"$in": part_ids}}, user),
        {"_id": 0, "id": 1, "equipment_links": 1},
    ).to_list(len(part_ids))
    found = {part["id"]: part for part in parts}
    missing = [part_id for part_id in part_ids if part_id not in found]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Spare part not found: {', '.join(missing[:5])}",
        )

    for req in requirements:
        part = found[req["spare_part_id"]]
        linked_ids = {
            (link.get("equipment_id") or "").strip()
            for link in (part.get("equipment_links") or [])
        }
        if equipment_id not in linked_ids:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Spare part {req['spare_part_id']} is not linked to equipment {equipment_id}"
                ),
            )


async def enrich_requirements(user: dict, requirements: List[dict]) -> List[dict]:
    if not requirements:
        return []
    part_ids = [req["spare_part_id"] for req in requirements]
    parts = await db.spare_parts.find(
        merge_tenant_filter({"id": {"$in": part_ids}}, user),
        {"_id": 0, "id": 1, "description": 1, "type_model": 1, "manufacturer": 1},
    ).to_list(len(part_ids))
    by_id = {part["id"]: part for part in parts}
    enriched = []
    for req in requirements:
        part = by_id.get(req["spare_part_id"], {})
        enriched.append({
            **req,
            "description": part.get("description"),
            "type_model": part.get("type_model"),
            "manufacturer": part.get("manufacturer"),
        })
    return enriched


async def apply_program_task_requirements(
    *,
    user: dict,
    equipment_id: str,
    task_id: str,
    requirements: List[SparePartRequirement | dict],
) -> List[dict]:
    serialized = _serialize_requirements(requirements)
    await _validate_requirements_for_equipment(user, equipment_id, serialized)
    tenant_id = tenant_id_from_user(user)
    await sync_entity_requires_spare_parts(
        source_type="program_task",
        source_id=task_id,
        requirements=serialized,
        equipment_id=equipment_id,
        tenant_id=tenant_id,
    )
    return serialized


async def apply_action_requirements(
    *,
    user: dict,
    action_id: str,
    action: dict,
    requirements: List[SparePartRequirement | dict],
) -> List[dict]:
    serialized = _serialize_requirements(requirements)
    equipment_id = action.get("linked_equipment_id")
    if not equipment_id and action.get("threat_id"):
        from repositories.threat_repository import ThreatRepository

        threat = await ThreatRepository(db).find_one(
            {"id": action["threat_id"]},
            user=user,
            projection={"linked_equipment_id": 1},
        )
        equipment_id = (threat or {}).get("linked_equipment_id")

    await _validate_requirements_for_equipment(user, equipment_id, serialized)
    tenant_id = tenant_id_from_user(user)
    if equipment_id:
        await sync_entity_requires_spare_parts(
            source_type="action",
            source_id=action_id,
            requirements=serialized,
            equipment_id=equipment_id,
            tenant_id=tenant_id,
        )
    return serialized


async def get_spare_part_insights(user: dict, spare_part_id: str) -> dict:
    part = await db.spare_parts.find_one(
        merge_tenant_filter({"id": spare_part_id}, user),
        {"_id": 0},
    )
    if not part:
        raise HTTPException(status_code=404, detail="Spare part not found")

    tenant_id = tenant_id_from_user(user)
    edge_query: Dict[str, Any] = {
        "status": "active",
        "relation": "requires",
        "target_type": "spare_part",
        "target_id": spare_part_id,
    }
    if tenant_id:
        edge_query["tenant_id"] = tenant_id

    requires_edges = await db.reliability_edges.find(
        edge_query,
        {"_id": 0, "source_type": 1, "source_id": 1, "metadata": 1},
    ).to_list(500)

    program_task_count = sum(1 for edge in requires_edges if edge.get("source_type") == "program_task")
    action_count = sum(1 for edge in requires_edges if edge.get("source_type") == "action")
    equipment_links = part.get("equipment_links") or []
    total_qty = sum((edge.get("metadata") or {}).get("quantity", 1) for edge in requires_edges)

    insights = []
    if program_task_count:
        insights.append({
            "type": "usage",
            "severity": "info",
            "message": f"Referenced by {program_task_count} maintenance program task(s).",
        })
    if action_count:
        insights.append({
            "type": "usage",
            "severity": "info",
            "message": f"Referenced by {action_count} corrective/preventive action(s).",
        })
    if not equipment_links:
        insights.append({
            "type": "coverage",
            "severity": "warning",
            "message": "Not linked to any equipment — link equipment before assigning to maintenance work.",
        })
    elif program_task_count == 0 and action_count == 0:
        insights.append({
            "type": "coverage",
            "severity": "info",
            "message": (
                f"Linked to {len(equipment_links)} equipment item(s) but not yet required by maintenance tasks."
            ),
        })
    if total_qty > 10:
        insights.append({
            "type": "stock",
            "severity": "info",
            "message": f"Maintenance plans reference up to {total_qty} units across linked work items.",
        })

    return {
        "spare_part_id": spare_part_id,
        "linked_equipment_count": len(equipment_links),
        "program_task_references": program_task_count,
        "action_references": action_count,
        "total_planned_quantity": total_qty,
        "insights": insights,
    }
