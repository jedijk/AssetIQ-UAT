#!/usr/bin/env python3
"""Run reliability graph performance benchmarks (Platform 1.0 WS7)."""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


async def _async_main(args: argparse.Namespace) -> int:
    from services.reliability_graph_benchmark import (
        BENCHMARK_SCALES,
        clear_benchmark_tenant,
        benchmark_tenant_id,
        format_markdown_report,
        run_benchmark,
    )

    scales = [args.scale] if args.scale else list(BENCHMARK_SCALES)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    for scale in scales:
        tenant_id = benchmark_tenant_id(scale)
        print(f"\n=== WS7 graph benchmark — scale {scale:,} ===")

        if args.clear:
            cleared = await clear_benchmark_tenant(tenant_id)
            print(f"Cleared tenant {tenant_id}: {cleared}")

        report = await run_benchmark(
            scale,
            sample_size=args.samples,
            density=args.density,
            seed=not args.no_seed,
            force_seed=args.force_seed,
        )

        json_path = output_dir / f"graph_benchmark_{scale}.json"
        md_path = output_dir / f"graph_benchmark_{scale}.md"
        json_path.write_text(json.dumps(report.to_dict(), indent=2), encoding="utf-8")
        md_path.write_text(format_markdown_report(report), encoding="utf-8")

        print(f"Assets: {report.asset_count:,}  Edges: {report.edge_count:,}  Samples: {report.sample_size}")
        for scenario in report.scenarios:
            print(
                f"  {scenario.name}: p50={scenario.latency_ms.p50_ms}ms "
                f"p95={scenario.latency_ms.p95_ms}ms queries_p95={scenario.mongo_queries.p95_ms:.0f}"
            )
        print(f"  topology_aggregate: {report.topology_aggregate_ms}ms")
        print(f"Wrote {json_path}")
        print(f"Wrote {md_path}")

    print("\nOK: graph benchmarks complete")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Reliability graph performance benchmarks (WS7)")
    parser.add_argument(
        "--scale",
        type=int,
        choices=[100, 1000, 10000, 100000],
        help="Asset count tier (default: run all tiers)",
    )
    parser.add_argument("--samples", type=int, default=20, help="Random equipment samples per scenario")
    parser.add_argument("--density", choices=["sparse", "dense"], default="sparse")
    parser.add_argument("--output-dir", default="reports/graph_benchmarks", help="Report output directory")
    parser.add_argument("--clear", action="store_true", help="Delete benchmark tenant data before run")
    parser.add_argument("--no-seed", action="store_true", help="Skip seeding; benchmark existing tenant data")
    parser.add_argument("--force-seed", action="store_true", help="Rebuild synthetic graph even if tenant exists")
    args = parser.parse_args()
    return asyncio.run(_async_main(args))


if __name__ == "__main__":
    raise SystemExit(main())
