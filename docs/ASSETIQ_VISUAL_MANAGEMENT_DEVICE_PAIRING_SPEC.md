# AssetIQ Visual Management Device Pairing System — Functional Specification

**Version:** 1.0  
**Date:** June 2026  
**Status:** Planned (Phase 4+)  
**Parent module:** Visual Management Studio  
**Companion docs:**

- `ASSETIQ_VISUAL_MANAGEMENT_STUDIO_FUNCTIONAL_SPEC.md` — board authoring, publish, and display
- `ASSETIQ_VISUAL_MANAGEMENT_STUDIO_TECHNICAL_DESIGN.md` — backend architecture and collections

---

## Objective

Provide a secure, enterprise-grade mechanism for connecting TVs, control room displays, tablets, and shop floor screens to AssetIQ Visual Management Boards **without requiring**:

- User accounts
- User passwords
- SSO authentication
- Session management
- Periodic re-login

The system should operate similarly to:

- Microsoft Teams Rooms
- YouTube TV pairing
- Spotify Connect
- Slack Device Registration

The display becomes a **managed AssetIQ device** rather than a logged-in user.

### Relationship to board tokens (current)

Phase 2–3 VMB uses **board tokens** (`/vmb/{token}`) — a URL pasted or QR-scanned onto a display. Device pairing (this spec) replaces manual URL handling with **admin-approved registration**, persistent **device tokens**, and centralized **screen management**. Board tokens remain valid for ad-hoc sharing; paired devices are the preferred enterprise path for fixed installations.

---

## Business problem

Current dashboard systems require:

- User credentials
- Browser sessions
- Password resets
- Session refreshes
- Reauthentication

This creates operational issues for:

- Shop floor TVs
- Reliability war rooms
- Maintenance workshops
- Control room screens

AssetIQ must provide persistent display devices that can run continuously for months without user interaction.

---

## Solution overview

1. A display device registers itself with AssetIQ.
2. The device receives a temporary pairing code.
3. An AssetIQ administrator pairs the device with a Visual Management Board.
4. AssetIQ issues a device token.
5. The device becomes permanently associated with the board until reassigned.

---

## Device lifecycle

### Stage 1 — Unpaired

Device is unknown.

| | |
|---|---|
| **Status** | `UNPAIRED` |
| **Capabilities** | Generate pairing code; request pairing |
| **Cannot** | View boards; access data |

### Stage 2 — Pairing requested

Device requests pairing. AssetIQ generates a pairing code and device registration request.

**Example:**

```
Pair Code:  A7KD92
Expires:    10 minutes
```

### Stage 3 — Paired

Administrator approves pairing. Device receives device token and board assignment.

| | |
|---|---|
| **Status** | `PAIRED` |

### Stage 4 — Active

Device displays board.

| | |
|---|---|
| **Status** | `ACTIVE` |
| **Capabilities** | Read board layout; read board data; receive realtime updates |
| **Cannot** | Modify data; access application |

### Stage 5 — Disabled

Administrator disables device.

| | |
|---|---|
| **Status** | `DISABLED` |
| **Effect** | Device immediately loses access |

---

## Device registration flow (display)

### TV startup

User opens:

```
https://app.assetiq.com/display
```

Display shows:

```
AssetIQ Display

Pair this device

Code:          A7KD92
Expires in:    09:59
```

Device automatically refreshes pairing code when expired.

---

## Administrator pairing flow

Navigate:

```
Visual Management → Screens → Register Screen
```

Enter pairing code: `A7KD92`

AssetIQ retrieves pending pairing request and displays:

| Field | Example |
|-------|---------|
| Device Name | Samsung TV |
| Browser | Chrome |
| Resolution | 3840×2160 |
| Detected Location | Control Room |

### Assign board

| Field | Example |
|-------|---------|
| Board | Extrusion Reliability Board |
| Screen Name (optional) | Control Room TV |
| Location (optional) | Plant A |
| Area (optional) | Extrusion |

Press **Pair Device**.

### Device activation

System issues device token, e.g. `dvc_8f2ab67c91de2f4c8d1e9f7a`.

- Device stores token securely (local storage / secure enclave where available).
- Device immediately loads assigned board.

---

## Screen management

**Route:** `/visual-management/screens`

### Screen list columns

- Screen Name
- Board
- Location
- Status
- Last Seen
- Resolution
- Uptime

### Actions

- View
- Reassign Board
- Disable
- Rename
- Delete
- Rotate Device Token

---

## Device statuses

| Status | Description |
|--------|-------------|
| **Unpaired** | Waiting for pairing |
| **Pending** | Pairing request exists; awaiting approval |
| **Active** | Connected and displaying board |
| **Offline** | No heartbeat received |
| **Disabled** | Administrator disabled device |

---

## Screen detail page

**Route:** `/visual-management/screens/{id}`

### Device information

- Screen Name
- Device ID
- Board
- Location
- Browser
- Resolution

### Connection information

- Last Seen
- Uptime
- Token Age

### Management

- Reassign Board
- Rotate Token
- Disable Device
- Delete Device

---

## Device heartbeat system

Every device sends heartbeat.

| | |
|---|---|
| **Interval** | 60 seconds |
| **Endpoint** | `POST /api/display/heartbeat` |

**Request:**

```json
{
  "deviceId": "device_123"
}
```

**Updates:**

- Last Seen
- Online Status
- Current Board Version

---

## Pairing code system

### Generation

| | |
|---|---|
| **Format** | 6 characters, uppercase, human-readable |
| **Example** | `A7KD92` |

**Rules:**

- Uppercase only
- Human readable
- No ambiguous characters

**Avoid:** `0`/`O`, `1`/`I`

### Expiration

| | |
|---|---|
| **Default** | 10 minutes |

