# Route Auth Inventory

Generated: 2026-06-25 19:51 UTC

Regenerate:
```bash
cd backend && python scripts/route_auth_inventory.py --markdown ../docs/platform/ROUTE_AUTH_INVENTORY.md
```

## Summary

| Classification | Count |
|----------------|------:|
| Permission protected | 515 |
| Authenticated only | 196 |
| Public (intentional) | 25 |
| Public (review / fixed in Phase 0) | 0 |
| **Total handlers** | **741** |

> Note: `ai_fm_suggestions` routes inherit `library:write` via router-level `dependencies`.
> `GET /users/{{user_id}}/avatar` validates JWT manually (cookie, bearer, or query token).

## Intentionally public routes

| Method | Path | Handler | File | Reason |
|--------|------|---------|------|--------|
| GET | `/` | `root` | `routes/stats.py` | health / auth / kiosk / GDPR |
| POST | `/accept-token-rotation` | `accept_token_rotation` | `routes/visual_display.py` | Display device pairing (token-based) |
| GET | `/assets/video/background.mp4` | `get_background_video` | `routes/assets.py` | Static marketing asset |
| POST | `/auth/forgot-password` | `forgot_password` | `routes/auth.py` | Authentication flow |
| POST | `/auth/login` | `login` | `routes/auth.py` | Authentication flow |
| POST | `/auth/logout` | `logout` | `routes/auth.py` | Authentication flow |
| POST | `/auth/register` | `register` | `routes/auth.py` | Authentication flow |
| POST | `/auth/reset-password` | `reset_password` | `routes/auth.py` | Authentication flow |
| POST | `/auth/verify-reset-token` | `verify_reset_token` | `routes/auth.py` | Authentication flow |
| GET | `/authorize` | `oidc_authorize` | `routes/auth_oidc.py` | Authentication flow |
| GET | `/board/snapshot` | `device_board_snapshot` | `routes/visual_display.py` | Display device pairing (token-based) |
| POST | `/callback` | `oidc_callback` | `routes/auth_oidc.py` | Authentication flow |
| GET | `/config` | `oidc_config` | `routes/auth_oidc.py` | Authentication flow |
| POST | `/connect` | `connect_device` | `routes/visual_display.py` | Display device pairing (token-based) |
| GET | `/gdpr/privacy-policy` | `get_privacy_policy` | `routes/gdpr.py` | Legal / GDPR pages |
| GET | `/gdpr/terms-of-service` | `get_terms_of_service` | `routes/gdpr.py` | Legal / GDPR pages |
| GET | `/health` | `health_check` | `routes/image_analysis.py` | Health probe |
| GET | `/pairing/{pair_code}/status` | `pairing_status` | `routes/visual_display.py` | Display device pairing (token-based) |
| POST | `/request-pairing` | `request_pairing` | `routes/visual_display.py` | Display device pairing (token-based) |
| GET | `/system/health` | `get_system_health` | `routes/system.py` | Health probe |
| GET | `/timezones` | `get_available_timezones` | `routes/users.py` | health / auth / kiosk / GDPR |
| GET | `/users/{user_id}/avatar` | `get_user_avatar` | `routes/users.py` | health / auth / kiosk / GDPR |
| GET | `/{token}/data` | `get_board_data` | `routes/visual_board_public.py` | Kiosk token URL |
| POST | `/{token}/heartbeat` | `board_heartbeat` | `routes/visual_board_public.py` | Kiosk token URL |
| GET | `/{token}/layout` | `get_board_layout` | `routes/visual_board_public.py` | Kiosk token URL |

## Phase 0 fixes (formerly public, now protected)

| Method | Path | Protection added |
|--------|------|------------------|
| GET | `/download/documentation` | `scheduler:read` |
| GET | `/download/functional-spec` | `scheduler:read` |
| GET | `/spare-parts-import/template` | `spareiq:read` |
| GET | `/template` (PM import) | `library:read` |
| GET | `/equipment-hierarchy/disciplines` | authenticated |
| GET | `/equipment-hierarchy/criticality-profiles` | authenticated |
| GET | `/equipment-hierarchy/iso-levels` | authenticated |
| GET | `/definitions/defaults` | authenticated |

## Remaining public routes requiring review

_None beyond intentionally public routes._

## Special attention areas

### Maintenance & import templates
- PM import template: `library:read` (Phase 0 fix)
- SpareIQ import template: `spareiq:read` (Phase 0 fix)
- Maintenance doc downloads: `scheduler:read` (Phase 0 fix)

### SpareIQ
All mutating SpareIQ routes use `spareiq:read|write|delete` permissions.

### Mobile
Backend mobile task routes use existing task permissions. Frontend `/mobile` shell gated via `canAccessRoute('/mobile')` → `tasks:read`.

### Visual boards
- Authenticated admin routes: `visual_boards.py`, `visual_display_admin.py`
- Public kiosk: `visual_board_public.py` token URLs (intentional)
- Display pairing: `visual_display.py` (device token flow)

## Full public handler list (AST scan)

```
GET    /                                        routes/stats.py:38  [intentional]
POST   /accept-token-rotation                   routes/visual_display.py:197  [intentional]
GET    /assets/video/background.mp4             routes/assets.py:68  [intentional]
POST   /auth/forgot-password                    routes/auth.py:777  [intentional]
POST   /auth/login                              routes/auth.py:335  [intentional]
POST   /auth/logout                             routes/auth.py:444  [intentional]
POST   /auth/register                           routes/auth.py:233  [intentional]
POST   /auth/reset-password                     routes/auth.py:918  [intentional]
POST   /auth/verify-reset-token                 routes/auth.py:887  [intentional]
GET    /authorize                               routes/auth_oidc.py:83  [intentional]
GET    /board/snapshot                          routes/visual_display.py:246  [intentional]
POST   /callback                                routes/auth_oidc.py:106  [intentional]
GET    /config                                  routes/auth_oidc.py:64  [intentional]
POST   /connect                                 routes/visual_display.py:212  [intentional]
GET    /gdpr/privacy-policy                     routes/gdpr.py:1349  [intentional]
GET    /gdpr/terms-of-service                   routes/gdpr.py:1184  [intentional]
GET    /health                                  routes/image_analysis.py:155  [intentional]
GET    /pairing/{pair_code}/status              routes/visual_display.py:96  [intentional]
POST   /request-pairing                         routes/visual_display.py:51  [intentional]
GET    /system/health                           routes/system.py:359  [intentional]
GET    /timezones                               routes/users.py:1076  [intentional]
GET    /users/{user_id}/avatar                  routes/users.py:471  [intentional]
GET    /{token}/data                            routes/visual_board_public.py:29  [intentional]
POST   /{token}/heartbeat                       routes/visual_board_public.py:39  [intentional]
GET    /{token}/layout                          routes/visual_board_public.py:21  [intentional]
```
