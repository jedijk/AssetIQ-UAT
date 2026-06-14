# Reliability Knowledge Graph in AssetIQ

**AssetIQ Platform · Technical Documentation**  
**Version:** 1.0 · **Date:** July 2025  
**Status:** Production Implementation

---

## Executive Summary

AssetIQ implements a **reliability knowledge graph** as an edge-only MongoDB data structure (`reliability_edges` collection) that connects equipment assets through their entire reliability lifecycle. The graph materializes relationships between equipment, maintenance strategies, failure modes, scheduled work, task executions, findings, observations, threats, investigations, actions, and outcomes — enabling advanced AI context assembly, reliability intelligence, and cross-domain traversal.

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │               RELIABILITY KNOWLEDGE GRAPH                    │
                    │         Connecting Equipment Through Reliability Chain       │
                    └─────────────────────────────────────────────────────────────┘

    ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
    │Equipment│────▶│Strategy │────▶│ Program │────▶│Scheduled│────▶│  Task   │
    │         │     │         │     │  Task   │     │  Work   │     │Instance │
    └────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
         │               │               │               │               │
         │               │               │               │               ▼
         │               │               │               │          ┌─────────┐
         │               │               ▼               │          │ Finding │
         │               │          ┌─────────┐         │          └────┬────┘
         │               │          │ Failure │         │               │
         │               │          │  Mode   │         │               ▼
         │               ▼          └─────────┘         │          ┌─────────┐
         │          ┌─────────┐                         │          │Observ-  │
         │          │ Program │                         │          │ation    │
         │          │   v2    │                         │          └────┬────┘
         │          └─────────┘                         │               │
         │                                              │               ▼
         │                                              │          ┌─────────┐
         │                                              │          │ Threat  │
         │                                              │          └────┬────┘
         │                                              │               │
         │                                              │               ▼
         │                                              │          ┌─────────┐
         │                                              │          │Investig-│
         │                                              │          │ation    │
         │                                              │          └────┬────┘
         │                                              │               │
         │                                              │               ▼
         │                                              │          ┌─────────┐
         └──────────────────────────────────────────────┴─────────▶│ Action  │
                                                                   └────┬────┘
                                                                        │
                                                                        ▼
                                                                   ┌─────────┐
                                                                   │ Outcome │
                                                                   └────┬────┘
                                                                        │
                                                                        ▼
                                                                   ┌─────────┐
                                                                   │Reliabil-│
                                                                   │ity      │
                                                                   │ Impact  │
                                                                   └─────────┘
