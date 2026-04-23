# AssetIQ - Product Requirements Document

## Original Problem Statement
Create a full-stack platform (React + FastAPI + MongoDB) for industrial asset management with:
- Mobile landing page, Universal Photo Data Capture
- Cloudflare R2 file storage
- Production Log Ingestion & History Builder (Bulk upload, parsing, MongoDB structured storage, asset history aggregation, dashboard)
- Template Training Workflow for complex Excel parsing
- Direct OpenAI SDK integration (user's own API keys)

## Architecture
- **Frontend**: React (Vite) + Shadcn/UI + Recharts + TailwindCSS
- **Backend**: FastAPI + Motor (async MongoDB)
- **Database**: MongoDB (collections: production_logs, log_parse_templates, form_submissions, equipment_nodes, production_events, etc.)
- **Storage**: Cloudflare R2
- **AI**: OpenAI GPT-4o / Whisper / Vision (user API keys)
- **Email**: Resend

## Core Features Implemented

### Production Log Ingestion System (DONE)
- Upload CSV/XLSX/ZIP files with drag-and-drop
- Template Training System: save reusable parse templates with fuzzy column matching, skip_rows, header_metadata extraction, secondary_sheet merging
- Complex Excel parsing: static asset IDs, specific cell metadata (row/col), secondary sheet joins (Mooney Viscosity from Sample List)
- Batch ingest with template selection
- CRUD endpoints: POST/GET/DELETE /api/production-logs/templates, POST /api/production-logs/batch-ingest

### Log Ingestion Dashboard (DONE - Apr 19, 2026)
- KPI Cards matching Production Dashboard: Total Input, Waste, Yield, Avg Mooney, RSD, Runtime
- Merged Mooney Viscosity chart with toggleable overlays (RPM, Feed, MP4, T Product IR, Magnet Cleaning)
- Separate Input Material card showing all entries
- Production Log table (deduplicated, viscosity-preferred)
- Date + shift time display at top

### Production Dashboard Integration (DONE - Apr 19, 2026)
- Ingested production_logs data automatically surfaces in the main AssetIQ Production Dashboard
- When no form_submissions exist for a date, the dashboard falls back to production_logs collection
- Full KPIs, viscosity chart, production log table, input material, magnet cleanings all render from ingested data
- Backend deduplication: entries with mooney_viscosity preferred over duplicates without

### Backend Deduplication (DONE - Apr 19, 2026)
- GET /api/production-logs/entries aggregation pipeline groups by timestamp+asset_id
- Entries with mooney_viscosity data are preferred ($addFields + $sort + $group)
- Deduplicated count returned for pagination

### AI Features (DONE)
- AI-powered column detection for log parsing
- AI insights generation for production dashboard
- Direct OpenAI SDK (no Emergent LLM key dependency)

## Key API Endpoints
- POST /api/production-logs/templates (Create template)
- GET /api/production-logs/templates (List templates)
- DELETE /api/production-logs/templates/{template_id}
- POST /api/production-logs/batch-ingest
- POST /api/production-logs/batch-ingest-with-template
- GET /api/production-logs/entries (deduplicated)
- GET /api/production-logs/assets
- GET /api/production-logs/stats
- GET /api/production/dashboard (now includes ingested log fallback)

## Key DB Schema
- `log_parse_templates`: {name, file_type, delimiter, skip_rows, base_date_location, header_metadata, secondary_sheet, column_mapping}
- `production_logs`: {timestamp, asset_id, metrics, status, mooney_viscosity, input_material, supplier, lot_no, bag_no, total_waste, clean_magnet_status, clean_magnet_time, production_start_time, production_stop_time, sample_id}

## Key Files
- /app/backend/routes/production_logs.py (Template CRUD, Excel parsing, entries API)
- /app/backend/routes/production.py (Production Dashboard with ingested data fallback)
- /app/frontend/src/pages/SettingsLogIngestionPage.js (Full ingestion UI + dashboard)
- /app/frontend/src/pages/ProductionDashboardPage.js (Main production dashboard)
- /app/backend/routes/gdpr.py (GDPR compliance endpoints)
- /app/frontend/src/pages/SettingsPrivacyPage.js (Privacy & Data settings UI)

## Backlog (Prioritized)
### P1
- Report generation (PowerPoint/PDF) for Causal Investigations
- Offline support with local storage for My Tasks execution
- Migrate AI models from OpenAI GPT-4o to Anthropic Claude 4.5 (awaiting user key preference)

### P2
- QR scan analytics dashboard

### P3
- Break down large pages into modular components (SettingsLogIngestionPage.js ~2000 lines)
- Advanced event detection rule engine for log ingestion

## GDPR Compliance (Implemented Apr 20, 2026)
### Backend APIs
- `GET /api/gdpr/export` - Export all user personal data (Article 15 & 20)
- `POST /api/gdpr/delete-account` - Request account deletion (requires owner approval)
- `GET /api/gdpr/deletion-status` - Check deletion eligibility and data summary
- `GET /api/gdpr/my-deletion-request` - Get user's pending deletion request
- `DELETE /api/gdpr/cancel-deletion-request` - Cancel pending deletion request
- `GET /api/gdpr/deletion-requests` - Owner-only: List all deletion requests
- `POST /api/gdpr/deletion-requests/{id}/action` - Owner-only: Approve/reject requests
- `GET /api/gdpr/terms-of-service` - Returns full Terms of Service (15 sections)
- `GET /api/gdpr/privacy-policy` - Returns full Privacy Policy (9 sections)
- `GET /api/gdpr/consent-status` - Get user consent preferences
- `POST /api/gdpr/consent` - Update consent preferences
- `POST /api/gdpr/accept-terms` - First-login terms acceptance
- `GET /api/gdpr/terms-status` - Check terms acceptance status

### Frontend Pages
- Privacy & Data settings: `/settings/privacy`
- Deletion Requests (owner-only): `/settings/deletion-requests`

### Features
- Data export button (downloads JSON)
- Consent toggles (Essential, Analytics, Marketing, AI Processing)
- Terms of Service accordion (15 sections)
- Privacy Policy accordion (9 sections)
- Account deletion with owner approval workflow
- Email notifications to owners for deletion requests
- Email notifications to users for approval/rejection
- Owner can view, approve, or reject deletion requests with reason

### First-Login Terms Acceptance
- `TermsAcceptanceDialog` with 3 tabs: Summary, Terms of Service, Privacy Policy
- Flow order: Password Change → Terms Acceptance → Intro Tour
- User must check both "Terms of Service" and "Privacy Policy" checkboxes
- "Decline & Logout" option available
- Terms version tracked in user record (`terms_accepted_version`)
- Consent audit trail in `gdpr_consent_log` collection

## AI Vision Photo Viewer (DONE - Feb 2026)
- Form Submissions detail modal now renders the original AI-captured source photo
- Photo path stored as `__ai_scan_photo` entry inside submission `values[]` (value = R2 path `ai-scans/{user_id}/{uuid}.{ext}`)
- Served through authenticated `/api/storage/{path}` endpoint via `AuthenticatedImage`
- Dedicated "AI Vision Photo" section (with `Sparkles` icon) shown above Checklist
- Internal `__ai_scan_photo` field filtered out of Checklist / Insights / Recommendation tallies
- Click-to-enlarge via existing lightbox flow
- File: `/app/frontend/src/pages/FormSubmissionsPage.js` (section ~line 909)

## GDPR Consent Popup Fix (DONE - Apr 20, 2026)
- Fixed race condition in `AuthContext.js` where `fetchUser()` was being called twice after login
- Issue: After `login()` completed, the `useEffect` with `[token]` dependency would fire and call `fetchUser()` again, potentially resetting `mustAcceptTerms` state
- Fix: Added `isAuthenticating` flag to prevent duplicate `fetchUser()` calls during login process
- The flag is set `true` at login start, `false` after login completes or fails
- `useEffect` now checks both `isAuthenticating` and `user` state before calling `fetchUser()`
- File: `/app/frontend/src/contexts/AuthContext.js`



## End of Shift Details Table on Production Dashboard (DONE - Feb 22, 2026)
- Replaced the "Waste & Downtime" chart in the Production Dashboard with an "End of Shift Details" data table
- Backend: Added `END_OF_SHIFT_FORM = "End of shift"` to production forms and builds `end_of_shift_entries` from submissions of template `69dba92cbcbca77f34b27b49`
- Entries include: `datetime`, `date_time_raw`, `total_input`, `total_waste`, `submitted_by`, `submission_id`, `notes`
- Frontend table columns: Date & Time, Input (kg), Waste (kg)
- Row actions: Edit (opens FormExecutionDialog prefilled with submission values, PATCHes via `/api/production/submission/{id}`) and Delete (uses existing confirm flow)
- "Add" button opens the embedded End of Shift form for new submissions, equipment auto-set to Line-90
- `FormExecutionDialog` extended with `submissionId` + `initialValues` props to support edit mode
- Files: `/app/backend/routes/production.py`, `/app/frontend/src/pages/ProductionDashboardPage.js`

## End of Shift Completion Comments Hover Tooltip (DONE - Apr 22, 2026)
- Added hover tooltip to display "Completion Comments" when hovering over End of Shift detail rows
- Backend: `end_of_shift_entries` now includes `notes` field extracted from form submission notes
- Frontend: Rows with notes show a MessageCircle icon next to the date and have a subtle amber background highlight
- Uses Radix UI Tooltip (aliased as RadixTooltip to avoid conflict with Recharts Tooltip)
- Tooltip displays "Completion Comments:" header with the notes content below
- Files: `/app/backend/routes/production.py`, `/app/frontend/src/pages/ProductionDashboardPage.js`


## AI Vision Date Extraction Fix (DONE - Feb 23, 2026)
- Fixed issue where AI Vision did not correctly extract `production_date` in "Big Bag Loading" form (and any form with date/datetime fields)
- Backend (`/app/backend/routes/ai_extract.py`):
  - Auto-upgrades extraction-field `type` to `date`/`datetime` by cross-referencing the mapped target form field type, so older configs saved as `string` still get proper AI guidance
  - Adds explicit date-format rules to the extraction prompt: requires ISO `YYYY-MM-DD`, clarifies European DD-MM-YYYY interpretation, handles Dutch/English month names and 2-digit years
  - Adds `_normalize_date_value()` safety-net: normalizes AI responses (European formats, Dutch months, slashes/dots/dashes, 2-digit years) to strict ISO before returning to frontend
- Frontend (`/app/frontend/src/components/task-execution/TaskExecutionFrame.js`):
  - `handlePhotoAutoFill` now converts `date` field values to `YYYY-MM-DD` (previously only `datetime` was converted) — ensures HTML `<input type="date">` accepts the AI-extracted value
- Frontend (`/app/frontend/src/pages/FormsPage.js`):
  - Added "Date" and "Date & Time" as explicit type options in the extraction-field editor
- Tests: `/app/backend/tests/test_ai_extract_date.py` (12 regression tests covering ISO, European, Dutch months, datetime, two-digit years)
