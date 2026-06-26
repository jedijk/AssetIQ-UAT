"""WS7 — reliability graph performance benchmark harness."""
from __future__ import annotations

import importlib.util
from pathlib import Path

from services.reliability_graph_benchmark_lib import (
    BENCHMARK_SCALES,
    BenchmarkReport,
    LatencyStats,
    ScenarioResult,
    benchmark_tenant_id,
    build_optimization_recommendations,
    edges_for_asset,
    format_markdown_report,
    latency_stats,
    percentile,
    sample_equipment_ids,
)


def test_benchmark_scales():
    assert BENCHMARK_SCALES == (100, 1_000, 10_000, 100_000)


def test_benchmark_tenant_id():
    assert benchmark_tenant_id(1000) == "ws7-bench-1000"


def test_percentile_and_stats():
    values = [10.0, 20.0, 30.0, 40.0, 100.0]
    assert percentile(values, 50) == 30.0
    stats = latency_stats(values)
    assert stats.samples == 5
    assert stats.max_ms == 100.0
    assert stats.p50_ms == 30.0


def test_sparse_asset_edge_count():
    edges = edges_for_asset(
        tenant_id="t1",
        asset_index=0,
        density="sparse",
        now="2026-01-01T00:00:00Z",
    )
    assert len(edges) >= 25
    assert all(e["tenant_id"] == "t1" for e in edges)
    assert all(e["equipment_id"] == "bench-eq-0" for e in edges)


def test_dense_asset_has_reactive_chain():
    edges = edges_for_asset(
        tenant_id="t1",
        asset_index=1,
        density="dense",
        now="2026-01-01T00:00:00Z",
    )
    relations = {e["relation"] for e in edges}
    assert "escalated_to" in relations
    assert "generated_action" in relations


def test_sample_equipment_ids():
    ids = sample_equipment_ids(100, 10)
    assert len(ids) == 10
    assert all(i.startswith("bench-eq-") for i in ids)


def test_format_markdown_report():
    report = BenchmarkReport(
        scale=100,
        tenant_id="ws7-bench-100",
        generated_at="2026-01-01T00:00:00Z",
        asset_count=100,
        edge_count=3000,
        sample_size=10,
        scenarios=[
            ScenarioResult(
                name="get_chain_bfs",
                latency_ms=LatencyStats(samples=10, p50_ms=45, p95_ms=90, max_ms=120, mean_ms=50),
            )
        ],
        topology_aggregate_ms=75,
        optimizations=["Batch BFS neighbor queries."],
    )
    md = format_markdown_report(report)
    assert "get_chain_bfs" in md
    assert "Batch BFS neighbor queries" in md


def test_optimization_recommendations_high_latency():
    report = BenchmarkReport(
        scale=10_000,
        tenant_id="ws7-bench-10000",
        generated_at="2026-01-01T00:00:00Z",
        asset_count=10_000,
        edge_count=300_000,
        scenarios=[
            ScenarioResult(
                name="get_chain_bfs",
                latency_ms=LatencyStats(samples=5, p50_ms=400, p95_ms=900, max_ms=1000, mean_ms=500),
                mongo_queries=LatencyStats(samples=5, p50_ms=10, p95_ms=20, max_ms=25, mean_ms=12),
                nodes_visited=LatencyStats(samples=5, p50_ms=8, p95_ms=15, max_ms=18, mean_ms=10),
            ),
            ScenarioResult(
                name="explain_risk_ai",
                latency_ms=LatencyStats(samples=5, p50_ms=600, p95_ms=1200, max_ms=1500, mean_ms=700),
            ),
        ],
        topology_aggregate_ms=2500,
    )
    recs = build_optimization_recommendations(report)
    joined = " ".join(recs)
    assert "N+1" in joined or "500ms" in joined
    assert "topology" in joined.lower() or "facet" in joined.lower()


def test_verify_graph_performance_script_passes():
    import os

    script = Path(__file__).resolve().parents[1] / "scripts" / "verify_graph_performance_benchmarks.py"
    saved_mongo = os.environ.pop("MONGO_URL", None)
    try:
        spec = importlib.util.spec_from_file_location("verify_graph_performance_benchmarks", script)
        mod = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(mod)
        assert mod.main() == 0
    finally:
        if saved_mongo is not None:
            os.environ["MONGO_URL"] = saved_mongo