```

---

## 1. Architecture Overview

### 1.1 Design Philosophy

The reliability knowledge graph follows these core principles:

1. **Edge-Only MongoDB Graph** — No dedicated graph database (Neo4j); edges stored in MongoDB `reliability_edges` collection
2. **Event-Sourced Synchronization** — Every edge is written by a domain lifecycle hook (create, update, complete, close events)
3. **Lightweight Nodes** — Nodes are implied by `source_type/source_id` and `target_type/target_id`; attributes stay in source collections
4. **Tenant-Scoped Edges** — Multi-tenant isolation via `tenant_id` on all edges
5. **Soft Retirement** — Edges marked `status: retired` rather than hard deleted (audit trail)
6. **Traversability Over Duplication** — Graph links entities; KPIs aggregate via traversal + Mongo projections

### 1.2 Primary Components

| Component | File Location | Role |
|-----------|---------------|------|
| **Write API** | `backend/services/reliability_graph.py` | Edge upsert, retirement, sync functions |
| **Read API / Traversal** | `backend/services/reliability_graph_query.py` | `GraphTraversalService`, count functions |
| **AI Context Assembly** | `backend/services/reliability_context_service.py` | `ReliabilityContextService` for Copilot |
| **Audit Helpers** | `backend/services/reliability_graph_audit.py` | UAT gate, sample audit |
| **PM Import Sync** | `backend/services/pm_import_graph_sync.py` | PM import → failure mode edges |
| **Strict Mode** | `backend/services/reliability_graph_strict.py` | Audit mode flag |

### 1.3 MongoDB Collections

| Collection | Purpose |
|------------|---------|
| `reliability_edges` | Primary edge-only graph store |
| `findings` | Structured findings from task completion |
| `outcomes` | Action verification outcomes |
| `reliability_impacts` | Measurable reliability impact per outcome |
| `reliability_context_snapshots` | Cached AI context (120s TTL) |
| `reliability_snapshots` | Digital twin time-indexed state (future) |

---

## 2. Edge Document Schema

### 2.1 Edge Structure

```json
{
  "id": "task_instance:abc:executed_on:equipment:xyz",
  "tenant_id": "company_123",
  "source_type": "task_instance",
  "source_id": "abc",
  "relation": "executed_on",
  "target_type": "equipment",
  "target_id": "xyz",
  "equipment_id": "xyz",
  "equipment_type_id": "et_456",
  "status": "active",
  "metadata": {
    "event": "completed",
    "completed_at": "2026-06-06T12:00:00Z",
    "strategy_version": "3.2"
  },
  "created_at": "2026-06-01T10:00:00Z",
  "updated_at": "2026-06-06T12:00:00Z",
  "retired_at": null
}
```

### 2.2 Key Fields

| Field | Description |
|-------|-------------|
| `id` | Composite key: `{source_type}:{source_id}:{relation}:{target_type}:{target_id}` |
| `source_type` / `source_id` | Origin node identity |
| `relation` | Edge type (verb describing relationship) |
| `target_type` / `target_id` | Destination node identity |
| `equipment_id` | Denormalized for equipment-scoped reads |
| `equipment_type_id` | Equipment type context (optional) |
| `tenant_id` | Multi-tenant isolation key |
| `status` | `active` or `retired` |
| `metadata` | Event-specific data (timestamps, versions, etc.) |

### 2.3 Indexes

```javascript
// Compound indexes for tenant-scoped graph reads
{ tenant_id: 1, equipment_id: 1, status: 1, updated_at: -1 }
{ tenant_id: 1, source_type: 1, source_id: 1 }
{ tenant_id: 1, target_type: 1, target_id: 1 }
{ tenant_id: 1, relation: 1 }
```

---

## 3. Node Types (Entities)

The graph supports **16 logical node types** representing the full reliability chain:

### 3.1 Maintenance Domain Nodes

| Node Type | MongoDB Collection | Description |
|-----------|-------------------|-------------|
| `equipment` | `equipment_nodes` | Physical assets (pumps, compressors, valves, etc.) |
| `failure_mode` | `failure_modes` | FMEA library failure modes |
| `equipment_type_strategy` | `equipment_type_strategies` | Maintenance strategy per equipment type |
| `maintenance_program_v2` | `maintenance_programs_v2` | Program per equipment (v2 canonical) |
| `program_task` | Nested in program | Individual maintenance task in program |
| `strategy_task_template` | Nested in strategy | Task template definition |
| `scheduled_task` | `scheduled_tasks` | Horizon-expanded work items |
| `task_instance` | `task_instances` | Executed work (My Tasks) |

### 3.2 Reactive Domain Nodes

| Node Type | MongoDB Collection | Description |
|-----------|-------------------|-------------|
| `task_completion` | Lightweight ref / edge metadata | Task completion event marker |
| `finding` | `findings` | Structured findings from maintenance |
| `observation` | `observations` / `threats` | Reported issues, near-misses |
| `threat` | `threats` | Promoted/escalated observations |
| `investigation` | `investigations` | RCA/causal analysis sessions |
| `cause` | `cause_nodes` | Identified causes (5-Why analysis) |
| `action` | `central_actions` | Corrective/preventive actions |

### 3.3 Outcome Domain Nodes

| Node Type | MongoDB Collection | Description |
|-----------|-------------------|-------------|
| `outcome` | `outcomes` | Action verification result |
| `reliability_impact` | `reliability_impacts` | Quantified reliability improvement |

---

## 4. Relation Types (Edge Types)

### 4.1 Maintenance Domain Relations (14 Active)

| Relation | Source → Target | Description |
|----------|-----------------|-------------|
| `has_failure_mode` | equipment → failure_mode | Equipment's applicable failure modes |
| `has_strategy_type` | equipment → equipment_type_strategy | Strategy assignment |
| `governed_by` | maintenance_program_v2 → equipment_type_strategy | Program governance |
| `has_program` | equipment → maintenance_program_v2 | Program assignment |
| `contains_task` | maintenance_program_v2 → program_task | Program structure |
| `derived_from_template` | program_task → strategy_task_template | Task provenance |
| `mitigates_failure_mode` | program_task / scheduled_task / task_instance → failure_mode | Mitigation link |
| `applied_to` | pm_import_task → failure_mode | PM import application |
| `derived_from` | scheduled_task → program_task | Schedule derivation |
| `scheduled_for` | scheduled_task → equipment | Work scheduling |
| `instantiated_as` | scheduled_task → task_instance | Execution bridge |
| `executed_on` | task_instance → equipment | Execution record |
| `completed_on` | scheduled_task → equipment | Completion record |
| `cancelled_for` | scheduled_task → program_task | Cancellation record |

### 4.2 Reactive Domain Relations (12 Active)

| Relation | Source → Target | Description |
|----------|-----------------|-------------|
| `yielded_finding` | task_completion → finding | Finding generation |
| `found_on` | finding → equipment | Finding location |
| `raised_observation` | finding → observation | Triage escalation |
| `observed_on` | observation / threat → equipment | Issue location |
| `indicates_failure_mode` | observation / threat → failure_mode | FM indication |
| `linked_to_threat` | observation → threat | Legacy compatibility |
| `escalated_to` | observation → threat | Threat promotion |
| `triggered_investigation` | threat → investigation | RCA trigger |
| `identified_cause` | investigation → cause | Cause identification |
| `generated_action` | investigation / cause → action | Action generation |
| `assigned_to_equipment` | action → equipment | Action assignment |

### 4.3 Outcome Domain Relations (3 Active)

| Relation | Source → Target | Description |
|----------|-----------------|-------------|
| `resulted_in` | action → outcome | Outcome verification |
| `impacted_reliability` | outcome → reliability_impact | Impact quantification |
| `affects_equipment` | reliability_impact → equipment | Equipment attribution |

---

## 5. Write Paths (Sync Functions)

The graph is populated by **10 active write paths** triggered by domain events:

### 5.1 Sync Function Reference

| # | Trigger Event | Sync Function | File Location |
|---|---------------|---------------|---------------|
| 1 | Apply Strategy | `sync_edges_for_apply_strategy()` | `routes/maintenance_scheduler/programs.py` |
| 2 | PM Import Apply | `sync_edge_for_pm_import_task()` | `services/pm_import_graph_sync.py` |
| 3 | Scheduled Task Create | `sync_edges_for_scheduled_task(event="created")` | Scheduler |
| 4 | Scheduled Task Complete | `sync_edges_for_scheduled_task(event="completed")` | `routes/maintenance_scheduler/tasks.py` |
| 5 | Scheduled Task Cancel | `sync_edges_for_scheduled_task(event="cancelled")` | `routes/maintenance_scheduler/tasks.py` |
| 6 | Task Instance Complete | `sync_task_instance_completion_edges()` | `services/task_service.py` |
| 7 | Observation Create/Update | `sync_observation_edges()` | `services/observation_service.py` |
| 8 | Threat Create | `sync_threat_edges()` | Chat routes, task service |
| 9 | Investigation Lifecycle | `sync_investigation_edges()`, `sync_cause_edge()` | Investigation routes |
| 10 | Action Close | `sync_action_edges()`, `sync_outcome_edges()` | Action routes |

### 5.2 Apply Strategy Sync (Primary)

When a maintenance strategy is applied to equipment, `sync_edges_for_apply_strategy()` creates:

```
Equipment ──has_failure_mode──▶ Failure Mode (for each FM in strategy)
Equipment ──has_strategy_type──▶ Strategy
Equipment ──has_program──▶ Program
Program ──governed_by──▶ Strategy
Program ──contains_task──▶ Program Task (for each task)
Program Task ──derived_from_template──▶ Task Template
Program Task ──mitigates_failure_mode──▶ Failure Mode
```

Additionally, stale `program_task` edges are retired when tasks are removed from programs.

### 5.3 Task Completion Flow

When a task instance is completed:

```
Scheduled Task ──instantiated_as──▶ Task Instance
Task Instance ──executed_on──▶ Equipment
Task Instance ──mitigates_failure_mode──▶ Failure Mode

