"""
Central actions — Wave 3 service layer.

Route handlers delegate here; persistence via repositories only.
"""
from __future__ import annotations

import logging
import os
import uuid as uuid_mod
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from database import db, installation_filter
from repositories.action_repository import ActionRepository
from repositories.equipment_repository import EquipmentRepository
from repositories.threat_repository import ThreatRepository
from repositories.user_repository import UserRepository
from services.action_number_service import allocate_central_action_number
from services.cache_service import cache
from services.lifecycle_dispatch import publish_action_completed
from services.tenant_schema import merge_tenant_filter, with_tenant_id
from utils.mongo_regex import case_insensitive_contains

logger = logging.getLogger(__name__)


def _json_safe_action(action: dict) -> dict:
    """Recursively coerce BSON values so FastAPI can serialize action responses."""
    try:
        from bson import ObjectId
    except ImportError:
        ObjectId = ()  # type: ignore[misc, assignment]

    def convert(value: Any) -> Any:
        if value is None or isinstance(value, (bool, int, float, str)):
            return value
        if isinstance(value, datetime):
            if value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc).isoformat()
            return value.isoformat()
        if ObjectId and isinstance(value, ObjectId):
            return str(value)
        if isinstance(value, bytes):
            return value.decode("utf-8", errors="replace")
        if isinstance(value, dict):
            return {str(k): convert(v) for k, v in value.items()}
        if isinstance(value, (list, tuple)):
            return [convert(v) for v in value]
        return str(value)

    return convert(action)


_action_repo = ActionRepository(db)
_threat_repo = ThreatRepository(db)
_equipment_repo = EquipmentRepository(db)
_user_repo = UserRepository(db)


async def find_central_action(
    action_id: str,
    user: dict,
    *,
    include_mongo_id: bool = False,
) -> Optional[dict]:
    return await _action_repo.find_by_id(action_id, user=user, include_mongo_id=include_mongo_id)


async def assert_action_installation_scope(user: dict, action: dict) -> None:
    eq_id = action.get("linked_equipment_id")
    if eq_id:
        await installation_filter.assert_user_can_access_equipment(user, eq_id)
        return
    threat_id = action.get("threat_id") or (
        action.get("source_id") if action.get("source_type") == "threat" else None
    )
    if threat_id:
        threat = await _threat_repo.find_by_id(threat_id, user=user)
        if threat:
            eq_id = threat.get("linked_equipment_id")
            if eq_id:
                await installation_filter.assert_user_can_access_equipment(user, eq_id)
                return
            if installation_filter.is_owner(user):
                return
            if threat.get("created_by") == user.get("id"):
                return
            raise HTTPException(status_code=403, detail="Action not in your assigned installations")
    if installation_filter.is_owner(user):
        return
    if action.get("created_by") == user.get("id"):
        return
    raise HTTPException(status_code=403, detail="Action not in your assigned installations")


def normalize_action_source_type(action: dict) -> Optional[str]:
    source_type = action.get("source_type")
    if source_type:
        return source_type
    legacy = action.get("source")
    if legacy in ("observation", "threat", "recommendation"):
        return "threat"
    if legacy == "investigation":
        return "investigation"
    return None


async def enrich_actions_source_names(actions: List[dict], *, user: Optional[dict] = None) -> List[dict]:
    if not actions:
        return actions

    threat_ids: set = set()
    inv_ids: set = set()
    pending: List[dict] = []

    for action in actions:
        if action.get("source_name"):
            continue
        pending.append(action)
        source_type = normalize_action_source_type(action)
        source_id = (
            action.get("source_id")
            or action.get("observation_id")
            or action.get("threat_id")
        )
        if source_type == "threat" and source_id:
            threat_ids.add(source_id)
        elif source_type == "investigation" and source_id:
            inv_ids.add(source_id)

    threat_map = {}
    if threat_ids:
        threats = await _threat_repo.find_many(
            {"id": {"$in": list(threat_ids)}},
            user=user,
            projection={"_id": 0, "id": 1, "title": 1},
            limit=500,
        )
        threat_map = {t["id"]: t.get("title") for t in threats}

    inv_map = {}
    if inv_ids:
        from repositories.investigation_repository import InvestigationRepository

        inv_repo = InvestigationRepository(db)
        invs = await inv_repo.find_many(
            {"id": {"$in": list(inv_ids)}},
            user=user,
            projection={"_id": 0, "id": 1, "title": 1},
            limit=500,
        )
        inv_map = {i["id"]: i.get("title") for i in invs}

    for action in pending:
        source_type = normalize_action_source_type(action)
        source_id = action.get("source_id") or action.get("observation_id") or action.get("threat_id")
        if source_type == "threat" and source_id in threat_map:
            action["source_name"] = threat_map[source_id]
        elif source_type == "investigation" and source_id in inv_map:
            action["source_name"] = inv_map[source_id]

    return actions


