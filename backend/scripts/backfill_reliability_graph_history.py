#!/usr/bin/env python3
"""
Backfill historical reliability graph edges from existing MongoDB entities.

    cd backend && python scripts/backfill_reliability_graph_history.py --dry-run
    cd backend && MONGO_URL=... DB_NAME=assetiq-UAT python scripts/backfill_reliability_graph_history.py --phase maintenance
    cd backend && MONGO_URL=... python scripts/backfill_reliability_graph_history.py --equipment-id eq-123 --limit 50
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Coroutine, Dict, List, Optional, Set, Tuple

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

logger = logging.getLogger(__name__)

PHASE_CHOICES = ("maintenance", "reactive", "all")
COMPLETED_SCHEDULED_STATUSES = frozenset({"completed"})
CANCELLED_SCHEDULED_STATUSES = frozenset({"cancelled"})
TERMINAL_ACTION_STATUSES = frozenset({"completed", "closed"})


@dataclass
class PhaseStats:
    scanned: int = 0
    synced: int = 0
    skipped: int = 0
    errors: int = 0
    error_samples: List[str] = field(default_factory=list)

    def record_error(self, message: str, *, max_samples: int = 20) -> None:
        self.errors += 1
        if len(self.error_samples) < max_samples:
            self.error_samples.append(message)
        logger.error(message)


@dataclass
class BackfillConfig:
    dry_run: bool = False
    phase: str = "all"
    equipment_id: Optional[str] = None
    batch_size: int = 100
    limit: Optional[int] = None


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill reliability graph edges from historical entities",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Log planned sync calls without writing",
    )
    parser.add_argument(
        "--phase",
        choices=PHASE_CHOICES,
        default="all",
        help="Which entity groups to backfill (default: all)",
    )
    parser.add_argument(
        "--equipment-id",
        dest="equipment_id",
        default=None,
        help="Limit backfill to a single equipment id",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Mongo cursor batch size (default: 100)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max entities per collection (UAT sampling)",
    )
    return parser.parse_args(argv)


def config_from_args(args: argparse.Namespace) -> BackfillConfig:
    return BackfillConfig(
        dry_run=args.dry_run,
        phase=args.phase,
        equipment_id=args.equipment_id,
        batch_size=max(1, args.batch_size),
        limit=args.limit if args.limit and args.limit > 0 else None,
    )


def should_run_phase(config: BackfillConfig, phase_name: str) -> bool:
    return config.phase in ("all", phase_name)


def scheduled_task_event(status: Optional[str]) -> str:
    normalized = (status or "").strip().lower()
    if normalized in COMPLETED_SCHEDULED_STATUSES:
        return "completed"
    if normalized in CANCELLED_SCHEDULED_STATUSES:
        return "cancelled"
    return "created"


def _tenant_id(doc: Dict[str, Any]) -> Optional[str]:
    return doc.get("tenant_id") or doc.get("company_id")


def _equipment_filter(config: BackfillConfig) -> Dict[str, Any]:
    if config.equipment_id:
        return {"equipment_id": config.equipment_id}
    return {}


async def _load_equipment_cache(
    db,
    config: BackfillConfig,
) -> Dict[str, Dict[str, Optional[str]]]:
    query: Dict[str, Any] = {}
    if config.equipment_id:
        query["id"] = config.equipment_id
    nodes: Dict[str, Dict[str, Any]] = {}
    async for eq in db.equipment_nodes.find(
        query,
        {"id": 1, "equipment_type_id": 1, "tenant_id": 1, "company_id": 1, "parent_id": 1},
    ):
        eq_id = eq.get("id")
        if not eq_id:
            continue
        nodes[eq_id] = eq

    def resolve_equipment_type_id(eq_id: str) -> Optional[str]:
        seen: Set[str] = set()
        current = eq_id
        while current and current not in seen:
            seen.add(current)
            node = nodes.get(current)
            if not node:
                return None
            et_id = node.get("equipment_type_id")
            if et_id:
                return et_id
            current = node.get("parent_id")
        return None

    cache: Dict[str, Dict[str, Optional[str]]] = {}
    for eq_id, eq in nodes.items():
        cache[eq_id] = {
            "equipment_type_id": resolve_equipment_type_id(eq_id),
            "tenant_id": _tenant_id(eq),
        }
    return cache


async def _action_equipment_id(db, action: Dict[str, Any]) -> Optional[str]:
    eq_id = action.get("linked_equipment_id")
    if eq_id:
        return eq_id
    source_type = action.get("source_type")
    source_id = action.get("source_id")
    if source_type == "threat" and source_id:
        threat = await db.threats.find_one({"id": source_id}, {"linked_equipment_id": 1})
        return (threat or {}).get("linked_equipment_id")
    if source_type == "investigation" and source_id:
        inv = await db.investigations.find_one({"id": source_id}, {"asset_id": 1})
        return (inv or {}).get("asset_id")
    threat_id = action.get("threat_id")
    if threat_id:
        threat = await db.threats.find_one({"id": threat_id}, {"linked_equipment_id": 1})
        return (threat or {}).get("linked_equipment_id")
    return None


async def _has_action_outcome_edge(db, action_id: str) -> bool:
    from services.reliability_graph import COLLECTION, EDGE_STATUS_ACTIVE

    existing = await db[COLLECTION].find_one(
        {
            "source_type": "action",
            "source_id": action_id,
            "relation": "resulted_in",
            "status": EDGE_STATUS_ACTIVE,
        },
        {"_id": 1},
    )
    return existing is not None


async def _run_sync(
    *,
    config: BackfillConfig,
    stats: PhaseStats,
    entity_id: str,
    label: str,
    coro_factory: Callable[[], Coroutine[Any, Any, Any]],
) -> None:
    stats.scanned += 1
    if config.dry_run:
        print(f"[dry-run] {label} entity_id={entity_id}")
        stats.synced += 1
        return
    try:
        await coro_factory()
        stats.synced += 1
    except Exception as exc:
        stats.record_error(f"{label} entity_id={entity_id}: {exc}")


async def backfill_maintenance_programs(
    db,
    config: BackfillConfig,
    equipment_cache: Dict[str, Dict[str, Optional[str]]],
) -> PhaseStats:
    from services.reliability_graph import sync_edges_for_apply_strategy

    stats = PhaseStats()
    query = _equipment_filter(config)
    cursor = db.maintenance_programs_v2.find(query, {"_id": 0}).batch_size(config.batch_size)
    if config.limit:
        cursor = cursor.limit(config.limit)

    groups: Dict[Tuple[str, str, Optional[str]], Set[str]] = defaultdict(set)

    async for program in cursor:
        equipment_id = program.get("equipment_id")
        if not equipment_id:
            stats.skipped += 1
            continue
        eq_info = equipment_cache.get(equipment_id, {})
        equipment_type_id = eq_info.get("equipment_type_id") or program.get("equipment_type_id")
        if not equipment_type_id:
            stats.skipped += 1
            continue
        strategy_version = (
            program.get("source_strategy_version")
            or program.get("applied_strategy_version")
            or "1.0"
        )
        tenant_id = _tenant_id(program) or eq_info.get("tenant_id")
        key = (equipment_type_id, strategy_version, tenant_id)
        groups[key].add(equipment_id)

    for (equipment_type_id, strategy_version, tenant_id), equipment_ids in groups.items():
        sorted_ids = sorted(equipment_ids)
        label = (
            f"sync_edges_for_apply_strategy equipment_type_id={equipment_type_id} "
            f"strategy_version={strategy_version} equipment_ids={sorted_ids}"
        )
        stats.scanned += len(sorted_ids)
        if config.dry_run:
            for eq_id in sorted_ids:
                print(f"[dry-run] {label} entity_id={eq_id}")
            stats.synced += len(sorted_ids)
            continue
        try:
            await sync_edges_for_apply_strategy(
                equipment_type_id=equipment_type_id,
                equipment_ids=sorted_ids,
                strategy_version=strategy_version,
                tenant_id=tenant_id,
            )
            stats.synced += len(sorted_ids)
        except Exception as exc:
            stats.record_error(f"{label}: {exc}")

    return stats


async def backfill_scheduled_tasks(db, config: BackfillConfig) -> PhaseStats:
    from services.reliability_graph import sync_edges_for_scheduled_task

    stats = PhaseStats()
    query = _equipment_filter(config)
    cursor = db.scheduled_tasks.find(query, {"_id": 0}).batch_size(config.batch_size)
    if config.limit:
        cursor = cursor.limit(config.limit)

    async for task in cursor:
        task_id = task.get("id")
        if not task_id:
            stats.skipped += 1
            continue
        if stats.scanned > 0 and stats.scanned % 100 == 0:
            logger.info(
                "backfill scheduled_tasks progress: scanned=%s synced=%s errors=%s",
                stats.scanned,
                stats.synced,
                stats.errors,
            )
        event = scheduled_task_event(task.get("status"))
        tenant_id = _tenant_id(task)
        label = f"sync_edges_for_scheduled_task event={event}"

        async def _sync(task_doc=task, ev=event, tid=tenant_id) -> None:
            await sync_edges_for_scheduled_task(task_doc, event=ev, tenant_id=tid)

        await _run_sync(
            config=config,
            stats=stats,
            entity_id=task_id,
            label=label,
            coro_factory=_sync,
        )

    return stats


async def backfill_task_instances(db, config: BackfillConfig) -> PhaseStats:
    from services.reliability_graph import sync_task_instance_completion_edges

    stats = PhaseStats()
    query: Dict[str, Any] = {"status": "completed", **_equipment_filter(config)}
    cursor = db.task_instances.find(query, {"_id": 0}).batch_size(config.batch_size)
    if config.limit:
        cursor = cursor.limit(config.limit)

    async for instance in cursor:
        ti_id = instance.get("id") or str(instance.get("_id", ""))
        if not ti_id:
            stats.skipped += 1
            continue
        equipment_id = instance.get("equipment_id")
        failure_mode_id = instance.get("failure_mode_id")
        if not failure_mode_id:
            failure_mode_id = (instance.get("metadata") or {}).get("failure_mode_id")
        completed_at = instance.get("completed_at")
        if isinstance(completed_at, str):
            completed_at_str = completed_at
        elif completed_at:
            completed_at_str = completed_at.isoformat()
        else:
            completed_at_str = ""
        tenant_id = _tenant_id(instance)
        label = "sync_task_instance_completion_edges"

        async def _sync(
            task_instance_id=ti_id,
            eq_id=equipment_id,
            fm_id=failure_mode_id,
            sched_id=instance.get("scheduled_task_id"),
            completed=completed_at_str,
            tid=tenant_id,
        ) -> None:
            await sync_task_instance_completion_edges(
                task_instance_id=task_instance_id,
                equipment_id=eq_id,
                failure_mode_id=fm_id,
                scheduled_task_id=sched_id,
                completed_at=completed or "",
                tenant_id=tid,
                findings_text=None,
            )

        await _run_sync(
            config=config,
            stats=stats,
            entity_id=ti_id,
            label=label,
            coro_factory=_sync,
        )

    return stats


async def backfill_pm_import_tasks(
    db,
    config: BackfillConfig,
    equipment_cache: Dict[str, Dict[str, Optional[str]]],
) -> PhaseStats:
    """Backfill pm_import_task → program_task and applied_to edges from programs and sessions."""
    from services.reliability_graph import (
        sync_edge_for_pm_import_task,
        sync_pm_import_program_task_links,
    )
    from services.pm_import_constants import is_pm_import_review_accepted

    stats = PhaseStats()
    seen_links: Set[Tuple[str, str]] = set()

    query = _equipment_filter(config)
    cursor = db.maintenance_programs_v2.find(query, {"_id": 0}).batch_size(config.batch_size)
    if config.limit:
        cursor = cursor.limit(config.limit)

    async for program in cursor:
        equipment_id = program.get("equipment_id")
        if not equipment_id:
            continue
        eq_info = equipment_cache.get(equipment_id, {})
        equipment_type_id = eq_info.get("equipment_type_id")
        tenant_id = _tenant_id(program) or eq_info.get("tenant_id")

        for task in program.get("tasks") or []:
            task_id = task.get("id")
            trace = task.get("traceability") or {}
            pm_ref = trace.get("pm_import_task_id")
            if not task_id or not pm_ref:
                continue
            link_key = (str(pm_ref), str(task_id))
            if link_key in seen_links:
                continue
            seen_links.add(link_key)

            fm_id = trace.get("failure_mode_id")
            label = "sync_pm_import_program_task_links"

            async def _sync(
                pm_id=pm_ref,
                prog_id=task_id,
                fm=fm_id,
                eq_id=equipment_id,
                et_id=equipment_type_id,
                tid=tenant_id,
            ) -> None:
                await sync_pm_import_program_task_links(
                    pm_import_task_id=str(pm_id),
                    program_task_id=str(prog_id),
                    failure_mode_id=fm,
                    equipment_id=eq_id,
                    equipment_type_id=et_id,
                    tenant_id=tid,
                    apply_mode="backfill_program",
                )

            await _run_sync(
                config=config,
                stats=stats,
                entity_id=f"{pm_ref}->{task_id}",
                label=label,
                coro_factory=_sync,
            )

    session_cursor = db.pm_import_sessions.find({}, {"_id": 0}).batch_size(config.batch_size)
    if config.limit:
        session_cursor = session_cursor.limit(config.limit)

    async for session in session_cursor:
        session_id = session.get("session_id") or session.get("id")
        if not session_id:
            continue
        tenant_id = _tenant_id(session)

        for pm_task in session.get("tasks") or []:
            if not is_pm_import_review_accepted(pm_task):
                continue
            task_id = pm_task.get("task_id") or pm_task.get("id")
            if not task_id:
                continue
            pm_ref = f"{session_id}:{task_id}"
            fm_id = (
                pm_task.get("target_failure_mode_id")
                or pm_task.get("matched_failure_mode_id")
                or pm_task.get("failure_mode_id")
            )
            if not fm_id:
                continue

            equip_match = pm_task.get("equipment_match") or {}
            equipment_id = equip_match.get("equipment_id") or pm_task.get("equipment_id")
            if config.equipment_id and equipment_id != config.equipment_id:
                continue

            eq_info = equipment_cache.get(equipment_id or "", {})
            label = "sync_edge_for_pm_import_task"

            async def _sync_applied(
                ref=pm_ref,
                fm=str(fm_id),
                eq_id=equipment_id,
                et_id=equip_match.get("equipment_type_id"),
                tid=tenant_id,
            ) -> None:
                await sync_edge_for_pm_import_task(
                    task_id=ref,
                    failure_mode_id=fm,
                    equipment_id=eq_id,
                    equipment_type_id=et_id,
                    apply_mode="backfill_session",
                    tenant_id=tid,
                )

            await _run_sync(
                config=config,
                stats=stats,
                entity_id=pm_ref,
                label=label,
                coro_factory=_sync_applied,
            )

    return stats


async def backfill_observations(db, config: BackfillConfig) -> PhaseStats:
    from services.reliability_graph import sync_observation_edges

    stats = PhaseStats()
    query = _equipment_filter(config)
    cursor = db.observations.find(query).batch_size(config.batch_size)
    if config.limit:
        cursor = cursor.limit(config.limit)

    async for obs in cursor:
        obs_id = obs.get("id") or str(obs.get("_id", ""))
        if not obs_id:
            stats.skipped += 1
            continue
        tenant_id = _tenant_id(obs)
        label = "sync_observation_edges"

        async def _sync(
            observation_id=obs_id,
            equipment_id=obs.get("equipment_id"),
            failure_mode_id=obs.get("failure_mode_id"),
            threat_id=obs.get("threat_id"),
            finding_id=obs.get("finding_id"),
            tid=tenant_id,
        ) -> None:
            await sync_observation_edges(
                observation_id=observation_id,
                equipment_id=equipment_id,
                failure_mode_id=failure_mode_id,
                threat_id=threat_id,
                finding_id=finding_id,
                tenant_id=tid,
            )

        await _run_sync(
            config=config,
            stats=stats,
            entity_id=obs_id,
            label=label,
            coro_factory=_sync,
        )

    return stats


async def backfill_threats(db, config: BackfillConfig) -> PhaseStats:
    from services.reliability_graph import sync_threat_edges

    stats = PhaseStats()
    query: Dict[str, Any] = {}
    if config.equipment_id:
        query["linked_equipment_id"] = config.equipment_id
    cursor = db.threats.find(query, {"_id": 0}).batch_size(config.batch_size)
    if config.limit:
        cursor = cursor.limit(config.limit)

    async for threat in cursor:
        threat_id = threat.get("id")
        if not threat_id:
            stats.skipped += 1
            continue
        tenant_id = _tenant_id(threat)
        label = "sync_threat_edges"

        async def _sync(
            tid=threat_id,
            equipment_id=threat.get("linked_equipment_id"),
            failure_mode_id=threat.get("failure_mode_id"),
            observation_id=threat.get("observation_id"),
            tenant=tenant_id,
        ) -> None:
            await sync_threat_edges(
                threat_id=tid,
                equipment_id=equipment_id,
                failure_mode_id=failure_mode_id,
                observation_id=observation_id,
                tenant_id=tenant,
            )

        await _run_sync(
            config=config,
            stats=stats,
            entity_id=threat_id,
            label=label,
            coro_factory=_sync,
        )

    return stats


async def backfill_investigations(db, config: BackfillConfig) -> PhaseStats:
    from services.reliability_graph import sync_investigation_edges

    stats = PhaseStats()
    query: Dict[str, Any] = {"threat_id": {"$exists": True, "$ne": None}}
    if config.equipment_id:
        query["asset_id"] = config.equipment_id
    cursor = db.investigations.find(query, {"_id": 0}).batch_size(config.batch_size)
    if config.limit:
        cursor = cursor.limit(config.limit)

    async for inv in cursor:
        inv_id = inv.get("id")
        threat_id = inv.get("threat_id")
        if not inv_id or not threat_id:
            stats.skipped += 1
            continue
        tenant_id = _tenant_id(inv)
        label = "sync_investigation_edges"

        async def _sync(
            investigation_id=inv_id,
            th_id=threat_id,
            equipment_id=inv.get("asset_id"),
            tid=tenant_id,
        ) -> None:
            await sync_investigation_edges(
                investigation_id=investigation_id,
                threat_id=th_id,
                equipment_id=equipment_id,
                tenant_id=tid,
            )

        await _run_sync(
            config=config,
            stats=stats,
            entity_id=inv_id,
            label=label,
            coro_factory=_sync,
        )

    return stats


async def backfill_causes(db, config: BackfillConfig) -> PhaseStats:
    from services.reliability_graph import sync_cause_edge

    stats = PhaseStats()
    query: Dict[str, Any] = {}
    if config.equipment_id:
        inv_ids = await db.investigations.distinct(
            "id",
            {"asset_id": config.equipment_id},
        )
        if not inv_ids:
            return stats
        query["investigation_id"] = {"$in": inv_ids}
    cursor = db.cause_nodes.find(query, {"_id": 0}).batch_size(config.batch_size)
    if config.limit:
        cursor = cursor.limit(config.limit)

    investigation_cache: Dict[str, Optional[str]] = {}

    async for cause in cursor:
        cause_id = cause.get("id")
        inv_id = cause.get("investigation_id")
        if not cause_id or not inv_id:
            stats.skipped += 1
            continue
        if inv_id not in investigation_cache:
            inv = await db.investigations.find_one({"id": inv_id}, {"asset_id": 1})
            investigation_cache[inv_id] = (inv or {}).get("asset_id")
        equipment_id = investigation_cache[inv_id]
        tenant_id = _tenant_id(cause)
        label = "sync_cause_edge"

        async def _sync(
            investigation_id=inv_id,
            c_id=cause_id,
            eq_id=equipment_id,
            is_root=bool(cause.get("is_root_cause")),
            tid=tenant_id,
        ) -> None:
            await sync_cause_edge(
                investigation_id=investigation_id,
                cause_id=c_id,
                equipment_id=eq_id,
                is_root_cause=is_root,
                tenant_id=tid,
            )

        await _run_sync(
            config=config,
            stats=stats,
            entity_id=cause_id,
            label=label,
            coro_factory=_sync,
        )

    return stats


async def backfill_actions(db, config: BackfillConfig) -> PhaseStats:
    from services.reliability_graph import sync_action_edges, sync_outcome_edges

    stats = PhaseStats()
    query: Dict[str, Any] = {}
    if config.equipment_id:
        query["linked_equipment_id"] = config.equipment_id
    cursor = db.central_actions.find(query, {"_id": 0}).batch_size(config.batch_size)
    if config.limit:
        cursor = cursor.limit(config.limit)

    async for action in cursor:
        action_id = action.get("id")
        source_type = action.get("source_type")
        source_id = action.get("source_id")
        if not action_id or not source_type or not source_id:
            stats.skipped += 1
            continue

        equipment_id = await _action_equipment_id(db, action)
        tenant_id = _tenant_id(action)
        label = "sync_action_edges"

        async def _sync_action(
            a_id=action_id,
            src_type=source_type,
            src_id=source_id,
            eq_id=equipment_id,
            tid=tenant_id,
        ) -> None:
            await sync_action_edges(
                action_id=a_id,
                source_type=src_type,
                source_id=src_id,
                equipment_id=eq_id,
                tenant_id=tid,
            )

        await _run_sync(
            config=config,
            stats=stats,
            entity_id=action_id,
            label=label,
            coro_factory=_sync_action,
        )

        status = (action.get("status") or "").strip().lower()
        if status not in TERMINAL_ACTION_STATUSES:
            continue
        if not equipment_id:
            stats.skipped += 1
            continue
        if await _has_action_outcome_edge(db, action_id):
            stats.skipped += 1
            continue

        outcome_label = "sync_outcome_edges"

        async def _sync_outcome(
            a_id=action_id,
            eq_id=equipment_id,
            effectiveness=action.get("completion_notes"),
            tid=tenant_id,
        ) -> None:
            await sync_outcome_edges(
                action_id=a_id,
                outcome_id=str(uuid.uuid4()),
                equipment_id=eq_id,
                verification_status="verified",
                effectiveness=effectiveness,
                tenant_id=tid,
            )

        await _run_sync(
            config=config,
            stats=stats,
            entity_id=action_id,
            label=outcome_label,
            coro_factory=_sync_outcome,
        )

    return stats


def _print_phase_summary(name: str, stats: PhaseStats) -> None:
    print(
        f"  {name}: scanned={stats.scanned} synced={stats.synced} "
        f"skipped={stats.skipped} errors={stats.errors}"
    )
    for sample in stats.error_samples:
        print(f"    error: {sample}")


async def run_backfill(db, config: BackfillConfig) -> Dict[str, PhaseStats]:
    from services.reliability_graph import ensure_reliability_graph_indexes

    if not config.dry_run:
        await ensure_reliability_graph_indexes(db)

    equipment_cache = await _load_equipment_cache(db, config)
    summaries: Dict[str, PhaseStats] = {}

    if should_run_phase(config, "maintenance"):
        print("Phase: maintenance")
        summaries["maintenance_programs_v2"] = await backfill_maintenance_programs(
            db, config, equipment_cache
        )
        _print_phase_summary("maintenance_programs_v2", summaries["maintenance_programs_v2"])

        summaries["scheduled_tasks"] = await backfill_scheduled_tasks(db, config)
        _print_phase_summary("scheduled_tasks", summaries["scheduled_tasks"])

        summaries["task_instances"] = await backfill_task_instances(db, config)
        _print_phase_summary("task_instances", summaries["task_instances"])

        summaries["pm_import_tasks"] = await backfill_pm_import_tasks(
            db, config, equipment_cache
        )
        _print_phase_summary("pm_import_tasks", summaries["pm_import_tasks"])

    if should_run_phase(config, "reactive"):
        print("Phase: reactive")
        summaries["observations"] = await backfill_observations(db, config)
        _print_phase_summary("observations", summaries["observations"])

        summaries["threats"] = await backfill_threats(db, config)
        _print_phase_summary("threats", summaries["threats"])

        summaries["investigations"] = await backfill_investigations(db, config)
        _print_phase_summary("investigations", summaries["investigations"])

        summaries["cause_nodes"] = await backfill_causes(db, config)
        _print_phase_summary("cause_nodes", summaries["cause_nodes"])

        summaries["central_actions"] = await backfill_actions(db, config)
        _print_phase_summary("central_actions", summaries["central_actions"])

    return summaries


async def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = parse_args()
    config = config_from_args(args)

    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        print("MONGO_URL required", file=sys.stderr)
        return 2

    db_name = os.environ.get("DB_NAME", "assetiq-UAT").strip('"')
    from motor.motor_asyncio import AsyncIOMotorClient

    import database

    client = AsyncIOMotorClient(mongo_url)
    database.db = client[db_name]
    db = database.db

    print(f"Database: {db_name}")
    print(f"Phase: {config.phase}")
    print(f"Dry run: {config.dry_run}")
    if config.equipment_id:
        print(f"Equipment filter: {config.equipment_id}")
    if config.limit:
        print(f"Per-collection limit: {config.limit}")

    summaries = await run_backfill(db, config)

    total_errors = sum(s.errors for s in summaries.values())
    total_synced = sum(s.synced for s in summaries.values())
    print(
        f"Backfill complete: synced={total_synced} errors={total_errors} "
        f"dry_run={config.dry_run}"
    )
    if config.dry_run:
        print("Re-run without --dry-run to apply changes.")

    client.close()
    return 1 if total_errors else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
