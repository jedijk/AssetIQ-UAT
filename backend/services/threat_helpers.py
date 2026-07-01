"""Threat service — shared helpers and query utilities."""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from database import db, failure_modes_service, installation_filter
from failure_modes import FAILURE_MODES_LIBRARY
from repositories.threat_repository import ThreatRepository
from services.tenant_schema import merge_tenant_filter

logger = logging.getLogger(__name__)

_threat_repo = ThreatRepository(db)

FAILURE_MODES_BY_ID = {fm["id"]: fm for fm in FAILURE_MODES_LIBRARY if "id" in fm}
FAILURE_MODES_BY_NAME = {fm["failure_mode"].lower(): fm for fm in FAILURE_MODES_LIBRARY if "failure_mode" in fm}
_MITIGATED_THREAT_STATUSES = ["Mitigated", "mitigated"]


async def _mirror_threat_observation(user: dict, threat: dict) -> None:
    """Best-effort dual-write threat updates to observations collection."""
    try:
        from services.threat_observation_bridge import sync_threat_mirror
        await sync_threat_mirror(threat, user=user)
    except Exception as exc:
        logger.warning("Threat observation mirror failed: %s", exc)


async def _sync_threat_graph(user: dict, threat: dict, *, label: str) -> None:
    """Best-effort graph sync for UI threat CRUD paths."""
    threat_id = threat.get("id")
    if not threat_id:
        return
    try:
        from services.reliability_graph import dispatch_graph_sync
        from services.tenant_schema import tenant_id_from_user

        await dispatch_graph_sync(
            "sync_threat_edges",
            label,
            threat_id=threat_id,
            equipment_id=threat.get("linked_equipment_id"),
            failure_mode_id=threat.get("failure_mode_id"),
            tenant_id=tenant_id_from_user(user) or threat.get("tenant_id"),
        )
    except Exception as exc:
        logger.warning("Threat graph sync failed (%s): %s", label, exc)


async def _find_threat_scoped(user: dict, threat_id: str, *, projection: Optional[dict] = None) -> Optional[dict]:
    filt = merge_tenant_filter({"id": threat_id}, user)
    return await db.threats.find_one(filt, projection or {"_id": 0})


def _fm_serialized_to_threat_format(db_fm: dict) -> dict:
    effects = db_fm.get("potential_effects") or []
    causes = db_fm.get("potential_causes") or []
    return {
        "id": db_fm.get("id"),
        "failure_mode": db_fm.get("failure_mode", ""),
        "category": db_fm.get("category", ""),
        "equipment": db_fm.get("equipment", ""),
        "severity": db_fm.get("severity", 5),
        "occurrence": db_fm.get("occurrence", 5),
        "detectability": db_fm.get("detectability", 5),
        "rpn": db_fm.get("rpn", 125),
        "recommended_actions": db_fm.get("recommended_actions", []),
        "mechanism": db_fm.get("mechanism", ""),
        "effect": effects[0] if effects else db_fm.get("effect", ""),
        "cause": causes[0] if causes else db_fm.get("cause", ""),
    }


async def get_failure_mode_by_name_or_id(failure_mode_name: str = None, failure_mode_id: str = None):
    if failure_mode_id is not None:
        db_fm = await failure_modes_service.get_by_id(str(failure_mode_id))
        if db_fm:
            return _fm_serialized_to_threat_format(db_fm)
        try:
            int_id = int(failure_mode_id)
            if int_id in FAILURE_MODES_BY_ID:
                return FAILURE_MODES_BY_ID[int_id]
        except (TypeError, ValueError):
            pass
    if failure_mode_name:
        db_fm = await failure_modes_service.get_by_name(failure_mode_name)
        if db_fm:
            return _fm_serialized_to_threat_format(db_fm)
        if failure_mode_name.lower() in FAILURE_MODES_BY_NAME:
            return FAILURE_MODES_BY_NAME[failure_mode_name.lower()]
    return None


async def assert_threat_installation_scope(user: dict, threat: dict) -> None:
    eq_id = threat.get("linked_equipment_id")
    if eq_id:
        await installation_filter.assert_user_can_access_equipment(user, eq_id)
        return
    if installation_filter.is_owner(user):
        return
    if threat.get("created_by") == user.get("id"):
        return
    raise HTTPException(status_code=403, detail="Threat not in your assigned installations")


def normalize_threat_list_items(threats: List[dict]) -> List[dict]:
    total_count = len(threats)
    for idx, t in enumerate(threats):
        if isinstance(t.get("risk_score"), float):
            t["risk_score"] = int(t["risk_score"])
        try:
            t["risk_score"] = int(t["risk_score"]) if t.get("risk_score") is not None else 0
        except (TypeError, ValueError):
            t["risk_score"] = 0

        if not t.get("title"):
            desc = t.get("description") or ""
            t["title"] = desc[:120] if desc else "Observation"
        if not t.get("asset"):
            t["asset"] = t.get("asset_name") or t.get("equipment_name") or "Unlinked"
        if not t.get("failure_mode"):
            t["failure_mode"] = t.get("failure_mode_name") or "Unclassified"
        if not t.get("risk_level"):
            t["risk_level"] = t.get("severity") or "medium"
        if not t.get("status"):
            t["status"] = "Observation"
        if not t.get("created_by"):
            t["created_by"] = "unknown"

        for field, default in (
            ("equipment_type", "Equipment"),
            ("impact", "Unknown"),
            ("frequency", "Unknown"),
            ("likelihood", "Unknown"),
            ("detectability", "Unknown"),
        ):
            if not t.get(field):
                t[field] = default
        t.setdefault("rank", idx + 1)
        t.setdefault("total_threats", total_count)
        t.setdefault("recommended_actions", [])
        t.setdefault("action_plan_count", 0)
        t.setdefault("occurrence_count", 1)
        created_at = t.get("created_at")
        if not created_at:
            t["created_at"] = ""
        elif not isinstance(created_at, str):
            t["created_at"] = (
                created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at)
            )
    return threats


async def _installation_scoped_threat_query(
    user: dict,
    additional_filters: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    installation_ids = await installation_filter.get_user_installation_ids(user)
    if not installation_ids:
        return None
    equipment_ids, equipment_names = await asyncio.gather(
        installation_filter.get_scoped_equipment_ids(user),
        installation_filter.get_scoped_equipment_names(user),
    )
    query = installation_filter.build_threat_filter(
        user["id"], equipment_ids, equipment_names, additional_filters or {}
    )
    if query.get("_impossible"):
        return None
    from services.discipline_filter import apply_discipline_filter_to_query

    query = apply_discipline_filter_to_query(query, user)
    return merge_tenant_filter(query, user)


def get_threat_repo() -> ThreatRepository:
    return _threat_repo