// If findings exist:
Task Completion ──yielded_finding──▶ Finding
Finding ──found_on──▶ Equipment
```

---

## 6. Read Layer (Traversal API)

### 6.1 GraphTraversalService

Located in `backend/services/reliability_graph_query.py`, provides:

```python
class GraphTraversalService:
    async def get_chain(equipment_id, depth=5, relations=None) -> Dict
        """Bounded BFS from equipment — returns edges and path summaries"""
    
    async def get_upstream(node_type, node_id, depth=8) -> Dict
        """Provenance walk — edges where node is target
           (e.g., action → investigation → threat → task)"""
    
    async def get_downstream(node_type, node_id, depth=8) -> Dict
        """Impact walk — edges where node is source
           (e.g., equipment → open threats → pending actions)"""
    
    async def explain_risk(equipment_id) -> Dict
        """Structured open-threat and overdue-PM paths for AI prompts"""
```

### 6.2 Query Functions

```python
# Get all edges for an equipment item
edges = await get_edges_for_equipment(
    equipment_id,
    limit=200,
    tenant_id=tid,
    include_retired=False
)

# Get edges for any node (source, target, or both)
edges = await get_edges_for_node(
    node_type="threat",
    node_id=threat_id,
    direction="both",  # "in", "out", or "both"
    limit=100,
    tenant_id=tid
)

