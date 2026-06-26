#!/usr/bin/env python3
"""CI / UAT gate: WS7 graph performance benchmark harness."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Allow module imports without a live cluster; micro benchmark runs only when MONGO_URL is preset.
MONGO_REQUESTED = bool(os.environ.get("MONGO_URL"))
if not MONGO_REQUESTED:
    os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")

# Micro-benchmark thresholds (50 assets, 5 samples).
MICRO_GET_CHAIN_P95_MS = 3_000
MICRO_TOPOLOGY_MS = 5_000


def _check_files() -> list[str]:
    failures: list[str] = []
    required = [
        BACKEND_ROOT / "services" / "reliability_graph_benchmark.py",
        BACKEND_ROOT / "scripts" / "benchmark_reliability_graph.py",
        BACKEND_ROOT.parent / "docs" / "platform" / "GRAPH_PERFORMANCE_BENCHMARKS.md",
    ]
    for path in required:
        if not path.is_file():
            failures.append(f"missing required file: {path.relative_to(BACKEND_ROOT.parent)}")
    return failures


def _check_module() -> list[str]:
    failures: list[str] = []
    try:
        from services.reliability_graph_benchmark_lib import (
            BENCHMARK_SCALES,
            build_optimization_recommendations,
            format_markdown_report,
            BenchmarkReport,
            ScenarioResult,
            LatencyStats,
        )

        assert BENCHMARK_SCALES == (100, 1_000, 10_000, 100_000)
        report = BenchmarkReport(
            scale=100,
            tenant_id="ws7-bench-100",
            generated_at="2026-01-01T00:00:00Z",
            asset_count=100,
            edge_count=2500,
            scenarios=[
                ScenarioResult(
                    name="get_chain_bfs",
                    latency_ms=LatencyStats(samples=5, p50_ms=40, p95_ms=120, max_ms=150, mean_ms=55),
                    mongo_queries=LatencyStats(samples=5, p50_ms=8, p95_ms=15, max_ms=18, mean_ms=10),
                )
            ],
            topology_aggregate_ms=80,
        )
        md = format_markdown_report(report)
        if "get_chain_bfs" not in md:
            failures.append("format_markdown_report missing scenario output")
        recs = build_optimization_recommendations(report)
        if not recs:
            failures.append("build_optimization_recommendations returned empty")
    except Exception as exc:
        failures.append(f"benchmark module import failed: {exc}")
    return failures


async def _run_micro_if_mongo() -> list[str]:
    if not MONGO_REQUESTED:
        return []

    failures: list[str] = []
    try:
        from services.reliability_graph_benchmark import run_micro_benchmark, clear_benchmark_tenant, benchmark_tenant_id
        from services.reliability_graph_benchmark_lib import LatencyStats

        tenant_id = benchmark_tenant_id(50)
        await clear_benchmark_tenant(tenant_id)
        report = await run_micro_benchmark()

        chain = next((s for s in report.scenarios if s.name == "get_chain_bfs"), None)
        if not chain:
            failures.append("micro benchmark missing get_chain_bfs scenario")
        elif chain.latency_ms.p95_ms > MICRO_GET_CHAIN_P95_MS:
            failures.append(
                f"get_chain p95 {chain.latency_ms.p95_ms}ms exceeds {MICRO_GET_CHAIN_P95_MS}ms micro threshold"
            )

        if report.topology_aggregate_ms > MICRO_TOPOLOGY_MS:
            failures.append(
                f"topology aggregate {report.topology_aggregate_ms}ms exceeds {MICRO_TOPOLOGY_MS}ms micro threshold"
            )

        if report.edge_count < 100:
            failures.append(f"micro benchmark seeded too few edges: {report.edge_count}")

        print(f"OK: micro benchmark — edges={report.edge_count} get_chain_p95={getattr(chain, 'latency_ms', LatencyStats()).p95_ms}ms")
    except Exception as exc:
        failures.append(f"micro benchmark failed: {exc}")
    return failures


def main() -> int:
    print("=== Graph performance benchmark gate (WS7) ===\n")
    failures: list[str] = []
    failures.extend(_check_files())
    failures.extend(_check_module())

    if failures:
        for msg in failures:
            print(f"FAIL: {msg}", file=sys.stderr)
        return 2

    print("OK: benchmark harness files and module checks passed")

    mongo_failures = asyncio.run(_run_micro_if_mongo())
    if mongo_failures:
        for msg in mongo_failures:
            print(f"FAIL: {msg}", file=sys.stderr)
        return 2

    if not MONGO_REQUESTED:
        print("SKIP: MONGO_URL unset — micro benchmark not run (module checks only)")

    print("\nOK: graph performance benchmark gate passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