async def enrich_with_creator_info(items: list) -> list:
    if not items:
        return items

    creator_ids = list({item.get("created_by") for item in items if item.get("created_by")})
    if not creator_ids:
        return items

    cached_creators = cache.get_users_batch(creator_ids)
    uncached_ids = [uid for uid in creator_ids if uid not in cached_creators]

    if uncached_ids:
        creators = await _user_repo.find_by_ids(
            uncached_ids,
            projection={"_id": 0, "id": 1, "name": 1, "email": 1, "photo_url": 1, "avatar_path": 1, "avatar_data": 1, "position": 1, "role": 1},
        )
        fetched_map = {c["id"]: c for c in creators}
        cache.set_users_batch(fetched_map)
        cached_creators.update(fetched_map)

    for item in items:
        creator_id = item.get("created_by")
        creator = cached_creators.get(creator_id) if creator_id else None
        if creator:
            item["creator_name"] = creator.get("name") or creator.get("email", "").split("@")[0]
            item["creator_position"] = creator.get("position") or creator.get("role") or "Team Member"
            if creator.get("photo_url"):
                item["creator_photo"] = creator.get("photo_url")
            elif creator.get("avatar_path") or creator.get("avatar_data"):
                item["creator_photo"] = f"/api/users/{creator_id}/avatar"
            else:
                item["creator_photo"] = None
            name = item["creator_name"]
            parts = name.split() if name else []
            item["creator_initials"] = "".join(p[0].upper() for p in parts[:2]) if parts else "?"
        else:
            item["creator_name"] = None
            item["creator_position"] = None
            item["creator_photo"] = None
            item["creator_initials"] = "?"

    return items


