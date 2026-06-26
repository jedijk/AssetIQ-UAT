"""
Reliability graph performance benchmarks — Platform 1.0 WS7 (runtime runner).
"""
from __future__ import annotations

import time
import tracemalloc
from datetime import datetime, timezone
from typing import Any, Dict, List, Sequence

from services.reliability_graph_benchmark_lib import (
    BENCHMARK_SCALES,
    BENCHMARK_USER_ID,
    BULK_INSERT_BATCH,
    EDGE_COLLECTION,
    BenchmarkReport,
    LatencyStats,
    ScenarioResult,
    benchmark_tenant_id,
    benchmark_user,
    build_optimization_recommendations,
    edges_for_asset,
    format_markdown_report,
    int_stats,
    latency_stats,
    sample_equipment_ids,
)


def _db():
    from database import db

    return db


async def clear_benchmark_tenant(tenant_id: str) -> Dict[str, int]:
    db = _db()
    edge_result = await db[EDGE_COLLECTION].delete_many({"tenant_id": tenant_id})
    equip_result = await db.equipment_nodes.delete_many({"tenant_id": tenant_id})
    return {
        "edges_deleted": edge_result.deleted_count,
        "equipment_deleted": equip_result.deleted_count,
    }


async def seed_benchmark_graph(
    scale: int,
    *,
    density: str = "sparse",
    force: bool = False,
) -> Dict[str, Any]:
    tenant_id = benchmark_tenant_id(scale)
    db = _db()
    if force:
        await clear_benchmark_tenant(tenant_id)

    existing = await db[EDGE_COLLECTION].count_documents({"tenant_id": tenant_id})
    if existing > 0:
        return {
            "tenant_id": tenant_id,
            "asset_count": scale,
            "edge_count": existing,
            "seeded": False,
            "message": "tenant already seeded; pass force=True to rebuild",
        }

    now = datetime.now(timezone.utc).isoformat()
    batch: List[dict] = []
    total_edges = 0

    for asset_index in range(scale):
        batch.extend(
            edges_for_asset(
                tenant_id=tenant_id,
                asset_index=asset_index,
                density=density,
                now=now,
            )
        )
        if len(batch) >= BULK_INSERT_BATCH:
            await db[EDGE_COLLECTION].insert_many(batch, ordered=False)
            total_edges += len(batch)
            batch.clear()

    if batch:
        await db[EDGE_COLLECTION].insert_many(batch, ordered=False)
        total_edges += len(batch)

    equip_batch: List[dict] = []
    for asset_index in range(scale):
        eq_id = f"bench-eq-{asset_index}"
        equip_batch.append({
            "id": eq_id,
            "tenant_id": tenant_id,
            "name": f"Benchmark Asset {asset_index}",
            "tag": f"B-{asset_index:05d}",
            "equipment_type_id": f"bench-et-{asset_index % 50}",
            "criticality": "medium",
            "created_by": BENCHMARK_USER_ID,
        })
        if len(equip_batch) >= BULK_INSERT_BATCH:
            await db.equipment_nodes.insert_many(equip_batch, ordered=False)
            equip_batch.clear()
    if equip_batch:
        await db.equipment_nodes.insert_many(equip_batch, ordered=False)

    return {
        "tenant_id": tenant_id,
        "asset_count": scale,
        "edge_count": total_edges,
        "density": density,
        "seeded": True,
    }


async def _timed_call(coro) -> tuple[Any, float, int, float]:
    from services.reliability_graph_core import (
        graph_query_count,
        reset_graph_query_counter,
        restore_graph_query_counter,
    )

    token = reset_graph_query_counter()
    tracemalloc.start()
    started = time.perf_counter()
    try:
        result = await coro
    finally:
        elapsed_ms = (time.perf_counter() - started) * 1000
        queries = graph_query_count()
        _, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        restore_graph_query_counter(token)
    return result, elapsed_ms, queries, peak / 1024


async def _run_scenario(
    name: str,
    equipment_ids: Sequence[str],
    user: dict,
    runner,
    *,
    notes: str = "",
) -> ScenarioResult:
    from services.reliability_graph_query import GraphTraversalService

    latencies: List[float] = []
    query_counts: List[int] = []
    nodes_visited: List[int] = []
    edge_counts: List[int] = []
    peak_memory_kb = 0.0

    traversal = GraphTraversalService()
    for equipment_id in equipment_ids:
        result, elapsed_ms, queries, peak_kb = await _timed_call(
            runner(traversal, equipment_id, user)
        )
        latencies.append(elapsed_ms)
        query_counts.append(queries)
        peak_memory_kb = max(peak_memory_kb, peak_kb)
        if isinstance(result, dict):
            nodes_visited.append(int(result.get("nodes_visited") or 0))
            edge_counts.append(int(result.get("edge_count") or len(result.get("edges") or [])))
        elif isinstance(result, list):
            edge_counts.append(len(result))

    return ScenarioResult(
        name=name,
        latency_ms=latency_stats(latencies),
        mongo_queries=int_stats(query_counts),
        nodes_visited=int_stats(nodes_visited),
        edge_count=int_stats(edge_counts),
        peak_memory_kb=round(peak_memory_kb, 1),
        notes=notes,
    )


