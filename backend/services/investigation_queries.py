"""Investigation read/query helpers and list/detail endpoints."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException

from database import db
from repositories.equipment_repository import EquipmentRepository
from repositories.investigation_repository import InvestigationRepository
from repositories.user_repository import UserRepository
from services.tenant_scope import scoped
from utils.mongo_regex import exact_case_insensitive

_inv_repo = InvestigationRepository(db)
_user_repo = UserRepository(db)
_equipment_repo = EquipmentRepository(db)


def investigation_query(user: dict, *, inv_id: Optional[str] = None, extra: Optional[dict] = None) -> dict:
    q: Dict[str, Any] = {"created_by": user["id"]}
    if inv_id:
        q["id"] = inv_id
    if extra:
        q.update(extra)
    return scoped(user, q)


def inv_child_query(user: dict, inv_id: str, extra: Optional[dict] = None) -> dict:
    q: Dict[str, Any] = {"investigation_id": inv_id}
    if extra:
        q.update(extra)
    return scoped(user, q)


async def _lead_enrichment(inv: dict, user: dict) -> None:
    lead_picture = None
    lead_name = inv.get("investigation_leader")
    lead_position = "Investigation Lead"

    if inv.get("investigation_leader"):
        user_doc = await _user_repo.find_one(
            {"name": inv["investigation_leader"]},
            user=user,
            projection={
                "_id": 0,
                "id": 1,
                "photo_url": 1,
                "avatar_path": 1,
                "avatar_data": 1,
                "name": 1,
                "position": 1,
                "role": 1,
            },
        )
        if user_doc:
            if user_doc.get("photo_url"):
                lead_picture = user_doc.get("photo_url")
            elif user_doc.get("avatar_path") or user_doc.get("avatar_data"):
                lead_picture = f"/api/users/{user_doc['id']}/avatar"
            lead_name = user_doc.get("name", lead_name)
            lead_position = user_doc.get("position") or user_doc.get("role") or "Investigation Lead"

    if not lead_picture and inv.get("created_by"):
        user_doc = await _user_repo.find_one(
            {"id": inv["created_by"]},
            user=user,
            projection={
                "_id": 0,
                "photo_url": 1,
                "avatar_path": 1,
                "avatar_data": 1,
                "name": 1,
                "position": 1,
                "role": 1,
            },
        )
        if user_doc:
            if user_doc.get("photo_url"):
                lead_picture = user_doc.get("photo_url")
            elif user_doc.get("avatar_path") or user_doc.get("avatar_data"):
                lead_picture = f"/api/users/{inv['created_by']}/avatar"
            if not lead_name:
                lead_name = user_doc.get("name")
            if lead_position == "Investigation Lead":
                lead_position = user_doc.get("position") or user_doc.get("role") or "Investigation Lead"

    inv["lead_picture"] = lead_picture
    inv["lead_name"] = lead_name
    inv["lead_position"] = lead_position


async def _equipment_tag_for_asset(asset_name: Optional[str], user: dict) -> Optional[str]:
    if not asset_name:
        return None
    equipment = await _equipment_repo.find_one(
        {"name": exact_case_insensitive(asset_name)},
        user=user,
        projection={"_id": 0, "tag": 1},
    )
    return equipment.get("tag") if equipment else None


async def list_investigations(
    user: dict,
    *,
    status: Optional[str] = None,
) -> Dict[str, Any]:
    base: Dict[str, Any] = {"created_by": user["id"]}
    if status:
        base["status"] = status

    investigations = await _inv_repo.find_many(
        base,
        user=user,
        projection={"_id": 0},
        sort=[("created_at", -1)],
        limit=100,
    )

    for inv in investigations:
        await _lead_enrichment(inv, user)
        if inv.get("asset_name"):
            inv["equipment_tag"] = await _equipment_tag_for_asset(inv["asset_name"], user)

    return {"investigations": investigations}


async def get_investigation_detail(user: dict, inv_id: str) -> Dict[str, Any]:
    inv = await _inv_repo.find_one(
        investigation_query(user, inv_id=inv_id),
        user=user,
        projection={"_id": 0},
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    if inv.get("asset_name"):
        inv["equipment_tag"] = await _equipment_tag_for_asset(inv["asset_name"], user)

    events = await db.timeline_events.find(
        inv_child_query(user, inv_id), {"_id": 0}
    ).sort("event_time", 1).to_list(500)
    failures = await db.failure_identifications.find(
        inv_child_query(user, inv_id), {"_id": 0}
    ).to_list(100)
    causes = await db.cause_nodes.find(
        inv_child_query(user, inv_id), {"_id": 0}
    ).to_list(500)
    actions = await db.action_items.find(
        inv_child_query(user, inv_id), {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    evidence = await db.evidence_items.find(
        inv_child_query(user, inv_id), {"_id": 0}
    ).to_list(100)

    return {
        "investigation": inv,
        "timeline_events": events,
        "failure_identifications": failures,
        "cause_nodes": causes,
        "action_items": actions,
        "evidence": evidence,
    }


async def check_for_similar_incidents(
    user: dict,
    asset_name: str,
    description: str,
    exclude_id: Optional[str] = None,
) -> dict:
    if not asset_name:
        return {"found": False, "similar_incidents": []}

    query: Dict[str, Any] = {
        "created_by": user["id"],
        "asset_name": exact_case_insensitive(asset_name),
        "status": {"$in": ["completed", "closed"]},
    }
    if exclude_id:
        query["id"] = {"$ne": exclude_id}

    past_investigations = await _inv_repo.find_many(
        query,
        user=user,
        projection={"_id": 0, "id": 1, "title": 1, "description": 1, "incident_date": 1, "case_number": 1},
        sort=[("incident_date", -1)],
        limit=10,
    )
    if not past_investigations:
        return {"found": False, "similar_incidents": []}

    description_lower = (description or "").lower()
    stop_words = {
        "the", "a", "an", "is", "was", "were", "are", "been", "be", "have", "has", "had",
        "do", "does", "did", "will", "would", "could", "should", "may", "might", "must",
        "shall", "can", "need", "dare", "ought", "used", "to", "of", "in", "for", "on",
        "with", "at", "by", "from", "as", "into", "through", "during", "before", "after",
        "above", "below", "between", "under", "again", "further", "then", "once", "and",
        "but", "or", "nor", "so", "yet", "both", "either", "neither", "not", "only",
        "same", "than", "too", "very", "just", "also",
    }
    keywords = set(description_lower.split()) - stop_words
    similar = []
    for inv in past_investigations:
        past_words = set((inv.get("description") or "").lower().split()) | set(
            (inv.get("title") or "").lower().split()
        )
        past_words -= stop_words
        if keywords and past_words:
            overlap = len(keywords & past_words)
            if overlap >= 2:
                similar.append({
                    "id": inv["id"],
                    "case_number": inv.get("case_number"),
                    "title": inv.get("title"),
                    "incident_date": inv.get("incident_date"),
                    "match_score": overlap,
                })
    similar.sort(key=lambda x: x.get("match_score", 0), reverse=True)
    return {"found": len(similar) > 0, "similar_incidents": similar[:5]}


async def get_similar_incidents(user: dict, inv_id: str):
    inv = await db.investigations.find_one(
        investigation_query(user, inv_id=inv_id),
        {"_id": 0}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    return await check_for_similar_incidents(
        user,
        inv.get("asset_name"),
        inv.get("description"),
        exclude_id=inv_id
    )


async def get_linked_incident(user: dict, inv_id: str):
    inv = await db.investigations.find_one(
        investigation_query(user, inv_id=inv_id),
        {"_id": 0}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    linked_id = inv.get("linked_incident_id")
    if not linked_id:
        return {"linked_incident": None}

    linked_inv = await db.investigations.find_one(
        investigation_query(user, inv_id=linked_id),
        {"_id": 0, "id": 1, "case_number": 1, "title": 1, "description": 1,
         "asset_name": 1, "incident_date": 1, "status": 1, "recurring_quadrant": 1}
    )

    return {"linked_incident": linked_inv}
