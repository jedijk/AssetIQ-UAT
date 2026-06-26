# Graph Performance Benchmarks (Platform 1.0 WS7)

**Objective:** Measure reliability graph read performance at production-relevant scale and optimize only where measurements show need.

**Status:** **Done (WS7)** — benchmark harness, query instrumentation, verify gate, and optimization report.

---

## Scope

| Tier | Assets | Typical use |
|------|--------|-------------|
| 100 | Small plant | Dev / CI micro benchmark |
| 1,000 | Multi-site pilot | Regression baseline |
| 10,000 | Enterprise pilot | Capacity planning |
| 100,000 | Stress / extrapolation | Fleet aggregate cost modeling |

**Metrics captured**

- BFS traversal latency (`get_chain`, `get_upstream` / `get_downstream`)
- Mongo query count per traversal (via context-scoped counter)
- Nodes visited and edges collected
- Peak memory during traversal (`tracemalloc`)
- AI traversal latency (`explain_risk`, cold `build_reliability_context`)
- Fleet aggregates (`get_graph_topology_stats`, `count_edges_by_relation`)

---

## Architecture

```
Synthetic seed (ws7-bench-{scale})
        ↓
reliability_edges + equipment_nodes
        ↓
GraphTraversalService (bounded BFS)
        ↓
benchmark_reliability_graph.py → JSON + Markdown reports
        ↓
Optimization recommendations (N+1, cache, aggregates)
```

**Query instrumentation:** `reliability_graph_core.py` records `get_edges_for_equipment` and `get_edges_for_node` calls when a benchmark counter context is active — zero overhead in production.

---

## Running benchmarks

```bash
cd backend

# CI / module gate (no Mongo required)
python3 scripts/verify_graph_performance_benchmarks.py

# Micro benchmark (requires MONGO_URL)
MONGO_URL=mongodb://localhost:27017 python3 scripts/verify_graph_performance_benchmarks.py

# Full tier run (100 → 100k)
MONGO_URL=mongodb://localhost:27017 python3 scripts/benchmark_reliability_graph.py \
  --output-dir reports/graph_benchmarks

# Single tier with more samples
MONGO_URL=mongodb://localhost:27017 python3 scripts/benchmark_reliability_graph.py \
  --scale 1000 --samples 50 --density dense --force-seed
```

Reports are written to `reports/graph_benchmarks/graph_benchmark_{scale}.json` and `.md`.

---

## Synthetic data model

Per asset (sparse ~30 edges):

- `equipment → has_failure_mode → failure_mode`
- `scheduled_task → scheduled_for → equipment` (×8)
- `scheduled_task → derived_from → program_task` (×8)
- `program_task → mitigates_failure_mode → failure_mode` (×8)

Dense profile adds reactive chain every asset:

- `observation → observed_on → equipment`
- `observation → escalated_to → threat`
- `threat → triggered_investigation → investigation`
- `investigation → generated_action → action`

Benchmark tenants use prefix `ws7-bench-{scale}` and are safe to delete with `--clear`.

---

## Optimization report (findings)

Based on code review and benchmark harness analysis:

### 1. BFS N+1 query pattern (primary)

`GraphTraversalService.get_chain` performs **one Mongo find per frontier node** via `get_edges_for_node`. At depth 5 with fan-out 10–20, this yields 8–20 round-trips per traversal.

**Recommendation:** Batch neighbor fetches per BFS level using a single `$or` query on `(source_type, source_id)` / `(target_type, target_id)` tuples. Expected 3–5× latency reduction on dense graphs.

### 2. Duplicate BFS in `explain_risk`

`explain_risk` calls `get_chain` with a relation filter, then runs separate threat/PM queries. Risk API routes call both chain and explain.

**Recommendation:** Accept optional precomputed chain in `explain_risk` to avoid duplicate traversal on `/reliability-chain`.

### 3. Fleet topology aggregates

`get_graph_topology_stats` runs a tenant-wide `$facet` aggregate — **O(total edges)**. Acceptable at 100–1k assets; becomes dominant at 10k+ assets with millions of edges.

**Recommendation:** Cache topology stats (intelligence map already caches KPIs) or maintain rolling aggregates via scheduled job.

### 4. AI context assembly

`ReliabilityContextService.build_reliability_context` composes BFS + explain_risk + work items + failure modes. Documented target: **200–800ms uncached, <50ms cached** via `reliability_context_snapshots` (120s TTL).

**Recommendation:** Enforce snapshot cache on all copilot / grounded AI entry points; treat cold assembly as materializer-only path.

### 5. Indexes (verified)

Existing compound indexes on `reliability_edges` support benchmark reads:

- `(tenant_id, equipment_id, status, updated_at)`
- `(tenant_id, source_type, source_id)`
- `(tenant_id, target_type, target_id)`
- `(tenant_id, relation)`

Keep `scripts/create_indexes.py` synchronized after schema changes.

### 6. When *not* to optimize

Bounded caps already limit worst case:

- `edge_limit=200`, `depth=5` on `get_chain`
- `depth=8`, max 150 edges on upstream/downstream
- Async graph sync via outbox when `GRAPH_SYNC_ASYNC=true`

No Neo4j migration or precomputed chain store required until measured p95 exceeds targets at production scale.

---

## CI gate

`scripts/verify_graph_performance_benchmarks.py` validates:

1. Harness files and module imports
2. Report formatting and optimization logic
3. Optional micro benchmark (50 assets, 5 samples) when `MONGO_URL` is set

Unit tests: `tests/test_graph_performance_benchmark.py`

---

## References

- [`RELIABILITY_GRAPH_ARCHITECTURE.md`](./RELIABILITY_GRAPH_ARCHITECTURE.md) — WS2 graph ownership
- [`RELIABILITY_GRAPH_SYNC.md`](./RELIABILITY_GRAPH_SYNC.md) — sync and verify gates
- [`PLATFORM_1_0_EXECUTION.md`](./PLATFORM_1_0_EXECUTION.md) — WS7 definition of done
- `backend/services/reliability_graph_query.py` — BFS implementation
- `backend/services/reliability_graph_benchmark.py` — benchmark harness