# Count edges by relation type (tenant-scoped)
counts = await count_edges_by_relation(user, active_only=True)
# Returns: {"has_program": 142, "mitigates_failure_mode": 580, ...}

# Total active edges
total = await count_active_reliability_edges(user)
```

---

## 7. AI Integration

### 7.1 ReliabilityContextService

The primary AI context assembly service (`backend/services/reliability_context_service.py`):

```python
class ReliabilityContextService:
    async def get_context(equipment_id, user_id, user=None, use_cache=True)
        """Build full reliability context bundle for AI/Copilot"""
```

Returns a comprehensive context bundle:

```json
{
  "found": true,
  "equipment_id": "eq_123",
  "equipment": { "name": "P-104", "tag": "PMP-104", "criticality": {...} },
  "equipment_type_id": "pump_centrifugal",
  "program_task_count": 12,
  "strategy_version": "3.2",
  "graph": {
    "edges": [...],
    "edge_count": 48,
    "relations": { "has_program": 1, "mitigates_failure_mode": 12, ... },
    "paths": [["equipment:eq_123", "-[has_program]->", "program:prog_1"], ...],
    "path_entries": [{ "edge_id": "...", "relation": "has_program", ... }],
    "nodes_visited": 24
  },
  "failure_modes": [...],
  "open_work_items": [...],
  "open_threats": [...],
  "twin_snapshot": { "latest": {...}, "delta": {...} },
  "assembled_at": "2026-07-15T10:30:00Z"
}
```

### 7.2 Context for LLM Prompts

```python
# Format context for LLM system/user prompts
prompt_text = format_context_for_prompt(ctx)
```

Output example:
```
Equipment: Pump P-104 (tag=PMP-104, id=eq_123)
Program tasks: 12; strategy v=3.2
Graph edges: 48 (nodes visited: 24)
Graph relations: mitigates_failure_mode=12, has_program=1, scheduled_for=8, ...
Chain paths (cite edge_id when referencing):
  - equipment:eq_123 -[has_program]-> maintenance_program_v2:prog_1
  - program_task:task_1 -[mitigates_failure_mode]-> failure_mode:fm_bearing
  ...
Twin snapshot (at 2026-07-15T00:00:00Z): health=72, open_threats=3, overdue_pm=1
Week-over-week delta: health +5.0, threats -1, overdue_pm +0, graph_changed=true
Failure modes (strategy):
  - Bearing Failure (preventive)
  - Seal Leak (condition_based)
  ...
Open work (4):
  - [assigned] Bearing inspection due=2026-07-20
  ...
Open threats (2):
  - Vibration increasing risk=High score=7.2
  ...
