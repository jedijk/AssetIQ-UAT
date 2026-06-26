"""Materialized insights summary snapshots — Platform 1.0 WS6."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from database import db
from services.tenant_schema import tenant_id_from_user
from services.tenant_scope import scoped

logger = logging.getLogger(__name__)

SNAPSHOT_TTL_SECONDS = 600
COLLECTION = "insights_summary_snapshots"


async def compute_insights_summary(user: dict) -> Dict[str, Any]:
    """Aggregate insights summary from operational collections (materializer only)."""
    try:
        async def fetch_summary():
            total_actions_task = db.central_actions.count_documents(scoped(user))
            actions_alt_task = db.actions.count_documents(scoped(user))
            completed_actions_task = db.central_actions.count_documents(scoped(user, {
                "status": {"$in": ["completed", "Completed", "done", "Done", "closed", "Closed"]}
            }))
            completed_actions_alt_task = db.actions.count_documents(scoped(user, {
                "status": {"$in": ["completed", "Completed", "done", "Done", "closed", "Closed"]}
            }))
            total_equipment_task = db.equipment_nodes.count_documents(scoped(user))
            equipment_with_criticality_task = db.equipment_nodes.count_documents(scoped(user, {
                "$or": [
                    {"criticality": {"$exists": True, "$nin": [None, ""]}},
                    {"criticality_score": {"$exists": True, "$ne": None}},
                ]
            }))
            equipment_with_type_task = db.equipment_nodes.count_documents(scoped(user, {
                "$or": [
                    {"equipment_type_id": {"$exists": True, "$nin": [None, ""]}},
                    {"type": {"$exists": True, "$nin": [None, ""]}},
                ]
            }))
            fmea_count_task = db.failure_modes.count_documents(scoped(user))
            threats_count_task = db.threats.count_documents(scoped(user))

            (
                total_actions,
                total_actions_alt,
                completed_actions,
                completed_actions_alt,
                total_equipment,
                equipment_with_criticality,
                equipment_with_type,
                fmea_count,
                threats_count,
            ) = await asyncio.gather(
                total_actions_task,
                actions_alt_task,
                completed_actions_task,
                completed_actions_alt_task,
                total_equipment_task,
                equipment_with_criticality_task,
                equipment_with_type_task,
                fmea_count_task,
                threats_count_task,
            )

            total_actions = total_actions + total_actions_alt
            completed_actions = completed_actions + completed_actions_alt
            success_rate = round((completed_actions / total_actions * 100), 1) if total_actions > 0 else 0

            if total_equipment > 0:
                crit_pct = (equipment_with_criticality / total_equipment * 100)
                fmea_linked_types = set(await db.failure_modes.distinct("equipment_type_ids", scoped(user)))
                fmea_linked_types.discard(None)
                fmea_linked_types.discard("")
                assets_with_fmea = await db.equipment_nodes.count_documents(scoped(user, {
                    "equipment_type_id": {"$in": list(fmea_linked_types)}
                })) if fmea_linked_types else 0
                fmea_pct = (assets_with_fmea / total_equipment * 100)
                type_pct = (equipment_with_type / total_equipment * 100)
                completeness_score = round((crit_pct + fmea_pct + type_pct) / 3, 1)
            else:
                completeness_score = 0

            actions_with_obs = await db.central_actions.count_documents(scoped(user, {
                "$or": [
                    {"observation_id": {"$exists": True, "$ne": None}},
                    {"threat_id": {"$exists": True, "$ne": None}},
                ]
            }))
            obs_without_actions_estimate = max(0, threats_count - actions_with_obs)
            critical_equipment = await db.equipment_nodes.count_documents(scoped(user, {
                "$or": [
                    {"criticality": {"$in": ["high", "High", "critical", "Critical", "a", "A", "1"]}},
                    {"criticality_score": {"$gte": 8}},
                ]
            }))
            critical_gaps = 0
            if obs_without_actions_estimate > 10:
                critical_gaps += 1
            if critical_equipment > fmea_count:
                critical_gaps += 1

            failed_actions = await db.central_actions.count_documents(scoped(user, {
                "status": {"$in": ["failed", "Failed", "cancelled", "Cancelled", "rejected", "Rejected"]}
            }))
            bad_actors_estimate = (
                1 if (failed_actions > 0 and total_actions > 0 and (failed_actions / total_actions * 100) > 15)
                else 0
            )

            return {
                "execution_success_rate": success_rate,
                "data_completeness_score": completeness_score,
                "bad_actors_count": bad_actors_estimate,
                "critical_gaps_count": critical_gaps,
                "total_actions": total_actions,
                "total_assets": total_equipment,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }

        return await asyncio.wait_for(fetch_summary(), timeout=10.0)
    except asyncio.TimeoutError:
        logger.error("Insights summary materializer timeout")
        return {
            "execution_success_rate": 0,
            "data_completeness_score": 0,
            "bad_actors_count": 0,
            "critical_gaps_count": 0,
            "total_actions": 0,
            "total_assets": 0,
            "error": "timeout",
        }
    except Exception as exc:
        logger.error("Insights summary materializer error: %s", exc)
        return {
            "execution_success_rate": 0,
            "data_completeness_score": 0,
            "bad_actors_count": 0,
            "critical_gaps_count": 0,
            "total_actions": 0,
            "total_assets": 0,
            "error": str(exc),
        }


async def get_cached_insights_summary(user: dict) -> Optional[Dict[str, Any]]:
    tid = tenant_id_from_user(user)
    if not tid:
        return None
    doc = await db[COLLECTION].find_one(
        {
            "tenant_id": tid,
            "expires_at": {"$gt": datetime.now(timezone.utc).isoformat()},
        },
        {"_id": 0, "payload": 1},
    )
    return doc.get("payload") if doc else None


async def refresh_insights_summary(user: dict) -> Dict[str, Any]:
    payload = await compute_insights_summary(user)
    tid = tenant_id_from_user(user)
    if tid:
        expires_at = (
            datetime.now(timezone.utc) + timedelta(seconds=SNAPSHOT_TTL_SECONDS)
        ).isoformat()
        await db[COLLECTION].update_one(
            {"tenant_id": tid},
            {
                "$set": {
                    "tenant_id": tid,
                    "payload": payload,
                    "expires_at": expires_at,
                    "refreshed_at": payload.get("generated_at"),
                }
            },
            upsert=True,
        )
    return payload


async def get_or_compute_insights_summary(user: dict) -> Dict[str, Any]:
    cached = await get_cached_insights_summary(user)
    if cached:
        return cached
    return await refresh_insights_summary(user)