async def list_all_actions(
    current_user: dict,
    *,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assignee: Optional[str] = None,
    source_type: Optional[str] = None,
) -> Dict[str, Any]:
    empty = {
        "actions": [],
        "stats": {"total": 0, "open": 0, "in_progress": 0, "completed": 0, "overdue": 0},
    }

    installation_ids = await installation_filter.get_user_installation_ids(current_user)
    if not installation_ids:
        return empty

    equipment_ids = await installation_filter.get_all_equipment_ids_for_installations(
        installation_ids, current_user["id"]
    )
    equipment_names = await installation_filter.get_equipment_names_for_installations(
        installation_ids, current_user["id"]
    )
    threat_ids = await installation_filter.get_filtered_threat_ids(
        current_user["id"], equipment_ids, equipment_names
    )
    investigation_ids = await installation_filter.get_filtered_investigation_ids(
        current_user["id"], equipment_ids, equipment_names
    )

    query = installation_filter.build_action_filter(
        current_user["id"], equipment_ids, equipment_names, threat_ids, investigation_ids
    )
    if query.get("_impossible"):
        return empty

    if status and status != "all":
        query["status"] = status
    if priority and priority != "all":
        query["priority"] = priority
    if assignee:
        assignee_match = case_insensitive_contains(assignee)
        if assignee_match:
            query["assignee"] = assignee_match
    if source_type and source_type != "all":
        query["source_type"] = source_type

    query = merge_tenant_filter(query, current_user)
    actions = await _action_repo.list_actions(query, user=current_user, sort=[("created_at", -1)])
    actions = await enrich_with_creator_info(actions)
    actions = await enrich_actions_source_names(actions, user=current_user)

    threat_ids_to_fetch = []
    for action in actions:
        tid = action.get("threat_id") or (
            action.get("source_id") if action.get("source_type") == "threat" else None
        )
        if tid:
            threat_ids_to_fetch.append(tid)

    threat_data_map = {}
    if threat_ids_to_fetch:
        threats = await _threat_repo.find_many(
            {"id": {"$in": list(set(threat_ids_to_fetch))}},
            user=current_user,
            projection={"_id": 0, "id": 1, "fmea_rpn": 1, "risk_score": 1, "risk_level": 1, "asset": 1, "linked_equipment_id": 1},
            limit=500,
        )
        threat_data_map = {t["id"]: t for t in threats}

    enriched_actions = []
    for action in actions:
        enriched = dict(action)
        tid = action.get("threat_id") or (
            action.get("source_id") if action.get("source_type") == "threat" else None
        )
        threat = threat_data_map.get(tid) if tid else None
        if threat:
            enriched["threat_rpn"] = threat.get("fmea_rpn") or action.get("rpn")
            enriched["threat_risk_score"] = threat.get("risk_score") or action.get("risk_score")
            enriched["threat_risk_level"] = threat.get("risk_level") or action.get("risk_level")
            enriched["threat_asset"] = threat.get("asset")
            enriched["linked_equipment_id"] = threat.get("linked_equipment_id")
        elif action.get("rpn") is not None:
            enriched["threat_rpn"] = action.get("rpn")
            enriched["threat_risk_score"] = action.get("risk_score")
            enriched["threat_risk_level"] = action.get("risk_level")
        else:
            enriched["threat_rpn"] = None
            enriched["threat_risk_score"] = None
            enriched["threat_risk_level"] = None
        enriched_actions.append(enriched)

    base_stats_query = installation_filter.build_action_filter(
        current_user["id"], equipment_ids, equipment_names, threat_ids
    )
    if base_stats_query.get("_impossible"):
        stats = empty["stats"]
    else:
        base_stats_query = merge_tenant_filter(base_stats_query, current_user)
        stats = await _action_repo.aggregate_stats(
            base_stats_query,
            user=current_user,
            now_iso=datetime.now(timezone.utc).isoformat(),
        )

    eq_ids = list({a.get("linked_equipment_id") for a in enriched_actions if a.get("linked_equipment_id")})
    if eq_ids:
        tags = await _equipment_repo.find_tags_by_ids(eq_ids, user=current_user)
        for action in enriched_actions:
            eq_id = action.get("linked_equipment_id")
            if eq_id:
                action["equipment_tag"] = tags.get(eq_id)

    return {"actions": enriched_actions, "stats": stats}


async def list_overdue_actions(current_user: dict) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    overdue = await _action_repo.find_many(
        {
            "created_by": current_user["id"],
            "status": {"$in": ["open", "in_progress"]},
            "due_date": {"$lt": now, "$nin": [None, ""]},
        },
        user=current_user,
        projection={"_id": 0},
        sort=[("due_date", 1)],
        limit=50,
    )
    return {"overdue_actions": overdue, "count": len(overdue)}


async def get_action_detail(action_id: str, current_user: dict) -> dict:
    action = await find_central_action(action_id, current_user)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")

    enriched = await enrich_actions_source_names([action], user=current_user)
    action = enriched[0]

    threat_id = action.get("threat_id") or (
        action.get("source_id") if action.get("source_type") == "threat" else None
    )
    if threat_id:
        threat = await _threat_repo.find_one(
            {"id": threat_id},
            user=current_user,
            projection={"_id": 0, "asset": 1, "linked_equipment_id": 1},
        )
        if threat:
            action["threat_asset"] = threat.get("asset")
            eq_id = threat.get("linked_equipment_id")
            if eq_id:
                action["linked_equipment_id"] = eq_id
                tags = await _equipment_repo.find_tags_by_ids([eq_id], user=current_user)
                action["equipment_tag"] = tags.get(eq_id)

    return _json_safe_action(action)


