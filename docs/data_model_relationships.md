# AssetIQ Data Model Relationships

## Visual Diagram (ASCII)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        ASSETIQ DATA MODEL RELATIONSHIPS                         │
└─────────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────────┐
                              │   EQUIPMENT TYPES   │
                              │   (ISO 14224 Lib)   │
                              └──────────┬──────────┘
                                         │ defines
                                         ▼
┌─────────────────────┐          ┌─────────────────────┐
│     EQUIPMENT       │◄─────────│    FAILURE MODES    │
│   (Physical Assets) │  has     │    (FMEA Library)   │
│                     │  FMEA    │                     │
│  • Pumps            │          │  • Potential Causes │
│  • Compressors      │          │  • Effects          │
│  • Valves           │          │  • Detection Methods│
│  • Heat Exchangers  │          │  • Recommended      │
│                     │          │    Actions          │
└──────────┬──────────┘          └─────────────────────┘
           │                               │
           │ generates                     │ informs
           │ issues on                     │ root cause
           ▼                               ▼
┌─────────────────────┐          ┌─────────────────────┐
│    OBSERVATIONS     │─────────►│   INVESTIGATIONS    │
│   (Threats/Issues)  │ triggers │  (Causal Analysis)  │
│                     │          │                     │
│  • Safety hazards   │          │  • 5-Why Analysis   │
│  • Near misses      │          │  • Root Cause       │
│  • Equipment issues │          │  • AI Insights      │
│  • Quality defects  │          │                     │
└──────────┬──────────┘          └──────────┬──────────┘
           │                                │
           │ requires                       │ generates
           │ corrective                     │ follow-up
           ▼                                ▼
┌─────────────────────────────────────────────────────────┐
│                       ACTIONS                            │
│              (Corrective & Preventive)                   │
│                                                          │
│  • Linked to Observations (reactive)                     │
│  • Linked to Investigations (root cause based)           │
│  • Linked to Equipment (asset-specific)                  │
│  • Assigned to Users                                     │
│  • Due dates & priorities                                │
└──────────────────────────┬──────────────────────────────┘
                           │
                           │ may create
                           │ recurring
                           ▼
┌─────────────────────────────────────────────────────────┐
│                        TASKS                             │
│              (Scheduled Maintenance)                     │
│                                                          │
│  ┌─────────────────┐       ┌─────────────────┐          │
│  │  TASK PLANS     │──────►│ TASK INSTANCES  │          │
│  │  (Templates)    │creates│  (Executions)   │          │
│  │                 │       │                 │          │
│  │ • Recurring     │       │ • Planned       │          │
│  │ • Ad-hoc        │       │ • In Progress   │          │
│  │ • Form-based    │       │ • Completed     │          │
│  └─────────────────┘       └────────┬────────┘          │
│                                     │                    │
│                                     │ generates          │
│                                     ▼                    │
│                          ┌─────────────────────┐         │
│                          │  FORM SUBMISSIONS   │         │
│                          │                     │         │
│                          │ • Inspection data   │         │
│                          │ • Readings/values   │         │
│                          │ • Signatures        │         │
│                          │ • Attachments       │         │
│                          └─────────────────────┘         │
└──────────────────────────────────────────────────────────┘


## Relationship Summary

| From | To | Relationship |
|------|-----|--------------|
| Equipment Type | Failure Modes | Has many (via FMEA library) |
| Equipment | Equipment Type | Belongs to |
| Equipment | Observations | Can generate many |
| Equipment | Tasks | Has scheduled maintenance |
| Observation | Investigation | Can trigger (causal analysis) |
| Observation | Actions | Requires corrective actions |
| Investigation | Actions | Generates follow-up actions |
| Failure Mode | Investigation | Informs root cause analysis |
| Task Plan | Task Instance | Creates scheduled instances |
| Task Instance | Form Submission | Generates on completion |
| Action | Equipment | Linked to specific asset |
| Action | User | Assigned to |


## Data Flow Examples

### 1. Reactive Maintenance Flow
```
Equipment Issue → Observation Created → Action Assigned → Task Scheduled → Form Completed
```

### 2. Proactive Maintenance Flow
```
Equipment → Task Plan (recurring) → Task Instance → Form Submission → Data Analysis
```

### 3. Root Cause Analysis Flow
```
Observation → Investigation → Failure Mode Mapping → Root Cause → Corrective Actions
```

### 4. FMEA-Based Prevention
```
Equipment Type → Failure Modes Library → Risk Assessment → Preventive Task Plans
```

---

## Maintenance Domain (v2 — canonical, 2026)

```
equipment_type_strategies (v2)
    → Apply Strategy → maintenance_programs_v2 (1 doc / equipment, nested tasks)
    → load_schedulable_programs() → scheduled_tasks (planner / Gantt)
    → task_instance_bridge → task_instances (My Tasks execution)
    → work_item_query (My Tasks also reads unbridged scheduled_tasks between bridge runs)

Background jobs:
    apply_strategy → background_jobs → run_background_worker.py (optional sidecar)

reliability_edges (graph)
    equipment → strategy_type, program_task → failure_mode, equipment → program

Legacy (retired for writes; optional read fallback via READ_LEGACY_MAINTENANCE_PROGRAMS):
    maintenance_programs (flat rows)
    maintenance_strategies + /api/maintenance-strategies v1 API (GET only; mutations → 410)
```

| Collection | Role |
|------------|------|
| `equipment_type_strategies` | Canonical strategy per equipment type |
| `maintenance_programs_v2` | Canonical program per equipment |
| `scheduled_tasks` | Horizon occurrences for maintenance planner |
| `task_instances` | Field execution queue (My Tasks) |
| `task_plans` | Form/ad-hoc tasks (separate domain) |
| `reliability_edges` | Traversable relationships for RIL/AI |