After expiration: code invalidated; device generates new code.

---

## Device tokens

### Purpose

Permanent authentication for paired devices.

**Example:** `dvc_8f2ab67c91de2f4c8d1e9f7a`

### Permissions

**Allowed:**

- Read assigned board
- Read board data
- Receive realtime updates
- Send heartbeat

**Denied:**

- Create, update, delete
- User APIs
- Admin APIs
- Operational APIs

### Token rotation

Administrator may rotate token:

1. New token issued
2. Old token revoked
3. Device reconnects automatically (via `/api/display/connect` or WebSocket re-auth)

---

## Board assignment

Each device has one active board.

| Device | Board |
|--------|-------|
| Control Room TV | Reliability Board |
| Maintenance Workshop TV | Maintenance Board |
| Supervisor Tablet | Executive Board |

### Future enhancement — board playlists

Support rotation schedules, e.g.:

- 08:00 — Reliability Board
- 08:30 — Production Board
- 09:00 — Executive Board

Rotation interval configurable.

---

## Database collections

### `visual_display_devices`

```json
{
  "id": "device_123",
  "screenName": "Control Room TV",
  "status": "active",
  "location": "Plant A",
  "boardId": "board_456",
  "tokenHash": "…",
  "lastSeen": "…",
  "createdAt": "…"
}
```

### `visual_display_pairings`

```json
{
  "id": "pair_123",
  "pairCode": "A7KD92",
  "expiresAt": "…",
  "deviceFingerprint": "…",
  "status": "pending"
}
```

### `visual_display_events`

```json
{
  "id": "event_123",
  "deviceId": "device_123",
  "event": "connected",
  "timestamp": "…"
}
```

Used for diagnostics and audit.

---

## APIs

### Request pairing

`POST /api/display/request-pairing`

**Response:**

```json
{
  "pairCode": "A7KD92",
  "expiresIn": 600
}
```

### Validate pairing (admin preview)

`GET /api/display/pairing/{pairCode}`

Returns pending device information.

### Complete pairing (admin)

`POST /api/display/pairing/complete`

**Request:**

```json
{
  "pairCode": "A7KD92",
  "boardId": "board_123",
  "screenName": "Control Room TV"
}
```

**Response:**

```json
{
  "deviceId": "device_123",
  "deviceToken": "dvc_xxxxx"
}
```

> **Note:** Raw `deviceToken` is returned once at pairing completion only; stored hashed thereafter.

### Device connect

`POST /api/display/connect`

**Request:**

```json
{
  "deviceToken": "dvc_xxxxx"
}
```

**Response:**

```json
{
  "boardId": "board_123",
  "boardVersion": 4
}
```

### Heartbeat

`POST /api/display/heartbeat`

**Request:**

```json
{
  "deviceId": "device_123"
}
```

### Device configuration

`GET /api/display/config`

**Headers:**

```
Authorization: DeviceToken dvc_xxxxx
```

**Response:**

```json
{
  "boardId": "board_123",
  "refreshInterval": 30
}
```

### Board layout

`GET /api/display/board/layout`

Returns widget layout for assigned board.

### Board data

`GET /api/display/board/data`

Returns realtime board data for assigned board.

---

## Realtime updates

**Preferred:** WebSocket

**Endpoint:** `/ws/display`

**Auth:** device token in query string or first message (same hash lookup as REST).

**Events:**

| Event | Description |
|-------|-------------|
| `board_updated` | Layout or version changed |
| `board_reassigned` | Device assigned to different board |
| `board_unpublished` | Assigned board no longer published |
| `data_updated` | Widget data refresh |

**Fallback:** poll `GET /api/display/board/data` every `refreshInterval` seconds.

---

## Security requirements

- Pairing codes expire automatically
- Device tokens stored hashed (SHA-256); raw tokens never persisted
- Device tokens shown to administrator **once** at pairing completion
- Device cannot access AssetIQ application UI or operational APIs
- Device limited to assigned board (tenant scope from device record)
- Device permissions strictly read-only
- Device audit trail maintained in `visual_display_events`

---

## Frontend routes

| Route | Purpose |
|-------|---------|
| `/display` | Unpaired device pairing UI (kiosk) |
| `/display/board` | Active paired device board view |
| `/visual-management/screens` | Admin screen list |
| `/visual-management/screens/{id}` | Screen detail and management |

---

## Success criteria

A maintenance supervisor should be able to:

1. Open a browser on a new TV.
2. See a pairing code.
3. Register the screen from AssetIQ in less than 30 seconds.
4. Assign a board.
5. Have the screen automatically start displaying live AssetIQ data.
6. Run continuously for months without login or reauthentication.
7. Reassign boards remotely without touching the TV.
8. Disable lost or retired devices instantly.

---

## Phased delivery (proposed)

| Phase | Scope |
|-------|--------|
| **4a — Pairing core** | Collections, request/complete pairing APIs, `/display` pairing UI, admin register flow |
| **4b — Device runtime** | Device token auth, connect/config/layout/data APIs, `/display/board` kiosk |
| **4c — Screen admin** | Screen list/detail, reassign, disable, rotate token, heartbeat analytics |
| **4d — Realtime** | `/ws/display`, board reassignment push, offline detection |
| **5 — Playlists** | Scheduled board rotation per device |

---

## Implementation notes

- Reuse widget layout and data aggregation from `visual_board_data_service.py`; device APIs delegate to the same read paths as `/api/vmb/{token}` after resolving assignment from device token.
- Extend `visual_board_screens` or migrate to `visual_display_devices` — prefer dedicated collections per this spec to avoid conflating legacy manual screen registration with pairing lifecycle.
- `Authorization: DeviceToken {raw}` header scheme mirrors industry device auth patterns; do not reuse JWT or session cookies on display clients.
