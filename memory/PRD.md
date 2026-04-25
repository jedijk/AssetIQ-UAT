# AssetIQ - Product Requirements Document

## Original Problem Statement
Create a robust full-stack platform optimized for multi-environment execution with dynamic database switching, advanced form capabilities, seamless AI integrations, GDPR compliance, version-controlled PWAs, comprehensive log ingestion, and automated data processing.

## Current Version
**v3.6.0** (Updated: April 2026)

## Recent Changes
- [Apr 25, 2026] **AssetIQ Logo on Labels** - Added logo configuration to Smart Labeling:
  - Toggle to enable/disable AssetIQ logo + text on labels (like header branding)
  - User-adjustable logo size (4mm to 15mm slider)
  - Grayscale rendering for thermal printer compatibility
  - Position is automatic based on label preset (standard, compact, qr_only, with_logo, title_date_time, blank)
  - Works on both PDF and HTML (iOS-compatible) print paths
- [Apr 24, 2026] Removed UAT/Prod database switcher badge from top header (now only accessible via Settings → Database Environment)
- [Apr 2026] Sprint 1 of Smart Labeling System shipped:
  - Preset-based label designer (standard / compact / qr_only / with_logo)
  - Template CRUD + duplicate + soft-archive + versioning
  - PDF preview & print endpoints (reportlab + qrcode, cap 500 assets/job)
  - QR target configurable per template (asset_page / inspection_form / maintenance_request / custom_url with {asset_id} substitution)
  - Print job history; cache invalidated after print
  - New route `/labels`; menu link added
  - 22/22 backend pytest cases green; frontend flow verified
- [Apr 2026] Input Material card — production date now visible on mobile.
- [Apr 2026] Observation Related Activity timeline: Tasks removed (shows only Observations, Actions, Investigations).
- [Apr 2026] UAT environment provisioning complete:
  - MongoDB `assetiq` → `assetiq-UAT` cloned (32,472 documents)
  - Cloudflare R2 `assetiq-files` → `assetiq-files-uat` mirrored (2,230 objects / 242 MB)
  - Created `/app/scripts/r2_copy_to_uat.py` as reusable sync tool
- [Apr 2026] Observation Related Activity timeline: Tasks removed (now shows only Observations, Actions, Investigations per requirements). Fixed task-title field lookup and completed_at display for any downstream task views.
- [Dec 2025] Removed Total Input fallback - now calculated ONLY from End of Shift entries (no longer sums FEED from ingested logs)
- [Dec 2025] Added registration spam protection:
  - Rate limiting (3/minute per IP)
  - Honeypot field detection
  - Disposable email blocking (400+ domains)
  - reCAPTCHA v3 ready (disabled by default)
  - Auto-cleanup of pending accounts after 48 hours

## Core Features Implemented

### Production Dashboard
- Dual-source rendering merging `form_submissions` and `production_logs`
- Inline editing for both manual forms and ingested CSV logs
- Mobile-optimized cards showing: RPM, Feed, MP4, T Product IR, Viscosity
- Mobile editing support for Mooney Viscosity values

### Form Designer
- Universal AI Vision data capture with photo extraction
- Date type support with automatic normalization
- Auto-pairing: Mooney Viscosity forms automatically sync timestamps with latest unpaired Extruder Settings

### AI Chat
- Conversational UI with auto-skip timer (fixed infinite reset bug)
- Smart equipment matching with full word boundary detection
- Auto-selection bypass when exact equipment name/tag matches

### GDPR Compliance Suite
- User data management
- Consent tracking
- Data export/deletion capabilities

### PWA Support
- Offline-capable progressive web app
- Version-controlled cache keys

## Technical Architecture

```
/app/
├── backend/
│   ├── routes/
│   │   ├── ai_extract.py (AI Vision extraction & normalization)
│   │   ├── production.py (Dashboard patching & log aggregation)
│   │   ├── chat.py (AI chat endpoints)
│   │   ├── forms.py (Form templates & submissions CRUD)
│   ├── services/
│   │   ├── form_service.py (Auto-pairing viscosity logic)
│   ├── chat_handler_v2.py (AI Chat state machine)
│   ├── tests/ (Pytest regression suite)
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── ProductionDashboardPage.js (Dashboard UI)
│   │   │   ├── FormsPage.js (Form Designer)
│   │   ├── components/
│   │   │   ├── ChatSidebar.js (AI chat UI)
```

## Key API Endpoints
- `PATCH /api/production/submission/{submission_id}` - Edit forms/logs
- `POST /api/ai/extract` - AI Vision extraction
- `POST /api/form-submissions` - Submit forms with auto-pairing

## Database Collections
- `form_submissions`: Manual form entries with `auto_paired_to_extruder_id`
- `production_logs`: Ingested CSV data with editable metrics

## 3rd Party Integrations
- OpenAI GPT-4o / Vision (User API Key)
- Cloudflare R2 Storage (User API Keys)
- Resend Emails (User API Key)

## Completed Work (Recent)
- [Dec 2025] v3.5.8 version bump
- [Dec 2025] Mobile Mooney Viscosity editing
- [Dec 2025] Auto-pairing viscosity to extruder samples
- [Dec 2025] Mobile dashboard metric display optimization
- [Dec 2025] Production log inline editing fix
- [Dec 2025] Chat equipment auto-selection
- [Dec 2025] Chat auto-skip timer fix
- [Dec 2025] AI Vision date extraction fix

## Prioritized Backlog

### P0 (Critical)
- None currently

### P1 (High Priority)
- Report generation (PowerPoint/PDF) for Causal Investigations
- Offline support with local storage for My Tasks execution
- Claude 4.5 migration (pending user direction)

### P2 (Medium Priority)
- QR scan analytics dashboard

### P3 (Low Priority)
- Code refactoring: Break down large pages into modular components
  - `ProductionDashboardPage.js` (2200+ lines)
  - `DashboardPage.js` (1900+ lines)
  - `FormsPage.js`
  - `SettingsUserManagementPage.js`
- Advanced event detection rule engine for log ingestion

## Testing
- Backend: Pytest suite at `/app/backend/tests/`
- Test files: `test_chat_full_match.py`, `test_production_patch.py`, `test_viscosity_pairing.py`

## Test Credentials
See `/app/memory/test_credentials.md`
