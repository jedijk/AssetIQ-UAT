# Cache Architecture (Unified)

## Problem

Two separate systems caused stale reads:

- `cache_service.py` — entity TTL caches (equipment by id, users, failure modes, stats)
- `query_cache.py` — prefix-based API response cache (e.g. `equipment_nodes:{userId}`)

Equipment mutations often invalidated only one layer.

## Solution

```
┌─────────────────────────────────────────────────────────┐
│                  unified_cache (singleton)               │
├──────────────────────┬──────────────────────────────────┤
│ Entity layer         │ Query layer                       │
│ TTLCache per domain  │ Dict + TTL (db-prefixed keys)     │
│ - equipment          │ - equipment_nodes:*               │
│ - users              │ - equipment_hierarchy:*           │
│ - failure_modes      │ - form_templates, dashboard, …      │
│ - stats              │                                   │
├──────────────────────┴──────────────────────────────────┤
│ invalidate_domain() / invalidate_equipment_related()      │
│   → entity pops + query pattern invalidation + metrics    │
└─────────────────────────────────────────────────────────┘
         ▲                              ▲
         │                              │
  cache_service (facade)        query_cache (facade)
```

## Invalidation events

| Event | Function | Invalidates |
|-------|----------|-------------|
| Equipment CRUD | `invalidate_equipment_related()` | equipment entity keys, `equipment_nodes`, `equipment_hierarchy`, `installations`, `dashboard` |
| Criticality change | same + `reason=criticality_*` | above |
| Forms mutation | `invalidate_domain(FORMS)` | `form_templates` |
| Tasks mutation | `invalidate_domain(TASKS)` | `task_templates`, `my_tasks` |

## Metrics

`unified_cache.get_stats()` returns:

- `hits` / `misses` / `hit_rate` (query layer)
- `entity_hits` / `entity_misses`
- `invalidations`
- `entity_sizes` per domain

## Configuration

TTL presets in `CACHE_TTL` inside `unified_cache.py`. Entity TTLs match legacy `cache_service` constants.

## Observability

Logs use logger `assetiq.cache` with `cache_event` in structured `extra` fields.
