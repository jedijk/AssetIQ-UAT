# Database Index Report

**Status:** Pending audit (Priority 4)

## Planned scope

Collections to review:

- `equipment_nodes` — hierarchy by `parent_id`, `id`, installation filters
- `tasks` / `task_instances` — assignee, status, due date
- `maintenance_programs` / strategies — installation, equipment links
- `observations` / `threats` — asset, status, dates
- `users` — email, company, role
- `form_templates` / submissions — template id, created_at

## Method

1. Capture `explain()` for top 10 slow aggregations from logs.
2. Compare with existing indexes via `db.collection.getIndexes()`.
3. Add compound indexes only where scans are confirmed.
4. Document each index: purpose, query pattern, expected benefit.

## Success criteria

No collection scans on equipment hierarchy load, task list, or dashboard aggregations at scale.