async def create_action(current_user: dict, data: Dict[str, Any]) -> dict:
    """Create a centralized action from threat or investigation source."""
    from repositories.investigation_repository import InvestigationRepository

    inv_repo = InvestigationRepository(db)

    if data.get("source_type") == "threat":
        threat = await _threat_repo.find_by_id(data["source_id"], user=current_user)
        if threat:
            eq_id = threat.get("linked_equipment_id")
            if eq_id:
                await installation_filter.assert_user_can_access_equipment(current_user, eq_id)

    action_id = str(uuid_mod.uuid4())
    action_number = await allocate_central_action_number()

    rpn = data.get("rpn")
    risk_score = data.get("risk_score")
    risk_level = data.get("risk_level")
    threat_id = data.get("threat_id")

    if data.get("source_type") == "investigation" and rpn is None:
        investigation = await inv_repo.find_by_id(data["source_id"], user=current_user)
        if investigation:
            linked_threat_id = investigation.get("threat_id") or threat_id
            if linked_threat_id:
                threat = await _threat_repo.find_by_id(linked_threat_id, user=current_user)
                if threat:
                    rpn = threat.get("fmea_rpn") or threat.get("rpn")
                    risk_score = threat.get("risk_score")
                    risk_level = threat.get("risk_level")
                    threat_id = linked_threat_id
    elif data.get("source_type") == "threat" and rpn is None:
        threat = await _threat_repo.find_by_id(data["source_id"], user=current_user)
        if threat:
            rpn = threat.get("fmea_rpn") or threat.get("rpn")
            risk_score = threat.get("risk_score")
            risk_level = threat.get("risk_level")
            threat_id = data["source_id"]

    linked_equipment_id = None
    failure_mode_id = data.get("failure_mode_id")
    if data.get("source_type") == "threat" and threat_id:
        threat = await _threat_repo.find_one(
            {"id": threat_id},
            user=current_user,
            projection={"linked_equipment_id": 1, "failure_mode_id": 1},
        )
        linked_equipment_id = (threat or {}).get("linked_equipment_id")
        failure_mode_id = failure_mode_id or (threat or {}).get("failure_mode_id")
    elif data.get("source_type") == "investigation":
        inv = await inv_repo.find_one(
            {"id": data["source_id"]},
            user=current_user,
            projection={"asset_id": 1, "threat_id": 1},
        )
        linked_equipment_id = (inv or {}).get("asset_id")
        inv_threat_id = (inv or {}).get("threat_id") or threat_id
        if inv_threat_id and not failure_mode_id:
            threat = await _threat_repo.find_one(
                {"id": inv_threat_id},
                user=current_user,
                projection={"failure_mode_id": 1},
            )
            failure_mode_id = (threat or {}).get("failure_mode_id")

    now = datetime.now(timezone.utc).isoformat()
    action_doc = {
        "id": action_id,
        "action_number": action_number,
        "title": data["title"],
        "description": data["description"],
        "source_type": data["source_type"],
        "source_id": data["source_id"],
        "source_name": data["source_name"],
        "threat_id": threat_id,
        "linked_equipment_id": linked_equipment_id,
        "priority": data.get("priority", "medium"),
        "assignee": data.get("assignee"),
        "action_type": data.get("action_type"),
        "discipline": data.get("discipline"),
        "due_date": data.get("due_date"),
        "status": "open",
        "comments": data.get("comments") or "",
        "completion_notes": None,
        "rpn": rpn,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now,
    }

    await _action_repo.insert_document(action_doc, user=current_user)
    action_doc.pop("_id", None)

    from services.reliability_graph import dispatch_graph_sync

    await dispatch_graph_sync(
        "sync_action_edges",
        "action_create",
        action_id=action_id,
        source_type=data["source_type"],
        source_id=data["source_id"],
        equipment_id=linked_equipment_id,
        failure_mode_id=str(failure_mode_id) if failure_mode_id else None,
    )
    return action_doc


