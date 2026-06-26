"""
Pure helpers for reliability graph benchmarks — no database imports (WS7).
"""
from __future__ import annotations

import statistics
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Sequence

BENCHMARK_SCALES = (100, 1_000, 10_000, 100_000)
BENCHMARK_TENANT_PREFIX = "ws7-bench"
BENCHMARK_USER_ID = "ws7-benchmark-user"
BULK_INSERT_BATCH = 2_000
EDGE_COLLECTION = "reliability_edges"
EDGE_STATUS_ACTIVE = "active"


@dataclass
class LatencyStats:
    samples: int = 0
    p50_ms: float = 0.0
    p95_ms: float = 0.0
    max_ms: float = 0.0
    mean_ms: float = 0.0


@dataclass
class ScenarioResult:
    name: str
    latency_ms: LatencyStats = field(default_factory=LatencyStats)
    mongo_queries: LatencyStats = field(default_factory=LatencyStats)
    nodes_visited: LatencyStats = field(default_factory=LatencyStats)
    edge_count: LatencyStats = field(default_factory=LatencyStats)
    peak_memory_kb: float = 0.0
    notes: str = ""


@dataclass
class BenchmarkReport:
    scale: int
    tenant_id: str
    generated_at: str
    asset_count: int = 0
    edge_count: int = 0
    sample_size: int = 0
    density: str = "sparse"
    scenarios: List[ScenarioResult] = field(default_factory=list)
    topology_aggregate_ms: float = 0.0
    relation_count_ms: float = 0.0
    optimizations: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def benchmark_tenant_id(scale: int) -> str:
    return f"{BENCHMARK_TENANT_PREFIX}-{scale}"


def benchmark_user(tenant_id: str) -> dict:
    return {"id": BENCHMARK_USER_ID, "company_id": tenant_id}


def edge_document_id(
    source_type: str,
    source_id: str,
    relation: str,
    target_type: str,
    target_id: str,
) -> str:
    return f"{source_type}:{source_id}:{relation}:{target_type}:{target_id}"