async def run_benchmark(
    scale: int,
    *,
    sample_size: int = 20,
    density: str = "sparse",
    seed: bool = True,
    force_seed: bool = False,
) -> BenchmarkReport:
    from services.reliability_graph import get_edges_for_equipment
    from services.reliability_graph_core import reset_graph_query_counter, restore_graph_query_counter
    from services.reliability_graph_query import count_edges_by_relation, get_graph_topology_stats

    tenant_id = benchmark_tenant_id(scale)
    user = benchmark_user(tenant_id)
    db = _db()

    if seed:
        await seed_benchmark_graph(scale, density=density, force=force_seed)

    equipment_ids = sample_equipment_ids(scale, sample_size)
    report = BenchmarkReport(
        scale=scale,
        tenant_id=tenant_id,
        generated_at=datetime.now(timezone.utc).isoformat(),
        asset_count=scale,
        sample_size=len(equipment_ids),
        density=density,
    )

    report.edge_count = await db[EDGE_COLLECTION].count_documents({"tenant_id": tenant_id})

    report.scenarios.append(
        await _run_scenario(
            "get_edges_for_equipment",
            equipment_ids,
            user,
            lambda _t, eq_id, u: get_edges_for_equipment(eq_id, limit=200, tenant_id=u["company_id"]),
            notes="Single indexed find per asset",
        )
    )

    async def _chain(trav, eq_id, u):
        return await trav.get_chain(eq_id, depth=5, edge_limit=200, user=u)

    report.scenarios.append(
        await _run_scenario("get_chain_bfs", equipment_ids, user, _chain, notes="Bounded BFS depth=5")
    )

    async def _explain(trav, eq_id, u):
        return await trav.explain_risk(eq_id, user=u)

    report.scenarios.append(
        await _run_scenario(
            "explain_risk_ai",
            equipment_ids,
            user,
            _explain,
            notes="BFS + threats find + PM count",
        )
    )

    async def _trace(trav, eq_id, u):
        upstream = await trav.get_upstream("equipment", eq_id, depth=8, user=u)
        downstream = await trav.get_downstream("equipment", eq_id, depth=8, user=u)
        return {
            "edge_count": upstream.get("edge_count", 0) + downstream.get("edge_count", 0),
            "nodes_visited": 0,
        }

    report.scenarios.append(
        await _run_scenario(
            "upstream_downstream_trace",
            equipment_ids,
            user,
            _trace,
            notes="Provenance + impact walks",
        )
    )

    async def _ai_context(_t, eq_id, u):
        from services.reliability_context_service import build_reliability_context

        return await build_reliability_context(
            equipment_id=eq_id,
            user_id=u["id"],
            user=u,
            edge_limit=80,
            include_threats=False,
        )

    report.scenarios.append(
        await _run_scenario(
            "ai_context_cold",
            equipment_ids[: min(5, len(equipment_ids))],
            user,
            _ai_context,
            notes="Full context assembly without snapshot cache",
        )
    )

    token = reset_graph_query_counter()
    started = time.perf_counter()
    await get_graph_topology_stats(user)
    report.topology_aggregate_ms = round((time.perf_counter() - started) * 1000, 2)
    restore_graph_query_counter(token)

    started = time.perf_counter()
    await count_edges_by_relation(user)
    report.relation_count_ms = round((time.perf_counter() - started) * 1000, 2)

    report.optimizations = build_optimization_recommendations(report)
    return report


async def run_micro_benchmark() -> BenchmarkReport:
    return await run_benchmark(50, sample_size=5, density="sparse", seed=True, force_seed=True)


__all__ = [
    "BENCHMARK_SCALES",
    "BenchmarkReport",
    "LatencyStats",
    "ScenarioResult",
    "benchmark_tenant_id",
    "benchmark_user",
    "build_optimization_recommendations",
    "clear_benchmark_tenant",
    "format_markdown_report",
    "run_benchmark",
    "run_micro_benchmark",
    "seed_benchmark_graph",
]