```

### 7.3 AI Consumers

| Consumer | Graph Usage |
|----------|-------------|
| **RIL Copilot** | Full traversal via `ReliabilityContextService` |
| **RIL Executive Dashboard** | Edge counts + KPIs |
| **Intelligence Map** | Relation breakdown statistics |
| **AI Risk Engine** | `explain_risk()` paths (future) |
| **Chat Observations** | Sync edges on threat creation |

---

## 8. Audit & Verification

### 8.1 Audit Helpers

Located in `backend/services/reliability_graph_audit.py`:

```python
# Check single expected edge
missing = await missing_edge(source_type, source_id, relation, target_type, target_id)

# Audit apply-strategy coverage
gaps = await audit_program_task_edges(program_id, equipment_id)

# Audit PM import edge
missing = await audit_pm_import_task(task_id, failure_mode_id)

# Audit scheduled task lifecycle
gaps = await audit_scheduled_task_completed(scheduled_task_id)
gaps = await audit_scheduled_task_created(scheduled_task_id)

# Audit observation chain
gaps = await audit_observation_edges(observation_id)

# Audit investigation chain
gaps = await audit_investigation_chain(investigation_id)

# Sample recent entities and report gaps
report = await sample_db_audit(user, sample_size=10)
```

### 8.2 UAT Gate Verification

```bash
# Run UAT verification script
cd backend && python scripts/verify_reliability_graph_sync.py

# With database sampling
cd backend && MONGO_URL=... python scripts/verify_reliability_graph_sync.py
```

The verification script checks:
1. **Static path checks** — Sync hooks wired in all required services
2. **DB sampling** — Programs, PM imports, scheduled tasks, observations, investigations

### 8.3 Strict/Audit Mode

```bash
# Enable strict mode (re-raises sync failures instead of logging)
RELIABILITY_GRAPH_AUDIT_MODE=true
```

Production defaults to resilient mode (log + continue).

---

## 9. Backfill Scripts

### 9.1 Tenant ID Backfill

```bash
cd backend && MONGO_URL=... python scripts/backfill_reliability_edge_tenant.py
```

Backfills `tenant_id` from `equipment_nodes` and defaults `status=active` on legacy edges.

### 9.2 Historical Graph Backfill

```bash
# Dry run (log only, no writes)
cd backend && MONGO_URL=... python scripts/backfill_reliability_graph_history.py --dry-run

# Maintenance phase only
cd backend && MONGO_URL=... python scripts/backfill_reliability_graph_history.py --phase maintenance

# Single equipment
cd backend && MONGO_URL=... python scripts/backfill_reliability_graph_history.py --equipment-id <id> --limit 50

# Full backfill (all phases)
cd backend && MONGO_URL=... python scripts/backfill_reliability_graph_history.py --phase all
```

**Phases:**
- **Maintenance**: Programs → Apply Strategy sync; Scheduled Tasks → lifecycle edges; Task Instances → completion edges
- **Reactive**: Observations, Threats, Investigations, Causes, Actions (+ outcome edges for completed actions)

---

## 10. API Endpoints

### 10.1 Equipment Reliability Chain

```http
GET /api/ril/equipment/{equipment_id}/reliability-chain
```

Returns equipment's full reliability chain via graph traversal.

### 10.2 Intelligence Map Stats

```http
GET /api/intelligence-map/stats
```

Includes `reliability_edges_total` count and relation breakdown.

### 10.3 Copilot Context

```http
POST /api/ril/copilot
```

Internally uses `ReliabilityContextService` for graph-enriched context.

---

## 11. Data Flow Examples

### 11.1 Preventive Maintenance Flow

```
1. Strategy Applied to Equipment Type
   └─▶ sync_edges_for_apply_strategy()
       ├─▶ equipment ──has_strategy_type──▶ strategy
       ├─▶ equipment ──has_program──▶ program
       ├─▶ equipment ──has_failure_mode──▶ failure_mode (×N)
       ├─▶ program ──governed_by──▶ strategy
       └─▶ program_task ──mitigates_failure_mode──▶ failure_mode (×N)

2. Scheduler Generates Work
   └─▶ sync_edges_for_scheduled_task(event="created")
       ├─▶ scheduled_task ──derived_from──▶ program_task
       ├─▶ scheduled_task ──scheduled_for──▶ equipment
       └─▶ scheduled_task ──mitigates_failure_mode──▶ failure_mode

