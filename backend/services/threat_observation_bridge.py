"""
Threat ↔ observation bridge — incremental dual-write and unified reads.

Threats (legacy) live in ``threats``; structured observations in ``observations``.
This adapter mirrors threat creates into observations with ``legacy_threat_id``.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import db
from services.tenant_schema import merge_tenant_filter, with_tenant_id

logger = logging.getLogger(__name__)

OPEN_STATUSES = frozenset({"open", "observation", "in progress", "in_progress", "active"})


def threat_to_observation_doc(threat: dict, *, user: Optional[dict] = None) -> Dict[str, Any]:
    """Map a threat document to an observations-collection mirror."""
    now = datetime.now(timezone.utc)
    threat_id = threat.get("id")
    status_raw = (threat.get("status") or "open").strip().lower()
    if status_raw in ("observation", "open", "in progress", "in_progress"):
        obs_status = "open"
    elif status_raw in ("closed", "mitigated", "completed"):
        obs_status = "closed"
    else:
        obs_status = "open"

    doc: Dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "legacy_threat_id": threat_id,
        "equipment_id": threat.get("linked_equipment_id") or threat.get("equipment_id"),
        "equipment_name": threat.get("asset") or threat.get("equipment_name"),
        "failure_mode_id": threat.get("failure_mode_id"),
        "failure_mode_name": threat.get("failure_mode"),
        "description": threat.get("description") or threat.get("user_context") or threat.get("title", ""),
        "severity": (threat.get("risk_level") or "medium").lower(),
        "observation_type": "general",
        "source": "threat_mirror",
        "status": obs_status,
        "risk_score": threat.get("risk_score"),
        "risk_level": threat.get("risk_level"),
        "created_by": threat.get("created_by"),
        "created_at": threat.get("created_at") or now,
        "updated_at": now,
        "linked_action_ids": [],
        "tags": [],
        "media_urls": [],
        "measured_values": [],
    }
    return with_tenant_id(doc, user)


async def mirror_threat_to_observation(
    threat: dict,
    *,
    user: Optional[dict] = None,
) -> Optional[str]:
    """Create observation mirror for a threat if none exists. Returns observation id."""
    return await sync_threat_mirror(threat, user=user, create_only=True)


async def sync_threat_mirror(
    threat: dict,
    *,
    user: Optional[dict] = None,
    create_only: bool = False,
) -> Optional[str]:
    """Create or update observation mirror for a threat. Returns observation id."""
    threat_id = threat.get("id")
    if not threat_id:
        return None

    existing = await db.observations.find_one(
        merge_tenant_filter({"legacy_threat_id": threat_id}, user),
        {"_id": 0, "id": 1},
    )
    if existing:
        if create_only:
            return existing.get("id") or str(existing.get("_id", ""))
        obs_id = existing.get("id")
        doc_fields = threat_to_observation_doc(threat, user=user)
        update = {k: v for k, v in doc_fields.items() if k != "id"}
        await db.observations.update_one(
            merge_tenant_filter({"id": obs_id}, user),
            {"$set": update},
        )
        logger.info("Updated threat mirror %s → observation %s", threat_id, obs_id)
        return obs_id

    doc = threat_to_observation_doc(threat, user=user)
    await db.observations.insert_one(doc)
    logger.info("Mirrored threat %s → observation %s", threat_id, doc["id"])
    return doc["id"]


async def count_unified_open_signals(*, user: Optional[dict] = None) -> int:
    """Count distinct open work signals across threats and observations (deduped mirrors)."""
    open_statuses = ["Open", "open", "In Progress", "in_progress", "active"]
    mirrored = await db.observations.distinct(
        "legacy_threat_id",
        merge_tenant_filter(
            {"legacy_threat_id": {"$exists": True, "$ne": None}},
            user,
        ),
    )
    threat_query: Dict[str, Any] = merge_tenant_filter(
        {"status": {"$in": open_statuses}},
        user,
    )
    if mirrored:
        threat_query["id"] = {"$nin": [m for m in mirrored if m]}
    threat_count = await db.threats.count_documents(threat_query)
    obs_count = await db.observations.count_documents(
        merge_tenant_filter({"status": {"$in": list(OPEN_STATUSES)}}, user),
    )
    return threat_count + obs_count


async def count_unified_open_signals_for_equipment(
    equipment_id: str,
    *,
    equipment_name: Optional[str] = None,
    user: Optional[dict] = None,
) -> int:
    """Count distinct open work signals for one asset (threats + observations, deduped)."""
    open_statuses = ["Open", "open", "In Progress", "in_progress", "active"]
    equipment_or: List[Dict[str, Any]] = [
        {"linked_equipment_id": equipment_id},
        {"equipment_id": equipment_id},
    ]
    if equipment_name:
        from utils.mongo_regex import exact_case_insensitive

        equipment_or.append({"asset": exact_case_insensitive(equipment_name)})
        equipment_or.append({"equipment_name": exact_case_insensitive(equipment_name)})

    mirrored = await db.observations.distinct(
        "legacy_threat_id",
        merge_tenant_filter(
            {
                "legacy_threat_id": {"$exists": True, "$ne": None},
                "$or": equipment_or,
            },
            user,
        ),
    )
    threat_query: Dict[str, Any] = merge_tenant_filter(
        {
            "status": {"$in": open_statuses},
            "$or": equipment_or,
        },
        user,
    )
    if mirrored:
        threat_query["id"] = {"$nin": [m for m in mirrored if m]}
    threat_count = await db.threats.count_documents(threat_query)
    obs_count = await db.observations.count_documents(
        merge_tenant_filter(
            {
                "status": {"$in": list(OPEN_STATUSES)},
                "$or": equipment_or,
            },
            user,
        ),
    )
    return threat_count + obs_count


async def list_unified_signals(
    *,
    user: Optional[dict] = None,
    equipment_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """Unified list across threats and observations collections (tenant-scoped)."""
    from services.work_signal_projection import normalize_work_signal

    base_threat: Dict[str, Any] = {}
    base_obs: Dict[str, Any] = {}
    if equipment_id:
        base_threat["$or"] = [
            {"linked_equipment_id": equipment_id},
            {"equipment_id": equipment_id},
        ]
        base_obs["equipment_id"] = equipment_id
    if status:
        base_threat["status"] = status
        base_obs["status"] = status

    threats = await db.threats.find(
        merge_tenant_filter(base_threat, user),
        {"_id": 0},
    ).sort("created_at", -1).to_list(limit)

    obs_query = merge_tenant_filter(base_obs, user)
    observations = await db.observations.find(
        obs_query,
        {"_id": 0},
    ).sort("created_at", -1).to_list(limit)

    mirrored_threat_ids = {o.get("legacy_threat_id") for o in observations if o.get("legacy_threat_id")}
    observation_ids = {o.get("id") for o in observations if o.get("id")}
    items: List[Dict[str, Any]] = []
    for t in threats:
        tid = t.get("id")
        if tid in mirrored_threat_ids or tid in observation_ids:
            continue
        items.append({**normalize_work_signal(t, source="observation"), "legacy_threat_id": t.get("id")})
    for o in observations:
        items.append({**normalize_work_signal(o, source="observation"), "legacy_threat_id": o.get("legacy_threat_id")})

    items.sort(key=lambda x: str(x.get("created_at") or ""), reverse=True)
    return items[:limit]
