# AssetIQ Visual Management Studio — Functional Specification

**Version:** 1.0  
**Date:** June 2026  
**Status:** Phase 1 foundation  
**Companion:** Technical design in `ASSETIQ_VISUAL_MANAGEMENT_STUDIO_TECHNICAL_DESIGN.md`

---

## Objective

Create a Visual Management Studio module that allows users to create, preview, publish, and display AssetIQ-powered visual management boards on shop floor TVs, control rooms, reliability war rooms, maintenance workshops, and executive screens.

The Visual Management Board must operate independently from the main AssetIQ application while consuming live AssetIQ data in a secure read-only manner.

### Primary design goals

- No usernames on TVs
- No passwords on TVs
- No session expiration issues
- No user reauthentication
- Real-time data
- Secure read-only access
- Enterprise-grade security

---

## Core concept

**Boards are not logged into. Boards are published.**

When a board is published, AssetIQ generates a secure Board Token. The token provides access only to that specific board and cannot access any operational AssetIQ functionality.

---

## User roles

### Board Viewer

**Can:**

- View published boards (within AssetIQ admin UI)

**Cannot:**

- Edit boards
- Publish boards
- Delete boards

### Board Editor

**Can:**

- Create boards
- Edit boards
- Configure widgets
- Preview boards

**Cannot:**

- Publish boards

### Board Publisher

**Can:**

- Publish boards
- Unpublish boards
- Generate tokens
- Rotate tokens

### Administrator

**Can:**

- Manage all boards
- Manage templates
- Manage screens
- Manage permissions

---

## Navigation

Add a new module: **Visual Management**

Submenus:

- Boards
- Templates
- Screens
- Analytics

---

## Board lifecycle

### Draft

Board exists only inside AssetIQ. Visible only to authorized users.

Example: *Reliability Board — Extrusion Area* — Status: **Draft**

### Preview

Users can preview the board using real-time data before publishing.

**Route:** `/boards/{id}/preview`

**Features:**

- Real data
- TV preview
- Desktop preview
- Tablet preview
- Full-screen preview

**Screen sizes:** Desktop, Tablet, TV 55", TV 75", TV 98"

Preview should show exactly what operators will see.

### Published

Publishing generates a secure token and public board URL.

| Field | Example |
|-------|---------|
| Board ID | `board_123` |
| Token | `vmb_4fdce9f1fbc437f29f4d9e5c3e1c8a21` |
| URL | `https://app.assetiq.com/vmb/vmb_4fdce9f1fbc437f29f4d9e5c3e1c8a21` |

### Archived

Historical version retained. Read-only.

---

## Board designer

**Route:** `/boards/{id}/edit`

| Area | Contents |
|------|----------|
| Left panel | Widget Library, Layout Settings, Filters, Board Settings |
| Center | Live Preview Canvas |
| Right panel | Widget Configuration, Data Source Configuration |

Supported drag-and-drop layout (Phase 4).

---

## Board settings

| Field | Description |
|-------|-------------|
| Name | Display name |
| Description | Optional summary |
| Board Type | reliability, maintenance, operations, executive, custom |
| Theme | Visual theme identifier |
| Refresh Interval | Polling interval in seconds (default 30) |
| Plant | Optional plant filter |
| Area | Optional area filter |
| Default Presentation Mode | fullscreen, desktop, tablet |

### Board types

- Reliability Board
- Maintenance Board
- Operations Board
- Executive Board
- Custom

---

## Publishing model

Publishing creates a version snapshot. Each publish stores:

- Layout
- Widget configuration
- Filters
- Version number

Version history must support rollback (Phase 4).

---

## Security model

No TV should ever require a user login. Authentication is handled entirely through Board Tokens.

### Board tokens

- 256-bit random tokens
- Cryptographically secure
- Non-sequential
- Non-guessable

Example: `vmb_4fdce9f1fbc437f29f4d9e5c3e1c8a21`

Tokens are stored **hashed** (SHA-256). Raw tokens are never persisted.

### Token permissions

**Allowed:**

- Get board metadata
- Get board layout
- Get board data
- Receive real-time updates (Phase 5)

**Not allowed:**

- Create, edit, or delete records
- Access users, settings, AI, or operational APIs

Board tokens are strictly read-only.

### Multiple tokens per board

Each board can have multiple display tokens (Phase 3).

Example — *Extrusion Reliability Board*:

| Token | Screen |
|-------|--------|
| A | Control Room TV |
| B | Maintenance Workshop TV |
| C | Supervisor Tablet |

Benefits: disable individual screens, track uptime, monitor screen health, rotate tokens independently.

---

## Screen management

### Screen entity

| Field | Description |
|-------|-------------|
| Screen Name | Human label |
| Device ID | Optional device identifier |
| Location | Physical location |
| Assigned Board | Board ID |
| Assigned Token | Token ID |
| Last Seen | Heartbeat timestamp |
| Online Status | online, offline, inactive |

---

## Presentation mode

**Route:** `/vmb/{token}`

**Features:**

- Full-screen
- No menus or navigation
- Auto refresh
- Kiosk mode
- TV optimized

**Optional query parameters:** `?fullscreen=true`, `?rotation=30`

---

## Widget library

