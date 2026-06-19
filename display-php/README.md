# AssetIQ PHP TV Display

Server-rendered TV kiosk for shop-floor displays. No JavaScript required — compatible with older embedded TV browsers (Samsung Tizen, etc.).

## Requirements

- PHP 8.1+ with `curl` extension
- HTTPS recommended (device tokens in cookies)
- Outbound HTTPS to your AssetIQ API host

## Setup

1. Copy the example config:

   ```bash
   cp config.example.php config.php
   ```

2. Edit `config.php`:
   - **`api_base_url`** — AssetIQ API base URL (no trailing slash), e.g. `https://asset-iq-uat.vercel.app`
   - **`db_env`** — `uat` or `production` (must match where the display is paired)
   - **`refresh_seconds`** — board page auto-refresh interval (default 30)
   - **`cookie_days`** — paired device cookie lifetime (default 365)

3. Deploy the **`public/`** directory as the web document root (or point your vhost at it).

   Example local test with PHP built-in server (from repo root):

   ```bash
   cd display-php/public
   php -S localhost:8080
   ```

   Open `http://localhost:8080/` — you still need `config.php` one level up (`display-php/config.php`).

## Pairing flow

1. Open the display URL on the TV (e.g. `https://display.example.com/`).
2. The TV shows a **6-character code** and pairing instructions.
3. On a logged-in admin device: **Settings → Visual Management → Pair Displays**.
4. Enter the code, choose a board, and click **Pair Device**.
5. The TV polls every 3 seconds and redirects to the board when paired.

### URLs

| URL | Purpose |
|-----|---------|
| `/` or `/index.php` | Redirect to board (if paired) or pair page |
| `/pair.php` | Pairing screen |
| `/pair.php?unpair=1` | Clear cookies and start fresh pairing |
| `/pair.php?new=1` | Request a new pairing code |
| `/board.php` | Live board (auto snapshot if published) |
| `/board.php?mode=canvas` | Force server-rendered canvas widgets |
| `/board.php?mode=snapshot` | Force published snapshot image |

## Architecture

- `bootstrap.php` — config, cookies, API singleton, asset URLs
- `src/DisplayApi.php` — AssetIQ display REST client
- `src/BoardRenderer.php` — full-page HTML for canvas/snapshot/error
- `src/WidgetRenderer.php` — server-side widget HTML
- `src/SvgChart.php` — inline SVG charts for legacy TVs
- `public/` — web entry points and static assets

Cookies (set after pairing): `assetiq_display_device_token`, `assetiq_display_device_id`.

## Notes

- Snapshot mode is used automatically when the board has a published snapshot (`probeSnapshot` HEAD check). Use `?mode=canvas` to debug widget rendering.
- Board pages refresh via `<meta http-equiv="refresh">` — no WebSocket on PHP path.
- Do not commit `config.php`; it contains environment-specific API URLs.