3. Technician Completes Task
   └─▶ sync_task_instance_completion_edges()
       ├─▶ scheduled_task ──instantiated_as──▶ task_instance
       ├─▶ task_instance ──executed_on──▶ equipment
       └─▶ task_instance ──mitigates_failure_mode──▶ failure_mode

4. (Optional) Findings Recorded
   └─▶ _sync_finding_from_completion()
       ├─▶ task_completion ──yielded_finding──▶ finding
       └─▶ finding ──found_on──▶ equipment
```

### 11.2 Reactive Chain Flow

```
1. Finding Escalated to Observation
   └─▶ sync_observation_edges()
       ├─▶ finding ──raised_observation──▶ observation
       └─▶ observation ──observed_on──▶ equipment

2. Observation Promoted to Threat
   └─▶ sync_threat_edges()
       ├─▶ observation ──escalated_to──▶ threat
       └─▶ threat ──indicates_failure_mode──▶ failure_mode

3. Investigation Opened
   └─▶ sync_investigation_edges()
       └─▶ threat ──triggered_investigation──▶ investigation

4. Root Cause Identified
   └─▶ sync_cause_edge()
       └─▶ investigation ──identified_cause──▶ cause

5. Action Generated
   └─▶ sync_action_edges()
       ├─▶ cause ──generated_action──▶ action
       └─▶ action ──assigned_to_equipment──▶ equipment

6. Action Completed & Verified
   └─▶ sync_outcome_edges()
       ├─▶ action ──resulted_in──▶ outcome
       ├─▶ outcome ──impacted_reliability──▶ reliability_impact
       └─▶ reliability_impact ──affects_equipment──▶ equipment
```

---

## 12. Performance Considerations

### 12.1 Query Optimization

- **Equipment-scoped index** — Primary access pattern via `equipment_id`
- **Tenant-scoped reads** — All queries include `tenant_id` filter
- **Edge limit** — Default 200 edges per equipment, configurable
- **Snapshot caching** — 120-second TTL on context snapshots

### 12.2 Scale Characteristics

| Metric | Typical Range |
|--------|---------------|
| Edges per equipment | 30-200 |
| Traversal depth | 5-8 hops |
| Context assembly time | 200-800ms (cached: <50ms) |
| Edge upsert latency | 5-20ms |

### 12.3 Best Practices

1. **Use cached context** — `ReliabilityContextService.get_context(use_cache=True)`
2. **Limit traversal depth** — Default depth=5 is usually sufficient
3. **Filter by relations** — Specify relation types when traversing
4. **Batch edge operations** — Apply Strategy creates edges in bulk

---

## 13. Future Roadmap

### 13.1 Digital Twin Integration

Planned additions for time-indexed graph state:

- **`reliability_snapshots`** collection — Daily equipment health snapshots
- **Time-travel API** — Graph state at timestamp T
- **Twin-enriched context** — "What changed this week?" for Copilot
- **Predictive edge annotations** — RUL scores from AI Risk

### 13.2 Graph-Native KPIs

Planned migration from raw Mongo queries to graph-based aggregation:

- **GraphKpiAggregator** — Replace ad-hoc counts in executive dashboard
- **Intelligence Map traversal** — Edge relation breakdown + chain depth metrics
- **AI Risk graph context** — Inject `explain_risk()` paths into risk prompts

---

## 14. Related Documentation

- [`RELIABILITY_KNOWLEDGE_GRAPH_IMPLEMENTATION_PLAN.md`](platform/RELIABILITY_KNOWLEDGE_GRAPH_IMPLEMENTATION_PLAN.md) — Full implementation roadmap
- [`RELIABILITY_GRAPH_SYNC.md`](platform/RELIABILITY_GRAPH_SYNC.md) — Sync hook documentation
- [`data_model_relationships.md`](data_model_relationships.md) — FK relationship model
- Backend source: `backend/services/reliability_graph.py`, `reliability_graph_query.py`, `reliability_context_service.py`

---

*Document maintainer: Platform / Reliability Engineering*  
*Last updated: July 2025*