async def update_action(
    action_id: str,
    current_user: dict,
    update_fields: Dict[str, Any],
) -> dict:
    """Update action; handles completion side effects via outbox + graph dispatch."""
    from repositories.investigation_repository import InvestigationRepository

    inv_repo = InvestigationRepository(db)

    action = await find_central_action(action_id, current_user, include_mongo_id=True)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    await assert_action_installation_scope(current_user, action)

    update_data = {k: v for k, v in update_fields.items() if v is not None}
    spare_requirements = update_data.pop("spare_part_requirements", None)
    if spare_requirements is not None:
        from models.spare_parts import SparePartRequirement

        normalized = []
        for req in spare_requirements:
            if isinstance(req, dict):
                normalized.append(SparePartRequirement(**req).model_dump())
            else:
                normalized.append(req.model_dump())
        update_data["spare_part_requirements"] = normalized
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    status_changed_to_completed = (
        update_fields.get("status") == "completed" and action.get("status") != "completed"
    )

    await _action_repo.update_mongo_doc(action["_id"], {"$set": update_data})
    updated = await _action_repo.find_by_mongo_id(action["_id"], projection={"_id": 0})

    if spare_requirements is not None:
        from services.spare_part_requirements_service import apply_action_requirements

        serialized = await apply_action_requirements(
            user=current_user,
            action_id=action_id,
            action=updated or action,
            requirements=update_data.get("spare_part_requirements") or [],
        )
        if updated is not None:
            updated["spare_part_requirements"] = serialized

    completion_notification = None
    if status_changed_to_completed:
        from services.observation_mitigation import build_action_plan_completion_notification

        completion_notification = await build_action_plan_completion_notification(
            action,
            user_id=current_user.get("id"),
        )
        if (
            not completion_notification
            and action.get("source_type")
            and action.get("source_id")
            and action["source_type"] == "investigation"
        ):
            source_type = action["source_type"]
            source_id = action["source_id"]
            remaining_open = await _action_repo.count_open_for_source(
                source_type, source_id, user=current_user
            )
            if remaining_open == 0:
                total_actions = await _action_repo.count_for_source(
                    source_type, source_id, user=current_user
                )
                inv = await inv_repo.find_one(
                    {"id": source_id},
                    user=current_user,
                    projection={"_id": 0, "title": 1, "status": 1},
                )
                if inv and inv.get("status") not in ["completed", "closed"]:
                    completion_notification = {
                        "type": "all_actions_completed",
                        "source_type": source_type,
                        "source_id": source_id,
                        "source_name": inv.get("title", "Investigation"),
                        "total_actions": total_actions,
                        "message": (
                            f"All {total_actions} action(s) for "
                            f"'{inv.get('title', 'Investigation')}' are now complete! "
                            "Consider closing this investigation."
                        ),
                        "suggest_closure": True,
                    }

    if status_changed_to_completed:
        await publish_action_completed(
            action_id,
            source_type=action.get("source_type"),
            source_id=action.get("source_id"),
            user=current_user,
        )
        if os.environ.get("ENVIRONMENT") != "test":
            from services.reliability_graph import dispatch_graph_sync

            eq_id = updated.get("linked_equipment_id")
            if not eq_id and updated.get("threat_id"):
                threat = await _threat_repo.find_one(
                    {"id": updated["threat_id"]},
                    user=current_user,
                    projection={"linked_equipment_id": 1},
                )
                eq_id = (threat or {}).get("linked_equipment_id")
            if eq_id:
                await dispatch_graph_sync(
                    "sync_outcome_edges",
                    "action_close_outcome",
                    action_id=updated.get("id") or action_id,
                    outcome_id=str(uuid_mod.uuid4()),
                    equipment_id=eq_id,
                    verification_status="verified",
                    effectiveness=updated.get("completion_notes"),
                )

    response = _json_safe_action(dict(updated))
    if completion_notification:
        response["completion_notification"] = completion_notification
    return response


