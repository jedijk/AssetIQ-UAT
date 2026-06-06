# Work Items API (canonical)

The **Work Items API** (`/api/work-items/*`) is the canonical read/write surface for unified operator work: task instances, unbridged scheduled tasks, and central actions.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/work-items` | List work items for the current user (filters: `open`, `overdue`, `recurring`, `adhoc`, `all`) |
| `GET` | `/work-items/{id}` | Task instance detail |
| `POST` | `/work-items/{id}/start` | Start a task instance |
| `POST` | `/work-items/{id}/complete` | Complete a task instance |
| `GET` | `/work-items/adhoc-plans` | Ad-hoc execution plans |
| `POST` | `/work-items/adhoc-plans/{planId}/execute` | Execute an ad-hoc plan |
| `POST` | `/work-items/actions/{id}/start` | Start an action-as-task |
| `POST` | `/work-items/actions/{id}/complete` | Complete an action-as-task |

Query parameters on `GET /work-items` mirror the legacy `/my-tasks` filters: `filter`, `date`, `equipment_id`, `status`, `discipline`.

## Migration from `/my-tasks`

`GET /my-tasks` remains available but is **deprecated**:

- `Deprecation: true`
- `Sunset: 2026-09-01`
- `Link: </api/work-items/>; rel="successor-version"`

### Frontend

- `frontend/src/lib/apis/tasks.js` — `myTasksAPI` already calls `/work-items`
- Navigation may keep `/my-tasks` as the UI route until sunset; deep links to `/my-tasks?id=…` continue to work
- New integrations should use `/work-items` directly

### Backend

Both routes delegate to `services.work_item_query.fetch_work_items`. No behavioral divergence is intended during the deprecation window.

## Related

- Task scheduler scheduled-task completion: `/maintenance-scheduler/tasks/{id}/complete`
- Task instance CRUD (admin): `/tasks/instances/*`