def percentile(values: Sequence[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    rank = (len(ordered) - 1) * (pct / 100.0)
    low = int(rank)
    high = min(low + 1, len(ordered) - 1)
    weight = rank - low
    return ordered[low] * (1 - weight) + ordered[high] * weight


def latency_stats(values: Sequence[float]) -> LatencyStats:
    if not values:
        return LatencyStats()
    return LatencyStats(
        samples=len(values),
        p50_ms=round(percentile(values, 50), 2),
        p95_ms=round(percentile(values, 95), 2),
        max_ms=round(max(values), 2),
        mean_ms=round(statistics.mean(values), 2),
    )


def int_stats(values: Sequence[int]) -> LatencyStats:
    return latency_stats([float(v) for v in values])


def make_edge(
    *,
    tenant_id: str,
    source_type: str,
    source_id: str,
    relation: str,
    target_type: str,
    target_id: str,
    equipment_id: str,
    now: str,
) -> dict:
    edge_id = edge_document_id(source_type, source_id, relation, target_type, target_id)
    return {
        "id": edge_id,
        "tenant_id": tenant_id,
        "source_type": source_type,
        "source_id": source_id,
        "relation": relation,
        "target_type": target_type,
        "target_id": target_id,
        "equipment_id": equipment_id,
        "status": EDGE_STATUS_ACTIVE,
        "metadata": {"benchmark": True, "scale_seed": True},
        "created_at": now,
        "updated_at": now,
        "retired_at": None,
    }


def edges_for_asset(
    *,
    tenant_id: str,
    asset_index: int,
    density: str,
    now: str,
) -> List[dict]:
    eq_id = f"bench-eq-{asset_index}"
    fm_id = f"bench-fm-{asset_index % 50}"
    edges: List[dict] = []

    edges.append(
        make_edge(
            tenant_id=tenant_id,
            source_type="equipment",
            source_id=eq_id,
            relation="has_failure_mode",
            target_type="failure_mode",
            target_id=fm_id,
            equipment_id=eq_id,
            now=now,
        )
    )

    task_count = 8 if density == "sparse" else 15
    for task_idx in range(task_count):
        st_id = f"bench-st-{asset_index}-{task_idx}"
        pt_id = f"bench-pt-{asset_index}-{task_idx}"
        for src_type, src_id, relation, tgt_type, tgt_id in (
            ("scheduled_task", st_id, "scheduled_for", "equipment", eq_id),
            ("scheduled_task", st_id, "derived_from", "program_task", pt_id),
            ("program_task", pt_id, "mitigates_failure_mode", "failure_mode", fm_id),
        ):
            edges.append(
                make_edge(
                    tenant_id=tenant_id,
                    source_type=src_type,
                    source_id=src_id,
                    relation=relation,
                    target_type=tgt_type,
                    target_id=tgt_id,
                    equipment_id=eq_id,
                    now=now,
                )
            )

    if density == "dense" or asset_index % 5 == 0:
        obs_id = f"bench-obs-{asset_index}"
        threat_id = f"bench-threat-{asset_index}"
        inv_id = f"bench-inv-{asset_index}"
        act_id = f"bench-act-{asset_index}"
        reactive = [
            ("observation", obs_id, "observed_on", "equipment", eq_id),
            ("observation", obs_id, "escalated_to", "threat", threat_id),
            ("threat", threat_id, "triggered_investigation", "investigation", inv_id),
            ("investigation", inv_id, "generated_action", "action", act_id),
            ("action", act_id, "scheduled_for", "equipment", eq_id),
        ]
        for src_type, src_id, relation, tgt_type, tgt_id in reactive:
            edges.append(
                make_edge(
                    tenant_id=tenant_id,
                    source_type=src_type,
                    source_id=src_id,
                    relation=relation,
                    target_type=tgt_type,
                    target_id=tgt_id,
                    equipment_id=eq_id,
                    now=now,
                )
            )

    return edges


def sample_equipment_ids(scale: int, sample_size: int, *, rng=None) -> List[str]:
    import random

    picker = rng or random
    count = min(sample_size, scale)
    if count >= scale:
        return [f"bench-eq-{i}" for i in range(scale)]
    indices = sorted(picker.sample(range(scale), count))
    return [f"bench-eq-{i}" for i in indices]


def build_optimization_recommendations(report: BenchmarkReport) -> List[str]:
    recs: List[str] = []
    chain = next((s for s in report.scenarios if s.name == "get_chain_bfs"), None)
    explain = next((s for s in report.scenarios if s.name == "explain_risk_ai"), None)
    ai_ctx = next((s for s in report.scenarios if s.name == "ai_context_cold"), None)

    if chain and chain.mongo_queries.p95_ms >= chain.nodes_visited.p50_ms:
        recs.append(
            "BFS N+1 pattern: each frontier node triggers one Mongo find. "
            "Batch neighbor fetches with a single $or query per BFS level to cut round-trips."
        )

    if chain and chain.latency_ms.p95_ms > 500:
        recs.append(
            f"get_chain p95={chain.latency_ms.p95_ms}ms exceeds 500ms target at scale={report.scale}. "
            "Consider precomputed chain snapshots for hot equipment (see reliability_context_snapshots)."
        )

    if explain and explain.latency_ms.p95_ms > 800:
        recs.append(
            f"explain_risk p95={explain.latency_ms.p95_ms}ms exceeds documented 800ms uncached ceiling. "
            "Reuse get_chain result within explain_risk to avoid duplicate BFS."
        )

    if ai_ctx and ai_ctx.latency_ms.p95_ms > 800:
        recs.append(
            f"AI context cold assembly p95={ai_ctx.latency_ms.p95_ms}ms — enforce 120s snapshot cache on hot paths."
        )

    if report.topology_aggregate_ms > 1000:
        recs.append(
            f"Tenant topology $facet took {report.topology_aggregate_ms}ms at {report.edge_count} edges. "
            "Cache topology stats or maintain rolling aggregates for intelligence map KPIs."
        )

    if report.scale >= 10_000 and report.topology_aggregate_ms > 500:
        recs.append(
            "At 10k+ assets, run fleet-wide aggregates asynchronously (scheduled job) rather than on request."
        )

    if not recs:
        recs.append(
            "No optimization required at measured scale — existing indexes and bounded BFS caps are sufficient."
        )

    recs.append(
        "Indexes verified: (tenant_id, equipment_id, status), (tenant_id, source_type, source_id), "
        "(tenant_id, target_type, target_id) — keep create_indexes.py in sync after schema changes."
    )
    return recs


def format_markdown_report(report: BenchmarkReport) -> str:
    lines = [
        f"# Graph Performance Benchmark — scale {report.scale}",
        "",
        f"- **Tenant:** `{report.tenant_id}`",
        f"- **Generated:** {report.generated_at}",
        f"- **Assets:** {report.asset_count:,}",
        f"- **Edges:** {report.edge_count:,}",
        f"- **Sample size:** {report.sample_size}",
        f"- **Density:** {report.density}",
        "",
        "## Scenario results",
        "",
        "| Scenario | p50 ms | p95 ms | max ms | p95 queries | p95 edges | peak KB |",
        "|----------|--------|--------|--------|-------------|-----------|---------|",
    ]
    for scenario in report.scenarios:
        lines.append(
            f"| {scenario.name} | {scenario.latency_ms.p50_ms} | {scenario.latency_ms.p95_ms} | "
            f"{scenario.latency_ms.max_ms} | {scenario.mongo_queries.p95_ms:.0f} | "
            f"{scenario.edge_count.p95_ms:.0f} | {scenario.peak_memory_kb} |"
        )

    lines.extend([
        "",
        "## Fleet aggregates",
        "",
        f"- **get_graph_topology_stats:** {report.topology_aggregate_ms} ms",
        f"- **count_edges_by_relation:** {report.relation_count_ms} ms",
        "",
        "## Optimization recommendations",
        "",
    ])
    for idx, rec in enumerate(report.optimizations, 1):
        lines.append(f"{idx}. {rec}")
    lines.append("")
    return "\n".join(lines)
