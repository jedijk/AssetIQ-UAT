"""Tenant-scoped Mongo helpers for AI risk routes — Wave 11."""
from __future__ import annotations

from typing import Any, Dict, Optional

from database import db
from services.tenant_schema import merge_tenant_filter, with_tenant_id


def scoped(user: Optional[dict], query: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return merge_tenant_filter(query or {}, user)


async def find_threat(user: dict, threat_id: str) -> Optional[dict]:
    return await db.threats.find_one(scoped(user, {"id": threat_id}), {"_id": 0})


async def find_equipment_by_name(user: dict, name: str) -> Optional[dict]:
    return await db.equipment_nodes.find_one(scoped(user, {"name": name}), {"_id": 0})


async def find_ai_doc(user: dict, collection: str, threat_id: str) -> Optional[dict]:
    return await db[collection].find_one(scoped(user, {"threat_id": threat_id}), {"_id": 0})


async def upsert_ai_doc(
    user: dict,
    collection: str,
    threat_id: str,
    payload: Dict[str, Any],
) -> None:
    await db[collection].update_one(
        scoped(user, {"threat_id": threat_id}),
        {"$set": with_tenant_id({**payload, "threat_id": threat_id}, user)},
        upsert=True,
    )


async def update_threat(user: dict, threat_id: str, fields: Dict[str, Any]) -> None:
    await db.threats.update_one(scoped(user, {"id": threat_id}), {"$set": fields})


def find_threats(user: dict, query: Dict[str, Any], projection: dict, **cursor_kwargs):
    return db.threats.find(scoped(user, query), projection, **cursor_kwargs)


def find_actions(user: dict, query: Dict[str, Any], projection: dict, **cursor_kwargs):
    return db.central_actions.find(scoped(user, query), projection, **cursor_kwargs)


def find_tasks(user: dict, query: Dict[str, Any], projection: dict, **cursor_kwargs):
    return db.task_instances.find(scoped(user, query), projection, **cursor_kwargs)


def list_ai_insights_cursor(user: dict, limit: int = 5):
    return (
        db.ai_risk_insights.find(scoped(user), {"_id": 0})
        .sort("dynamic_risk.risk_score", -1)
        .limit(limit)
    )