| Widget | Description |
|--------|-------------|
| **KPI Card** | Active Exposure, PM Compliance, Open Observations, Critical Risks |
| **Exposure Waterfall** | Total, Covered, Uncovered, Active, Resolved exposure |
| **Observation List** | Asset, Risk, Exposure, Status |
| **Action Queue** | Action, Owner, Due Date, Status |
| **Trend Chart** | Exposure, PM Compliance, Observation Count, Active Risk, Reliability Score |
| **Status Indicator** | GREEN / AMBER / RED board-wide health |

### Reliability status engine

| Status | Conditions |
|--------|------------|
| **GREEN** | No critical observations; no overdue critical actions |
| **AMBER** | Critical observation exists |
| **RED** | Critical observation exists **and** critical overdue action exists |

Example API response:

```json
{
  "status": "RED",
  "reason": "2 Critical Observations"
}
```

---

## Board templates

### Reliability Board

Widgets: Active Exposure, Critical Risks, Investigations, Open Actions, Risk Trends

### Maintenance Board

Widgets: PM Compliance, Backlog, Overdue Tasks, Completed Work

### Operations Board

Widgets: Production, Availability, Active Observations, Alerts

### Executive Board

Widgets: Lifecycle Exposure, Control Coverage, Active Exposure, Resolved Exposure, Exposure Waterfall

---

## Database collections

### `visual_boards`

Board definitions (draft and current working copy).

| Field | Type | Notes |
|-------|------|-------|
| id | string | `board_*` |
| tenant_id | string | Company scope |
| name | string | |
| description | string | optional |
| status | string | draft, published, archived |
| board_type | string | reliability, maintenance, … |
| version | int | Latest published version number |
| widgets | array | Widget configs |
| layout | object | Grid layout metadata |
| theme | string | optional |
| refresh_interval_seconds | int | default 30 |
| plant | string | optional filter |
| area | string | optional filter |
| created_by | string | user id |
| created_at | datetime | |
| updated_at | datetime | |
| published_at | datetime | optional |

### `visual_board_versions`

Published version snapshots.

| Field | Type |
|-------|------|
| id | string |
| board_id | string |
| tenant_id | string |
| version | int |
| layout | object |
| widgets | array |
| filters | object |
| created_at | datetime |
| created_by | string |

### `visual_board_tokens`

Display tokens (hashed).

| Field | Type |
|-------|------|
| id | string |
| board_id | string |
| tenant_id | string |
| token_hash | string | SHA-256 hex |
| screen_name | string | optional |
| is_active | bool |
| version | int | pinned published version |
| created_at | datetime |
| last_used_at | datetime | optional |

### `visual_board_screens`

Registered display devices (Phase 3).

| Field | Type |
|-------|------|
| id | string |
| board_id | string |
| token_id | string |
| tenant_id | string |
| screen_name | string |
| location | string |
| device_id | string | optional |
| last_seen | datetime |
| status | string | online, offline, inactive |

---

## APIs

### Authenticated board APIs (`/api/boards`)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| POST | `/api/boards` | `vmb:write` | Create board |
| GET | `/api/boards` | `vmb:read` | List boards |
| GET | `/api/boards/{id}` | `vmb:read` | Get board |
| PUT | `/api/boards/{id}` | `vmb:write` | Update board |
| DELETE | `/api/boards/{id}` | `vmb:write` | Delete board |
| POST | `/api/boards/{id}/publish` | `vmb:publish` | Publish + issue token |
| POST | `/api/boards/{id}/unpublish` | `vmb:publish` | Revoke public access |
| POST | `/api/boards/{id}/rotate-token` | `vmb:publish` | Rotate active token |
| GET | `/api/boards/{id}/versions` | `vmb:read` | Version history |
| GET | `/api/boards/{id}/preview-data` | `vmb:read` | Live widget data for preview |

### Public board APIs (`/api/vmb/{token}`)

No JWT. Token hash validation only.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/vmb/{token}/layout` | Board structure and widgets |
| GET | `/api/vmb/{token}/data` | Aggregated widget payloads |
| POST | `/api/vmb/{token}/heartbeat` | Screen heartbeat / last-seen |

### Realtime updates (Phase 5)

**Preferred:** WebSocket `/ws/vmb/{token}`

Events: `board_updated`, `widget_updated`, `data_refreshed`

**Fallback:** 30-second polling on `/data`

---

## Analytics (Phase 5)

Track: board views, active screens, screen uptime, most viewed boards, average session duration, last seen per screen.

---

## QR code support (Phase 5)

Every published board generates a QR code for phone/tablet access without AssetIQ login.

---

## Success criteria

A supervisor should be able to:

1. Create a board in under 5 minutes.
2. Preview the board using live data.
3. Publish the board.
4. Open the board on a TV without credentials.
5. Run the board continuously for months without reauthentication.
6. Receive real-time AssetIQ data with less than 30-second latency.
7. Manage screens and tokens centrally from AssetIQ.

---

## Phased delivery summary

| Phase | Scope |
|-------|--------|
| **1 — Foundation** | Collections, CRUD, preview data, KPI/status/observation/waterfall widgets, token auth, publish |
| **2 — Display** | Standalone `/vmb/{token}` frontend, kiosk mode, polling |
| **3 — Screens & tokens** | Multiple tokens, screen registry, heartbeat analytics |
| **4 — Designer** | Drag-and-drop, templates, version rollback |
| **5 — Realtime** | WebSocket push, view analytics, QR codes |