async def set_action_validation(
    action_id: str,
    current_user: dict,
    *,
    validated: bool,
    validated_by_name: Optional[str] = None,
    validated_by_position: Optional[str] = None,
    validated_by_id: Optional[str] = None,
) -> dict:
    action = await find_central_action(action_id, current_user, include_mongo_id=True)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    await assert_action_installation_scope(current_user, action)

    now = datetime.now(timezone.utc).isoformat()
    if validated:
        update_data = {
            "is_validated": True,
            "validated_by_name": validated_by_name,
            "validated_by_position": validated_by_position,
            "validated_by_id": validated_by_id or current_user["id"],
            "validated_at": now,
            "updated_at": now,
        }
    else:
        update_data = {
            "is_validated": False,
            "validated_by_name": None,
            "validated_by_position": None,
            "validated_by_id": None,
            "validated_at": None,
            "updated_at": now,
        }

    await _action_repo.update_mongo_doc(action["_id"], {"$set": update_data})
    result = await find_central_action(action_id, current_user)
    if not result:
        raise HTTPException(status_code=404, detail="Action not found")
    return result


async def get_source_completion_status(
    source_type: str,
    source_id: str,
    current_user: dict,
) -> Dict[str, Any]:
    from repositories.investigation_repository import InvestigationRepository

    inv_repo = InvestigationRepository(db)

    if source_type not in ["threat", "investigation"]:
        raise HTTPException(status_code=400, detail="Invalid source_type. Must be 'threat' or 'investigation'")

    all_actions = await _action_repo.find_many(
        {"source_type": source_type, "source_id": source_id, "created_by": current_user["id"]},
        user=current_user,
        projection={"_id": 0, "id": 1, "status": 1, "title": 1, "is_validated": 1},
        limit=100,
    )

    if not all_actions:
        return {
            "source_type": source_type,
            "source_id": source_id,
            "total_actions": 0,
            "completed_actions": 0,
            "all_completed": False,
            "all_validated": False,
            "suggest_closure": False,
            "pending_actions": [],
            "message": "No actions found for this source",
        }

    completed_actions = [a for a in all_actions if a.get("status") == "completed"]
    validated_actions = [a for a in all_actions if a.get("is_validated")]
    pending_actions = [a for a in all_actions if a.get("status") != "completed"]

    total = len(all_actions)
    completed = len(completed_actions)
    validated = len(validated_actions)
    all_completed = completed == total
    all_validated = validated == total
    suggest_closure = all_completed and total > 0

    source_name = None
    if source_type == "threat":
        threat = await _threat_repo.find_one(
            {"id": source_id},
            user=current_user,
            projection={"_id": 0, "title": 1, "status": 1},
        )
        if threat:
            source_name = threat.get("title", "Observation")
            if threat.get("status") == "closed":
                suggest_closure = False
    elif source_type == "investigation":
        investigation = await inv_repo.find_one(
            {"id": source_id},
            user=current_user,
            projection={"_id": 0, "title": 1, "status": 1},
        )
        if investigation:
            source_name = investigation.get("title", "Investigation")
            if investigation.get("status") == "completed":
                suggest_closure = False

    return {
        "source_type": source_type,
        "source_id": source_id,
        "source_name": source_name,
        "total_actions": total,
        "completed_actions": completed,
        "validated_actions": validated,
        "completion_percentage": round((completed / total) * 100) if total > 0 else 0,
        "all_completed": all_completed,
        "all_validated": all_validated,
        "suggest_closure": suggest_closure,
        "pending_actions": [{"id": a["id"], "title": a.get("title", "Untitled")} for a in pending_actions],
        "message": (
            f"All {total} action(s) completed! Consider closing this {source_type.replace('threat', 'observation')}."
            if suggest_closure
            else None
        ),
    }


async def delete_action(action_id: str, current_user: dict) -> None:
    from repositories.action_repository import delete_central_action

    action = await find_central_action(action_id, current_user, include_mongo_id=True)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    await assert_action_installation_scope(current_user, action)

    try:
        await delete_central_action(action_id=action_id, user=current_user)
    except ValueError as exc:
        code = str(exc)
        if code == "not_found":
            raise HTTPException(status_code=404, detail="Action not found") from exc
        if code == "forbidden":
            raise HTTPException(
                status_code=404,
                detail="Action not found or you don't have permission to delete it",
            ) from exc
        raise

    from services.work_item_projection import invalidate_user_projections

    await invalidate_user_projections(
        current_user.get("id") or "",
        tenant_id=current_user.get("company_id") or current_user.get("organization_id"),
    )
